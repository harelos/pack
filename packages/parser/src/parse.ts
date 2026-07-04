import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, PARSER_VERSION } from "./systemPrompt.js";
import { EMIT_PARSED_LOG_TOOL } from "./toolSchema.js";
import { pickModel } from "./router.js";
import type { ParseInput, ParseResult, ParsedLog } from "./types.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const LOW_CONFIDENCE = 0.75;

function buildContextText(input: ParseInput): string {
  const c = input.context;
  if (!c) return "";
  const parts: string[] = [];
  if (c.known_aliases?.length)
    parts.push("known_aliases: " + JSON.stringify(c.known_aliases));
  if (c.recent_exercises?.length)
    parts.push("recent_exercises: " + c.recent_exercises.join(", "));
  if (c.recent_foods?.length)
    parts.push("recent_foods: " + c.recent_foods.join(", "));
  return parts.length ? "\n\n[CONTEXT]\n" + parts.join("\n") : "";
}

/** Overall confidence = min() of every child confidence (Blueprint: Entry.overallConfidence). */
export function computeOverallConfidence(data: ParsedLog): number {
  const scores: number[] = [];
  for (const e of data.entries) {
    e.meal_items?.forEach((m) => scores.push(m.confidence_score));
    e.workout_session?.set_groups?.forEach((g) => {
      scores.push(g.confidence_score);
      g.sets.forEach((s) => scores.push(s.confidence_score));
    });
  }
  return scores.length ? Math.min(...scores) : 1;
}

/**
 * Parse one log. Caches the (large, static) system prompt via cache_control.
 * Forces the emit_parsed_log tool so output is always structured.
 */
export async function parseLog(
  input: ParseInput,
  opts: { killSwitchActive?: boolean } = {}
): Promise<ParseResult> {
  const run = async (isRetry: boolean): Promise<ParseResult> => {
    const model = pickModel(input, {
      isRetryAfterLowConfidence: isRetry,
      killSwitchActive: opts.killSwitchActive,
    });

    const userContent: Anthropic.ContentBlockParam[] = [];
    if (input.source === "photo" && input.imageBase64) {
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: input.imageBase64 },
      });
    }
    userContent.push({ type: "text", text: input.text + buildContextText(input) });

    const res = await client.messages.create({
      model,
      max_tokens: 4096,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      tools: [EMIT_PARSED_LOG_TOOL],
      tool_choice: { type: "tool", name: "emit_parsed_log" },
      messages: [{ role: "user", content: userContent }],
    });

    const toolUse = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (!toolUse) throw new Error("Parser did not return a tool_use block");

    const data = toolUse.input as ParsedLog;
    return {
      data,
      model,
      parserVersion: PARSER_VERSION,
      usage: {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
      },
    };
  };

  // First pass. If a cheap-model parse comes back low-confidence, escalate once to Sonnet.
  const first = await run(false);
  const conf = computeOverallConfidence(first.data);
  const usedCheap = first.model === (process.env.PARSER_MODEL_CHEAP ?? "claude-haiku-4-5");
  if (usedCheap && conf < LOW_CONFIDENCE && !opts.killSwitchActive) {
    return run(true);
  }
  return first;
}
