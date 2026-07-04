// TypeScript mirror of the emit_parsed_log tool output.
export type LoadUnit = "kg" | "lb" | "bw" | "band" | "rpe";
export type SetGroupKind =
  | "straight" | "superset" | "giant_set" | "drop_set"
  | "cluster" | "rest_pause" | "compound_pair";

export interface ParsedMealItem {
  verbatim_name: string;
  normalized_english_name: string | null;
  quantity: number | null;
  fraction_value: number | null;
  unit: string | null;
  lookup_needed: boolean;
  confidence_score: number;
}

export interface ParsedSet {
  order_index: number;
  load: number | null;
  unit: LoadUnit;
  reps: number | null;
  is_twins: boolean;
  is_uncounted: boolean;
  is_bodyweight: boolean;
  rir: number | null;
  rest_after_sec: number | null;
  notes?: string | null;
  confidence_score: number;
}

export interface ParsedSetGroup {
  verbatim_name: string;
  kind: SetGroupKind;
  order_index: number;
  confidence_score: number;
  sets: ParsedSet[];
}

export interface ParsedWorkoutSession {
  duration_min: number | null;
  post_weight_kg: number | null;
  set_groups: ParsedSetGroup[];
}

export interface ParsedBodyMetric {
  metric_type: string;
  value: number;
  unit: string | null;
}

export interface ParsedEntry {
  kind: "diet" | "workout" | "body_metric" | "mixed";
  meal_items?: ParsedMealItem[];
  workout_session?: ParsedWorkoutSession | null;
  body_metrics?: ParsedBodyMetric[];
}

export interface NeedsReviewItem {
  question: string;
  target: string;
  verbatim: string;
}

export interface ParsedLog {
  entries: ParsedEntry[];
  needs_review: NeedsReviewItem[];
}

export interface ParserContext {
  known_aliases?: { alias: string; canonical: string }[];
  recent_exercises?: string[];
  recent_foods?: string[];
}

export interface ParseInput {
  text: string;
  source: "text" | "voice" | "photo";
  imageBase64?: string; // for photo source
  context?: ParserContext;
}

export interface ParseResult {
  data: ParsedLog;
  model: string;
  parserVersion: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
}
