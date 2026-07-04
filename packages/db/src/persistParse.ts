import { prisma } from "./index.js";
import type {
  ParsedLog, ParsedMealItem, ParsedSetGroup, LoadUnit,
} from "@pack/parser";

export interface PersistArgs {
  userId: string;
  parsed: ParsedLog;
  source: "text" | "voice" | "photo" | "manual" | "import";
  rawInputText?: string;
  rawInputAudioUrl?: string;
  loggedAt?: Date;
  parserModel: string;
  parserVersion: string;
  overallConfidence: number;
}

const AUTO_ACCEPT = 0.75; // >= this and no review => auto_accepted; else pending

/** Resolve an exercise alias the user already confirmed, so we never re-ask. */
async function resolveExerciseId(userId: string, verbatim: string): Promise<string | null> {
  const alias = await prisma.userExerciseAlias.findUnique({
    where: { userId_aliasText: { userId, aliasText: verbatim.trim().toLowerCase() } },
    select: { exerciseId: true },
  });
  return alias?.exerciseId ?? null;
}

function mapUnit(u: LoadUnit): "kg" | "lb" | "bw" | "band" | "rpe" {
  return u;
}

/**
 * Persist a parsed log as Entry + children in one transaction (Section 3 / 10n).
 * Raw input is stored beside the structured rows for retroactive re-parse (10m).
 * Every write is mirrored to AuditLog action='llm_parsed' for retraining.
 */
export async function persistParse(args: PersistArgs) {
  const {
    userId, parsed, source, rawInputText, rawInputAudioUrl,
    loggedAt = new Date(), parserModel, parserVersion, overallConfidence,
  } = args;

  // Pre-resolve exercise aliases outside the txn (reads only).
  const aliasMap = new Map<string, string | null>();
  for (const e of parsed.entries) {
    for (const g of e.workout_session?.set_groups ?? []) {
      if (!aliasMap.has(g.verbatim_name)) {
        aliasMap.set(g.verbatim_name, await resolveExerciseId(userId, g.verbatim_name));
      }
    }
  }

  const kind = deriveKind(parsed);

  return prisma.$transaction(async (tx) => {
    const entry = await tx.entry.create({
      data: {
        userId,
        kind,
        source,
        rawInputText,
        rawInputAudioUrl,
        loggedAt,
        parserModel,
        parserVersion,
        overallConfidence,
        meals: {
          create: parsed.entries
            .flatMap((e) => e.meal_items ?? [])
            .map((m: ParsedMealItem) => ({
              verbatimName: m.verbatim_name,
              normalizedEnglishName: m.normalized_english_name,
              quantity: m.quantity,
              fractionValue: m.fraction_value,
              unit: m.unit,
              confidenceScore: m.confidence_score,
              lookupNeeded: m.lookup_needed,
            })),
        },
      },
    });

    // Workout session (at most one per entry).
    const wsGroups = parsed.entries.find((e) => e.workout_session)?.workout_session;
    if (wsGroups) {
      await tx.workoutSession.create({
        data: {
          entryId: entry.id,
          durationMin: wsGroups.duration_min,
          postWeightKg: wsGroups.post_weight_kg,
          setGroups: {
            create: wsGroups.set_groups.map((g: ParsedSetGroup) => ({
              verbatimName: g.verbatim_name,
              kind: g.kind,
              orderIndex: g.order_index,
              confidenceScore: g.confidence_score,
              exerciseId: aliasMap.get(g.verbatim_name) ?? undefined,
              sets: {
                create: g.sets.map((s) => ({
                  orderIndex: s.order_index,
                  load: s.load,
                  unit: mapUnit(s.unit),
                  reps: s.reps,
                  isTwins: s.is_twins,
                  isUncounted: s.is_uncounted,
                  isBodyweight: s.is_bodyweight,
                  rir: s.rir,
                  restAfterSec: s.rest_after_sec,
                  notes: s.notes ?? null,
                  confidenceScore: s.confidence_score,
                })),
              },
            })),
          },
        },
      });
    }

    // Body metrics -> long-format Metric rows.
    const metrics = parsed.entries.flatMap((e) => e.body_metrics ?? []);
    if (metrics.length) {
      await tx.metric.createMany({
        data: metrics.map((bm) => ({
          userId,
          metricType: bm.metric_type as any, // validated against MetricType enum at insert
          value: bm.value,
          unit: bm.unit,
          measuredAt: loggedAt,
          source: source as any,
          entryId: entry.id,
        })),
        skipDuplicates: true,
      });
    }

    // Review queue for low-confidence / ambiguous items.
    if (parsed.needs_review.length) {
      await tx.reviewItem.createMany({
        data: parsed.needs_review.map((r) => ({
          entryId: entry.id,
          question: r.question,
          targetTable: r.target,
          status: "pending" as const,
        })),
      });
    }

    // Audit: one row capturing the raw parse for retraining.
    await tx.auditLog.create({
      data: {
        userId,
        entryId: entry.id,
        action: "llm_parsed",
        targetTable: "entries",
        targetId: entry.id,
        beforeJson: parsed as any,
        afterJson: undefined,
      },
    });

    return { entryId: entry.id, status: overallConfidence >= AUTO_ACCEPT && !parsed.needs_review.length ? "auto_accepted" : "pending" };
  });
}

function deriveKind(parsed: ParsedLog): "diet" | "workout" | "body_metric" | "mixed" {
  const hasDiet = parsed.entries.some((e) => (e.meal_items ?? []).length);
  const hasWorkout = parsed.entries.some((e) => e.workout_session);
  const hasMetric = parsed.entries.some((e) => (e.body_metrics ?? []).length);
  if ([hasDiet, hasWorkout].filter(Boolean).length > 1) return "mixed";
  if (hasWorkout) return "workout";
  if (hasDiet) return "diet";
  if (hasMetric) return "body_metric";
  return "mixed";
}
