import { NextRequest, NextResponse } from "next/server";
import { lookupFood } from "@pack/db";
import { requireUserId } from "../../../../lib/auth";

export const runtime = "nodejs";

// POST /api/food/lookup { name, barcode? } -> macros or { found:false } (never invented).
// Called to resolve MealItem.lookupNeeded=true items after a parse.
export async function POST(req: NextRequest) {
  const userId = await requireUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, barcode } = (await req.json()) as { name?: string; barcode?: string };
  if (!name && !barcode) {
    return NextResponse.json({ error: "name or barcode required" }, { status: 400 });
  }

  const macros = await lookupFood({ name: name ?? "", barcode });
  return NextResponse.json(macros ? { found: true, macros } : { found: false });
}
