import { prisma } from "./index.js";

/**
 * Food macro lookup. Decision (Blueprint Section 5): Open Food Facts PRIMARY
 * (global, barcode-rich, international/ethnic coverage, no API key), USDA FDC
 * FALLBACK (lab-grade whole-food macros, US-centric). We never invent macros;
 * a miss returns null and the item stays lookup_needed for the user to confirm.
 *
 * Chain: OFF-by-barcode -> OFF-by-name -> USDA-by-name -> null.
 */
export interface FoodMacros {
  canonicalName: string;
  kcalPer100g: number | null;
  proteinPer100g: number | null;
  carbPer100g: number | null;
  fatPer100g: number | null;
  sourceApi: "off" | "usda_fdc";
  sourceRef: string | null;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && !Number.isNaN(v) ? v : null;

function normalizeKey(name: string): string {
  return name.trim().toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}

async function offByBarcode(barcode: string): Promise<FoodMacros | null> {
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,nutriments,code`);
  if (!r.ok) return null;
  const j: any = await r.json();
  if (j.status !== 1 || !j.product) return null;
  return fromOffProduct(j.product, barcode);
}

async function offByName(name: string): Promise<FoodMacros | null> {
  const r = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(name)}&search_simple=1&action=process&json=1&page_size=1&fields=product_name,nutriments,code`);
  if (!r.ok) return null;
  const j: any = await r.json();
  const p = j.products?.[0];
  return p ? fromOffProduct(p, p.code ?? null) : null;
}

function fromOffProduct(p: any, ref: string | null): FoodMacros | null {
  const n = p.nutriments || {};
  const kcal = num(n["energy-kcal_100g"]);
  const protein = num(n["proteins_100g"]);
  if (kcal == null && protein == null) return null; // no usable data
  return {
    canonicalName: p.product_name || "Unknown",
    kcalPer100g: kcal,
    proteinPer100g: protein,
    carbPer100g: num(n["carbohydrates_100g"]),
    fatPer100g: num(n["fat_100g"]),
    sourceApi: "off",
    sourceRef: ref,
  };
}

async function usdaByName(name: string): Promise<FoodMacros | null> {
  const key = process.env.USDA_FDC_API_KEY;
  if (!key) return null;
  const r = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${key}&query=${encodeURIComponent(name)}&pageSize=1&dataType=Foundation,SR%20Legacy`);
  if (!r.ok) return null;
  const j: any = await r.json();
  const f = j.foods?.[0];
  if (!f) return null;
  const pick = (names: string[], unit?: string): number | null => {
    const hit = (f.foodNutrients || []).find((x: any) =>
      names.includes(x.nutrientName) && (!unit || x.unitName === unit));
    return num(hit?.value);
  };
  return {
    canonicalName: f.description || name,
    kcalPer100g: pick(["Energy"], "KCAL"),
    proteinPer100g: pick(["Protein"]),
    carbPer100g: pick(["Carbohydrate, by difference"]),
    fatPer100g: pick(["Total lipid (fat)"]),
    sourceApi: "usda_fdc",
    sourceRef: String(f.fdcId ?? ""),
  };
}

/** Resolve macros for an item. Caches the result into the shared FoodItem catalog. */
export async function lookupFood(opts: { name: string; barcode?: string }): Promise<FoodMacros | null> {
  const key = normalizeKey(opts.name);

  // Cache hit in our own catalog first.
  const cached = await prisma.foodItem.findUnique({ where: { normalizedKey: key } });
  if (cached && cached.kcalPer100g != null) {
    return {
      canonicalName: cached.canonicalName,
      kcalPer100g: cached.kcalPer100g, proteinPer100g: cached.proteinPer100g,
      carbPer100g: cached.carbPer100g, fatPer100g: cached.fatPer100g,
      sourceApi: (cached.sourceApi as any) ?? "off", sourceRef: cached.sourceRef,
    };
  }

  const result =
    (opts.barcode ? await offByBarcode(opts.barcode).catch(() => null) : null) ??
    (await offByName(opts.name).catch(() => null)) ??
    (await usdaByName(opts.name).catch(() => null));

  if (result) {
    await prisma.foodItem.upsert({
      where: { normalizedKey: key },
      update: {
        kcalPer100g: result.kcalPer100g, proteinPer100g: result.proteinPer100g,
        carbPer100g: result.carbPer100g, fatPer100g: result.fatPer100g,
        sourceApi: result.sourceApi, sourceRef: result.sourceRef,
      },
      create: {
        canonicalName: result.canonicalName, normalizedKey: key,
        kcalPer100g: result.kcalPer100g, proteinPer100g: result.proteinPer100g,
        carbPer100g: result.carbPer100g, fatPer100g: result.fatPer100g,
        sourceApi: result.sourceApi, sourceRef: result.sourceRef,
      },
    });
  }
  return result;
}
