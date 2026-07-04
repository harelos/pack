/**
 * Parser eval harness. Field-level accuracy over eval/blobs.json.
 * Usage: ANTHROPIC_API_KEY=... npm run eval
 *
 * Add cases to blobs.json to grow toward the 50-blob target (Blueprint Wk2 gate).
 * Each assertion is checked against the real parser output.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseLog } from "../src/parse.js";
import type { ParsedLog, ParsedSetGroup } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Assertion {
  type: string;
  [k: string]: unknown;
}
interface Case {
  id: string;
  source: "text" | "voice" | "photo";
  input: string;
  expect: Assertion[];
}

const cases: Case[] = JSON.parse(
  readFileSync(join(__dirname, "blobs.json"), "utf8")
);

function groups(d: ParsedLog): ParsedSetGroup[] {
  return d.entries.flatMap((e) => e.workout_session?.set_groups ?? []);
}
function findGroup(d: ParsedLog, needle: string) {
  return groups(d).find((g) => g.verbatim_name.includes(needle));
}
function findMeal(d: ParsedLog, needle: string) {
  return d.entries
    .flatMap((e) => e.meal_items ?? [])
    .find((m) => m.verbatim_name.includes(needle));
}

function check(a: Assertion, d: ParsedLog): { ok: boolean; msg: string } {
  const inc = a.verbatimIncludes as string;
  switch (a.type) {
    case "mealCount": {
      const n = d.entries.flatMap((e) => e.meal_items ?? []).length;
      return { ok: n === a.equals, msg: `mealCount ${n} == ${a.equals}` };
    }
    case "fractionValue": {
      const m = findMeal(d, inc);
      return { ok: m?.fraction_value === a.equals, msg: `${inc} fraction ${m?.fraction_value} == ${a.equals}` };
    }
    case "lookupNeeded": {
      const m = findMeal(d, inc);
      return { ok: m?.lookup_needed === a.equals, msg: `${inc} lookupNeeded ${m?.lookup_needed} == ${a.equals}` };
    }
    case "setGroupKind": {
      const g = findGroup(d, inc);
      return { ok: g?.kind === a.equals, msg: `${inc} kind ${g?.kind} == ${a.equals}` };
    }
    case "anyGroupKind": {
      const ok = groups(d).some((g) => g.kind === a.equals);
      return { ok, msg: `some group kind == ${a.equals}` };
    }
    case "isUncounted": {
      const g = findGroup(d, inc);
      const s = g?.sets.find((x) => x.order_index === a.setOrder);
      return { ok: s?.is_uncounted === a.equals, msg: `${inc} set${a.setOrder} uncounted ${s?.is_uncounted} == ${a.equals}` };
    }
    case "setBodyweight": {
      const g = findGroup(d, inc);
      const s = g?.sets.find((x) => x.order_index === a.setOrder);
      return { ok: s?.is_bodyweight === a.equals, msg: `${inc} set${a.setOrder} bw ${s?.is_bodyweight} == ${a.equals}` };
    }
    case "anySetBodyweight": {
      const g = findGroup(d, inc);
      return { ok: !!g?.sets.some((s) => s.is_bodyweight) === a.equals, msg: `${inc} anySetBw == ${a.equals}` };
    }
    case "anySetTwins": {
      const g = findGroup(d, inc);
      return { ok: !!g?.sets.some((s) => s.is_twins) === a.equals, msg: `${inc} anySetTwins == ${a.equals}` };
    }
    case "setUnit": {
      const g = findGroup(d, inc);
      const s = g?.sets.find((x) => x.order_index === a.setOrder);
      return { ok: s?.unit === a.equals, msg: `${inc} set${a.setOrder} unit ${s?.unit} == ${a.equals}` };
    }
    case "loadPresent": {
      const g = findGroup(d, inc);
      const ok = !!g?.sets.some((s) => s.load === a.load);
      return { ok, msg: `${inc} has a set with load ${a.load}` };
    }
    case "sessionDuration": {
      const dur = d.entries.find((e) => e.workout_session)?.workout_session?.duration_min;
      return { ok: dur === a.equals, msg: `duration ${dur} == ${a.equals}` };
    }
    case "bodyMetric": {
      const bm = d.entries
        .flatMap((e) => e.body_metrics ?? [])
        .find((x) => x.metric_type === a.metricType);
      return { ok: bm?.value === a.equals, msg: `${a.metricType} ${bm?.value} == ${a.equals}` };
    }
    case "hasWorkout": {
      const has = d.entries.some((e) => e.workout_session);
      return { ok: has === a.equals, msg: `hasWorkout ${has} == ${a.equals}` };
    }
    case "hasDiet": {
      const has = d.entries.some((e) => (e.meal_items ?? []).length > 0);
      return { ok: has === a.equals, msg: `hasDiet ${has} == ${a.equals}` };
    }
    case "needsReviewContains": {
      const ok = d.needs_review.some((r) =>
        (r.verbatim + r.question).toLowerCase().includes((a.substr as string).toLowerCase())
      );
      return { ok, msg: `needs_review contains "${a.substr}"` };
    }
    default:
      return { ok: false, msg: `unknown assertion ${a.type}` };
  }
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY to run the eval.");
    process.exit(1);
  }
  let totalAssertions = 0;
  let passedAssertions = 0;
  const failures: string[] = [];

  for (const c of cases) {
    let res;
    try {
      res = await parseLog({ text: c.input, source: c.source });
    } catch (e) {
      failures.push(`[${c.id}] PARSE ERROR: ${(e as Error).message}`);
      totalAssertions += c.expect.length;
      continue;
    }
    for (const a of c.expect) {
      totalAssertions++;
      const { ok, msg } = check(a, res.data);
      if (ok) passedAssertions++;
      else failures.push(`[${c.id}] FAIL: ${msg}`);
    }
    console.log(`  ${c.id}: parsed via ${res.model} (${res.usage.cacheReadTokens} cached tok)`);
  }

  const pct = ((passedAssertions / totalAssertions) * 100).toFixed(1);
  console.log("\n===== EVAL RESULT =====");
  console.log(`Field-level accuracy: ${passedAssertions}/${totalAssertions} = ${pct}%`);
  if (failures.length) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log("  " + f));
  }
  // Blueprint Wk2 gate: >= 85% field-level accuracy.
  process.exit(Number(pct) >= 85 ? 0 : 1);
}

main();
