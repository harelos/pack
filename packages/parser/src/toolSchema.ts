import type Anthropic from "@anthropic-ai/sdk";

// Forces structured output. Mirrors packages/db/schema.prisma (Section 3).
export const EMIT_PARSED_LOG_TOOL: Anthropic.Tool = {
  name: "emit_parsed_log",
  description:
    "Emit the fully structured parse of the user's fitness/diet log. Call exactly once.",
  input_schema: {
    type: "object",
    required: ["entries", "needs_review"],
    properties: {
      entries: {
        type: "array",
        items: {
          type: "object",
          required: ["kind"],
          properties: {
            kind: { type: "string", enum: ["diet", "workout", "body_metric", "mixed"] },
            meal_items: {
              type: "array",
              items: {
                type: "object",
                required: ["verbatim_name", "lookup_needed", "confidence_score"],
                properties: {
                  verbatim_name: { type: "string" },
                  normalized_english_name: { type: ["string", "null"] },
                  quantity: { type: ["number", "null"] },
                  fraction_value: { type: ["number", "null"] },
                  unit: { type: ["string", "null"] },
                  lookup_needed: { type: "boolean" },
                  confidence_score: { type: "number" },
                },
              },
            },
            workout_session: {
              type: ["object", "null"],
              properties: {
                duration_min: { type: ["integer", "null"] },
                post_weight_kg: { type: ["number", "null"] },
                set_groups: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["verbatim_name", "kind", "order_index", "sets", "confidence_score"],
                    properties: {
                      verbatim_name: { type: "string" },
                      kind: {
                        type: "string",
                        enum: ["straight", "superset", "giant_set", "drop_set", "cluster", "rest_pause", "compound_pair"],
                      },
                      order_index: { type: "integer" },
                      confidence_score: { type: "number" },
                      sets: {
                        type: "array",
                        items: {
                          type: "object",
                          required: ["order_index", "unit", "is_twins", "is_uncounted", "is_bodyweight", "confidence_score"],
                          properties: {
                            order_index: { type: "integer" },
                            load: { type: ["number", "null"] },
                            unit: { type: "string", enum: ["kg", "lb", "bw", "band", "rpe"] },
                            reps: { type: ["integer", "null"] },
                            is_twins: { type: "boolean" },
                            is_uncounted: { type: "boolean" },
                            is_bodyweight: { type: "boolean" },
                            rir: { type: ["integer", "null"] },
                            rest_after_sec: { type: ["integer", "null"] },
                            notes: { type: ["string", "null"] },
                            confidence_score: { type: "number" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            body_metrics: {
              type: "array",
              items: {
                type: "object",
                required: ["metric_type", "value"],
                properties: {
                  metric_type: { type: "string" },
                  value: { type: "number" },
                  unit: { type: ["string", "null"] },
                },
              },
            },
          },
        },
      },
      needs_review: {
        type: "array",
        items: {
          type: "object",
          required: ["question", "target", "verbatim"],
          properties: {
            question: { type: "string" },
            target: { type: "string" },
            verbatim: { type: "string" },
          },
        },
      },
    },
  },
};
