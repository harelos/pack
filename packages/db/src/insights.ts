import { Prisma } from "@prisma/client";
import { prisma } from "./index.js";

/**
 * The 6 insight archetypes from Blueprint Section 7, as runnable queries.
 * Each returns { rows, message, visual } so the Insights feed can render a card.
 * All use parameterized $queryRaw (no string interpolation) — RLS still applies
 * because these run under the user's session in the API layer.
 */
export interface InsightCard {
  kind: string;
  rows: unknown[];
  message: string | null;
  visual: { chart: string; x?: string; y?: string; y2?: string };
}

// 1. Strength regression vs volume divergence (under-recovery).
export async function strengthVsVolume(userId: string, exerciseId: string): Promise<InsightCard> {
  const rows = await prisma.$queryRaw<{ wk: Date; est_1rm: number; volume: number }[]>(Prisma.sql`
    SELECT date_trunc('week', e.logged_at) AS wk,
           MAX(s.load * (1 + s.reps / 30.0)) AS est_1rm,
           SUM(s.load * s.reps)              AS volume
    FROM sets s
    JOIN set_groups g       ON g.id = s.set_group_id
    JOIN workout_sessions ws ON ws.id = g.session_id
    JOIN entries e          ON e.id = ws.entry_id
    WHERE e.user_id = ${userId}::uuid AND g.exercise_id = ${exerciseId}::uuid
      AND s.load IS NOT NULL AND s.reps IS NOT NULL
    GROUP BY 1 ORDER BY 1`);
  let message: string | null = null;
  if (rows.length >= 3) {
    const first = rows[0], last = rows[rows.length - 1];
    const strengthPct = ((last.est_1rm - first.est_1rm) / first.est_1rm) * 100;
    const volPct = ((last.volume - first.volume) / first.volume) * 100;
    if (strengthPct < -2 && volPct > 0) {
      message = `Your est. 1RM is ${strengthPct.toFixed(0)}% over ${rows.length} weeks while volume is up ${volPct.toFixed(0)}%. Likely under-recovery — try dropping one accessory day.`;
    }
  }
  return { kind: "correlation", rows, message, visual: { chart: "dual-axis-line", x: "week", y: "est_1rm", y2: "volume" } };
}

// 2. Sleep < 6h -> next-day intake.
export async function sleepVsIntake(userId: string): Promise<InsightCard> {
  const rows = await prisma.$queryRaw<{ low: number; ok: number }[]>(Prisma.sql`
    WITH sleep AS (
      SELECT measured_at::date AS d, value AS h FROM metrics
      WHERE user_id = ${userId}::uuid AND metric_type = 'sleep_hours'),
    kcal AS (
      SELECT e.logged_at::date AS d, SUM(mi.kcal) AS k
      FROM meal_items mi JOIN entries e ON e.id = mi.entry_id
      WHERE e.user_id = ${userId}::uuid GROUP BY 1)
    SELECT AVG(k) FILTER (WHERE h < 6)  AS low,
           AVG(k) FILTER (WHERE h >= 6) AS ok
    FROM sleep s JOIN kcal ON kcal.d = s.d + 1`);
  const r = rows[0];
  let message: string | null = null;
  if (r?.low && r?.ok && r.low - r.ok > 100) {
    const extra = Math.round(r.low - r.ok);
    const lbYr = Math.round((extra * 365) / 3500);
    message = `Every time you sleep <6h you eat ~${extra} kcal more the next day. That's ~${lbYr} lb/yr if unchecked.`;
  }
  return { kind: "correlation", rows, message, visual: { chart: "grouped-bar", x: "sleep_bucket", y: "next_day_kcal" } };
}

// 3. Weekday adherence gap.
export async function weekdayAdherence(userId: string): Promise<InsightCard> {
  const rows = await prisma.$queryRaw<{ dow: string; n: number }[]>(Prisma.sql`
    SELECT to_char(logged_at, 'Dy') AS dow,
           COUNT(*) FILTER (WHERE kind = 'workout') AS n
    FROM entries WHERE user_id = ${userId}::uuid
    GROUP BY 1 ORDER BY 2 ASC`);
  let message: string | null = null;
  if (rows.length >= 5) {
    const worst = rows[0];
    message = `You train least on ${worst.dow} (${worst.n} sessions logged). Want us to auto-shift ${worst.dow}'s plan to the next day?`;
  }
  return { kind: "nudge", rows, message, visual: { chart: "weekday-heatmap", x: "weekday", y: "sessions" } };
}

// 4. Protein-target shortfall pattern.
export async function proteinShortfall(userId: string): Promise<InsightCard> {
  const rows = await prisma.$queryRaw<{ d: Date; p: number }[]>(Prisma.sql`
    WITH tgt AS (SELECT protein_g FROM goals WHERE user_id = ${userId}::uuid
                 ORDER BY effective_from DESC LIMIT 1)
    SELECT e.logged_at::date AS d, SUM(mi.protein_g) AS p
    FROM meal_items mi JOIN entries e ON e.id = mi.entry_id
    WHERE e.user_id = ${userId}::uuid
    GROUP BY 1 HAVING SUM(mi.protein_g) < (SELECT protein_g FROM tgt)
    ORDER BY 1 DESC LIMIT 14`);
  const message = rows.length >= 3
    ? `You're under your protein target ${rows.length} of the last 14 days. Front-load a shake pre-workout on training days.`
    : null;
  return { kind: "trend", rows, message, visual: { chart: "calendar-dots", x: "date", y: "hit_miss" } };
}

// 5. Drop-set fatigue signature (wedge-only).
export async function dropSetFatigue(userId: string): Promise<InsightCard> {
  const rows = await prisma.$queryRaw<{ wk: Date; dropoff: number }[]>(Prisma.sql`
    SELECT date_trunc('week', e.logged_at) AS wk,
           AVG(first.reps - last.reps) AS dropoff
    FROM set_groups g
    JOIN LATERAL (SELECT reps FROM sets WHERE set_group_id = g.id AND reps IS NOT NULL ORDER BY order_index ASC LIMIT 1)  first ON true
    JOIN LATERAL (SELECT reps FROM sets WHERE set_group_id = g.id AND reps IS NOT NULL ORDER BY order_index DESC LIMIT 1) last  ON true
    JOIN workout_sessions ws ON ws.id = g.session_id
    JOIN entries e ON e.id = ws.entry_id
    WHERE e.user_id = ${userId}::uuid AND g.kind = 'drop_set'
    GROUP BY 1 ORDER BY 1`);
  let message: string | null = null;
  if (rows.length >= 3) {
    const first = rows[0].dropoff, last = rows[rows.length - 1].dropoff;
    if (last < first) message = `Your drop-set rep fall-off shrank from ${first.toFixed(0)}→${last.toFixed(0)} reps — work capacity is climbing.`;
  }
  return { kind: "trend", rows, message, visual: { chart: "line", x: "week", y: "avg_dropoff" } };
}

// 6. Readiness -> performance validation.
export async function readinessVsPerformance(userId: string): Promise<InsightCard> {
  const rows = await prisma.$queryRaw<{ score: number; vol: number }[]>(Prisma.sql`
    SELECT r.score, AVG(s.load * s.reps) AS vol
    FROM readiness_scores r
    JOIN entries e          ON e.logged_at::date = r.for_date AND e.user_id = r.user_id
    JOIN workout_sessions ws ON ws.entry_id = e.id
    JOIN set_groups g       ON g.session_id = ws.id
    JOIN sets s             ON s.set_group_id = g.id
    WHERE r.user_id = ${userId}::uuid AND s.load IS NOT NULL
    GROUP BY r.score ORDER BY r.score`);
  const message = rows.length >= 4
    ? `On days we flagged readiness <60, your training volume was lower — the score is tracking reality. Trust the grey days.`
    : null;
  return { kind: "correlation", rows, message, visual: { chart: "scatter", x: "readiness", y: "session_volume" } };
}

/** Run every archetype; return only cards that produced a message (something worth surfacing). */
export async function buildInsightFeed(userId: string, primaryExerciseId?: string): Promise<InsightCard[]> {
  const cards: InsightCard[] = [];
  if (primaryExerciseId) cards.push(await strengthVsVolume(userId, primaryExerciseId));
  cards.push(
    await sleepVsIntake(userId),
    await weekdayAdherence(userId),
    await proteinShortfall(userId),
    await dropSetFatigue(userId),
    await readinessVsPerformance(userId),
  );
  return cards.filter((c) => c.message !== null);
}
