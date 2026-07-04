import type { ParseInput } from "./types.js";

const PRIMARY = process.env.PARSER_MODEL_PRIMARY ?? "claude-sonnet-5";
const CHEAP = process.env.PARSER_MODEL_CHEAP ?? "claude-haiku-4-5";

const COMPOUND_HINTS = /\+|drop|twins|superset|cluster|compound|→|rest.?pause/i;

/**
 * Router rule (Blueprint Section 5). Photo + compound/drop nuance + retries -> Sonnet.
 * Simple short diet / straight sets -> Haiku. Kill-switch forces Haiku globally.
 */
export function pickModel(
  input: ParseInput,
  opts: { isRetryAfterLowConfidence?: boolean; killSwitchActive?: boolean } = {}
): string {
  if (opts.killSwitchActive) return CHEAP;
  if (input.source === "photo") return PRIMARY;
  if (opts.isRetryAfterLowConfidence) return PRIMARY;
  if (COMPOUND_HINTS.test(input.text)) return PRIMARY;
  // ~4 chars/token heuristic; short & no compound hints -> cheap model.
  if (input.text.length < 480) return CHEAP;
  return PRIMARY;
}

export const MODELS = { PRIMARY, CHEAP };
