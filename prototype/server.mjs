// Pack prototype server — zero dependencies (Node 18+ global fetch).
// Serves index.html and proxies POST /parse to the real Claude parser so you can
// test the UX in a browser without Expo / Android Studio.
//
//   PowerShell:  $env:ANTHROPIC_API_KEY="sk-ant-..."; node prototype/server.mjs
//   bash:        ANTHROPIC_API_KEY=sk-ant-... node prototype/server.mjs
//   then open    http://localhost:5178
//
// No API key? The server still runs and returns a canned mock parse so you can see the UI.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env (repo root and prototype/) so you don't have to set shell env vars.
function loadEnv(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv(join(__dirname, "..", ".env"));
loadEnv(join(__dirname, ".env"));

const PORT = process.env.PORT || process.env.PACK_PROTO_PORT || 5178;
const MODEL = process.env.PACK_PROTO_MODEL || "claude-sonnet-5";
const FALLBACK_MODEL = "claude-haiku-4-5";
const KEY = process.env.ANTHROPIC_API_KEY;

// --- Parser prompt + tool schema (kept in sync with packages/parser) ---
const SYSTEM_PROMPT = `You convert a user's messy, multi-lingual free-text (or transcribed voice)
fitness log into STRICT structured data by calling the emit_parsed_log tool.
You NEVER reply in prose. You ALWAYS call the tool exactly once.
Input may mix Hebrew, English, Spanish, Russian, Arabic, and Paraguayan Guarani in the SAME string.
Preserve each item's original wording in verbatim_name and add a normalized_english_name.
Diet: one meal_item per food; keep quantity, unit, and fractions.
  Fractions/portion words are REASONING not lookup: "חמישית"=0.2, half=0.5, "רבע"=0.25, a third=0.333, shlish=0.333.
  NEVER invent macros. If unsure, set lookup_needed=true and fill normalized_english_name.
Workout: session -> set_groups -> sets (ordered). Detect kind from hints:
  "+" small rest -> drop_set or compound_pair; "drop" -> drop_set; "twins" -> set is_twins=true;
  "superset"/"then" -> superset; "cluster" -> cluster; "rest-pause" -> rest_pause.
  Bodyweight -> unit="bw", is_bodyweight=true, load=null.
  "Set N uncounted" -> is_uncounted=true, reps=null. NEVER drop it.
  Typos: 70kx3=70kg x3; 110k=110kg.
Body metric: "post-workout weight 64.7kg" -> metric_type=weight value=64.7; also sleep_hours, hrv, resting_hr, subjective_mood, girth_*.
Every meal_item/set_group/set gets confidence_score 0..1. For anything < 0.75 add a needs_review item
  with a plain-English yes/no question. Unknown numbers => null, not 0. Preserve order and verbatim text.`;

const TOOL = {
  name: "emit_parsed_log",
  description: "Emit the structured parse. Call exactly once.",
  input_schema: {
    type: "object",
    required: ["entries", "needs_review"],
    properties: {
      entries: { type: "array", items: { type: "object", properties: {
        kind: { type: "string", enum: ["diet","workout","body_metric","mixed"] },
        meal_items: { type: "array", items: { type: "object",
          required: ["verbatim_name","lookup_needed","confidence_score"], properties: {
          verbatim_name: { type: "string" }, normalized_english_name: { type: ["string","null"] },
          quantity: { type: ["number","null"] }, fraction_value: { type: ["number","null"] },
          unit: { type: ["string","null"] }, lookup_needed: { type: "boolean" },
          confidence_score: { type: "number" } } } },
        workout_session: { type: ["object","null"], properties: {
          duration_min: { type: ["integer","null"] }, post_weight_kg: { type: ["number","null"] },
          set_groups: { type: "array", items: { type: "object",
            required: ["verbatim_name","kind","order_index","sets","confidence_score"], properties: {
            verbatim_name: { type: "string" },
            kind: { type: "string", enum: ["straight","superset","giant_set","drop_set","cluster","rest_pause","compound_pair"] },
            order_index: { type: "integer" }, confidence_score: { type: "number" },
            sets: { type: "array", items: { type: "object",
              required: ["order_index","unit","is_twins","is_uncounted","is_bodyweight","confidence_score"], properties: {
              order_index: { type: "integer" }, load: { type: ["number","null"] },
              unit: { type: "string", enum: ["kg","lb","bw","band","rpe"] }, reps: { type: ["integer","null"] },
              is_twins: { type: "boolean" }, is_uncounted: { type: "boolean" }, is_bodyweight: { type: "boolean" },
              rir: { type: ["integer","null"] }, rest_after_sec: { type: ["integer","null"] },
              notes: { type: ["string","null"] }, confidence_score: { type: "number" } } } } } } } } },
        body_metrics: { type: "array", items: { type: "object", required: ["metric_type","value"], properties: {
          metric_type: { type: "string" }, value: { type: "number" }, unit: { type: ["string","null"] } } } } } } },
      needs_review: { type: "array", items: { type: "object", required: ["question","target","verbatim"], properties: {
        question: { type: "string" }, target: { type: "string" }, verbatim: { type: "string" } } } }
    }
  }
};

// Canned mock so the UI works with no API key.
const MOCK = {
  entries: [
    { kind: "diet", meal_items: [
      { verbatim_name: "5 ביצים", normalized_english_name: "5 whole eggs", quantity: 5, fraction_value: null, unit: "unit", lookup_needed: false, confidence_score: 0.95 },
      { verbatim_name: "חמישית גמבה צהובה", normalized_english_name: "yellow bell pepper", quantity: 1, fraction_value: 0.2, unit: "portion", lookup_needed: false, confidence_score: 0.82 },
      { verbatim_name: "שייק חלבון (מנה 24 גרם)", normalized_english_name: "protein shake, 24g serving", quantity: 1, fraction_value: null, unit: "serving", lookup_needed: true, confidence_score: 0.7 },
      { verbatim_name: "1 mbeju", normalized_english_name: "mbeju (cassava-cheese flatbread)", quantity: 1, fraction_value: null, unit: "unit", lookup_needed: true, confidence_score: 0.55 }
    ] },
    { kind: "workout", workout_session: { duration_min: 90, post_weight_kg: 64.7, set_groups: [
      { verbatim_name: "dilgiot", kind: "straight", order_index: 1, confidence_score: 0.6, sets: [
        { order_index: 1, load: null, unit: "bw", reps: 12, is_twins: false, is_uncounted: false, is_bodyweight: true, rir: null, rest_after_sec: null, confidence_score: 0.9 } ] },
      { verbatim_name: "Cable triceps", kind: "drop_set", order_index: 2, confidence_score: 0.9, sets: [
        { order_index: 1, load: 35, unit: "kg", reps: 12, is_twins: false, is_uncounted: false, is_bodyweight: false, rir: null, rest_after_sec: null, confidence_score: 0.95 },
        { order_index: 2, load: 42.5, unit: "kg", reps: 13, is_twins: false, is_uncounted: false, is_bodyweight: false, rir: null, rest_after_sec: null, confidence_score: 0.95 },
        { order_index: 3, load: 50, unit: "kg", reps: 7, is_twins: false, is_uncounted: false, is_bodyweight: false, rir: null, rest_after_sec: 0, confidence_score: 0.9, notes: "drop" } ] },
      { verbatim_name: "Jump rope", kind: "straight", order_index: 3, confidence_score: 0.95, sets: [
        { order_index: 1, load: null, unit: "bw", reps: null, is_twins: false, is_uncounted: true, is_bodyweight: true, rir: null, rest_after_sec: null, confidence_score: 0.9, notes: "uncounted" },
        { order_index: 2, load: null, unit: "bw", reps: 75, is_twins: false, is_uncounted: false, is_bodyweight: true, rir: null, rest_after_sec: null, confidence_score: 0.95 } ] }
    ] } }
  ],
  needs_review: [
    { question: "Did 'dilgiot' mean 'Dips'?", target: "set_group", verbatim: "dilgiot" },
    { question: "Which protein powder is the 24g shake? We'll pull its macros.", target: "meal_item", verbatim: "שייק חלבון" },
    { question: "Is 'mbeju' a cassava-cheese flatbread (~250 kcal)?", target: "meal_item", verbatim: "1 mbeju" }
  ]
};

async function callClaude(text, source, imageBase64) {
  if (!KEY) return { data: MOCK, model: "mock (no ANTHROPIC_API_KEY)", mocked: true };
  const content = [];
  if (source === "photo" && imageBase64) {
    const m = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (m) content.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
  }
  content.push({ type: "text", text: text || "(image only — identify the meal)" });

  const tryModel = async (model) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: 4096, system: SYSTEM_PROMPT,
        tools: [TOOL], tool_choice: { type: "tool", name: "emit_parsed_log" },
        messages: [{ role: "user", content }],
      }),
    });
    const bodyText = await res.text();
    if (!res.ok) {
      const err = new Error(`Anthropic ${res.status}: ${bodyText}`);
      err.status = res.status;
      throw err;
    }
    const tool = (JSON.parse(bodyText).content || []).find((b) => b.type === "tool_use");
    if (!tool) throw new Error("No tool_use in response");
    return { data: tool.input, model, mocked: false };
  };

  try {
    return await tryModel(MODEL);
  } catch (e) {
    // If the model id is rejected (404 not_found / 400 invalid model), retry with a known-good one.
    if ((e.status === 404 || e.status === 400) && MODEL !== FALLBACK_MODEL) {
      console.warn(`Model "${MODEL}" rejected (${e.status}); retrying with ${FALLBACK_MODEL}`);
      return await tryModel(FALLBACK_MODEL);
    }
    throw e;
  }
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    const html = await readFile(join(__dirname, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(html);
  }
  if (req.method === "GET" && req.url === "/icon.svg") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#38805f"/><stop offset="1" stop-color="#245539"/></linearGradient></defs>
<rect width="64" height="64" rx="15" fill="url(#g)"/>
<text x="32" y="43" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-size="40" font-weight="600" fill="#FBF7EF">P</text>
<rect x="24" y="48" width="16" height="4" rx="2" fill="#C4623C"/>
</svg>`;
    res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-cache" });
    return res.end(svg);
  }
  if (req.method === "GET" && req.url === "/manifest.webmanifest") {
    res.writeHead(200, { "content-type": "application/manifest+json" });
    return res.end(JSON.stringify({
      name: "Pack", short_name: "Pack", display: "standalone",
      background_color: "#F5F0E6", theme_color: "#2F6B4F", start_url: "/", scope: "/", orientation: "portrait",
      icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
    }));
  }
  if (req.method === "GET" && req.url === "/sw.js") {
    const js = await readFile(join(__dirname, "sw.js"));
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "service-worker-allowed": "/" });
    return res.end(js);
  }
  if (req.method === "GET" && req.url === "/mode") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ live: !!KEY, model: MODEL }));
  }
  if (req.method === "POST" && req.url === "/parse") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const { text, source, imageBase64 } = JSON.parse(body || "{}");
        const out = await callClaude(text, source, imageBase64);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(out));
      } catch (e) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: String(e.message || e) }));
      }
    });
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`\n  Pack prototype running:  http://localhost:${PORT}`);
  console.log(`  Model: ${MODEL}   ${KEY ? "(live Claude)" : "(MOCK — set ANTHROPIC_API_KEY for real parsing)"}\n`);
});
