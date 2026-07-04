-- Run AFTER `prisma migrate deploy` creates the tables (0001).
-- Enables RLS, owner policies, catalog read policies, and partial indexes.
-- Full rationale: Pack-Fitness-App-Blueprint.md Section 3.2.

-- === Enable RLS on tenant tables ===
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals               ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries             ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_custom_foods   ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE set_groups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sets                ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_exercise_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics             ENABLE ROW LEVEL SECURITY;
ALTER TABLE readiness_scores    ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights            ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs          ENABLE ROW LEVEL SECURITY;

-- === Global read-only catalog tables ===
ALTER TABLE food_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY food_read ON food_items       FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY ex_read   ON exercise_catalog FOR SELECT USING (auth.role() = 'authenticated');

-- === Helper: resolve the app user id for the current JWT ===
CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM users WHERE auth_id = auth.uid()::text;
$$;

-- === Users: self only ===
CREATE POLICY users_self ON users
  USING (auth_id = auth.uid()::text)
  WITH CHECK (auth_id = auth.uid()::text);

-- === Direct children scoped by user_id ===
CREATE POLICY profiles_owner  ON profiles           USING (user_id = current_app_user_id()) WITH CHECK (user_id = current_app_user_id());
CREATE POLICY goals_owner     ON goals              USING (user_id = current_app_user_id()) WITH CHECK (user_id = current_app_user_id());
CREATE POLICY entries_owner   ON entries            USING (user_id = current_app_user_id()) WITH CHECK (user_id = current_app_user_id());
CREATE POLICY ucf_owner       ON user_custom_foods  USING (user_id = current_app_user_id()) WITH CHECK (user_id = current_app_user_id());
CREATE POLICY alias_owner     ON user_exercise_aliases USING (user_id = current_app_user_id()) WITH CHECK (user_id = current_app_user_id());
CREATE POLICY metrics_owner   ON metrics            USING (user_id = current_app_user_id()) WITH CHECK (user_id = current_app_user_id());
CREATE POLICY readiness_owner ON readiness_scores   USING (user_id = current_app_user_id()) WITH CHECK (user_id = current_app_user_id());
CREATE POLICY insights_owner  ON insights           USING (user_id = current_app_user_id()) WITH CHECK (user_id = current_app_user_id());
CREATE POLICY streaks_owner   ON streaks            USING (user_id = current_app_user_id()) WITH CHECK (user_id = current_app_user_id());
CREATE POLICY audit_owner     ON audit_logs         USING (user_id = current_app_user_id()) WITH CHECK (user_id = current_app_user_id());

-- === Meal items scoped through their entry ===
CREATE POLICY meal_items_owner ON meal_items
  USING (entry_id IN (SELECT id FROM entries WHERE user_id = current_app_user_id()))
  WITH CHECK (entry_id IN (SELECT id FROM entries WHERE user_id = current_app_user_id()));

CREATE POLICY review_owner ON review_items
  USING (entry_id IN (SELECT id FROM entries WHERE user_id = current_app_user_id()))
  WITH CHECK (entry_id IN (SELECT id FROM entries WHERE user_id = current_app_user_id()));

-- === Workout session -> set_group -> set (deep scoping via SECURITY DEFINER helpers) ===
CREATE POLICY ws_owner ON workout_sessions
  USING (entry_id IN (SELECT id FROM entries WHERE user_id = current_app_user_id()))
  WITH CHECK (entry_id IN (SELECT id FROM entries WHERE user_id = current_app_user_id()));

CREATE OR REPLACE FUNCTION owns_session(s uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM workout_sessions ws
    JOIN entries e ON e.id = ws.entry_id
    WHERE ws.id = s AND e.user_id = current_app_user_id()
  );
$$;
CREATE POLICY sg_owner ON set_groups USING (owns_session(session_id)) WITH CHECK (owns_session(session_id));

CREATE OR REPLACE FUNCTION owns_set_group(sg uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM set_groups g
    JOIN workout_sessions ws ON ws.id = g.session_id
    JOIN entries e ON e.id = ws.entry_id
    WHERE g.id = sg AND e.user_id = current_app_user_id()
  );
$$;
CREATE POLICY sets_owner ON sets USING (owns_set_group(set_group_id)) WITH CHECK (owns_set_group(set_group_id));

-- === Hot-path partial indexes (Prisma can't express WHERE) ===
CREATE INDEX IF NOT EXISTS idx_review_pending   ON review_items (entry_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_metrics_weight   ON metrics (user_id, measured_at DESC) WHERE metric_type = 'weight';
CREATE INDEX IF NOT EXISTS idx_audit_retrain    ON audit_logs (action) WHERE action IN ('user_edited','user_rejected');
