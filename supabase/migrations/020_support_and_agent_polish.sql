-- Migration 020: Support requests, feature suggestions + agent personality & scheduling

-- ── Support requests ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_requests (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid        REFERENCES groups(id) ON DELETE SET NULL,
  user_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  email      text        NOT NULL,
  message    text        NOT NULL,
  status     text        NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE support_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_requests_insert"
  ON support_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "support_requests_select_admin"
  ON support_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_groups
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- ── Feature suggestions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_suggestions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid        REFERENCES groups(id) ON DELETE SET NULL,
  user_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  email      text        NOT NULL,
  suggestion text        NOT NULL,
  status     text        NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feature_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_suggestions_insert"
  ON feature_suggestions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "feature_suggestions_select_admin"
  ON feature_suggestions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_groups
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- ── Agent personality + scheduling columns ────────────────────────────────────
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS schedule_config         jsonb,
  ADD COLUMN IF NOT EXISTS schedule_enabled        boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_scheduled_run_at   timestamptz,
  ADD COLUMN IF NOT EXISTS communication_style     text        NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS response_length         text        NOT NULL DEFAULT 'balanced';
