-- 048_slack.sql — Slack default channel + agent default Slack channel
--
-- The slack_connections table itself was created in 038_agent_notifications.sql.
-- This migration adds the default_channel column + the per-agent default Slack
-- channel column, and re-asserts the table + RLS so older environments are
-- self-healing.

CREATE TABLE IF NOT EXISTS slack_connections (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id            uuid        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  team_id             text        NOT NULL,
  team_name           text,
  bot_token_encrypted text        NOT NULL,
  is_active           boolean     NOT NULL DEFAULT true,
  connected_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, team_id)
);

ALTER TABLE slack_connections
  ADD COLUMN IF NOT EXISTS default_channel text;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS default_slack_channel text;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE slack_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "slack_connections: group members read" ON slack_connections;
CREATE POLICY "slack_connections: group members read"
  ON slack_connections FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_groups
    WHERE user_id = auth.uid() AND group_id = slack_connections.group_id
  ));

DROP POLICY IF EXISTS "slack_connections: group admins write" ON slack_connections;
CREATE POLICY "slack_connections: group admins write"
  ON slack_connections FOR ALL
  USING (EXISTS (
    SELECT 1 FROM user_groups
    WHERE user_id = auth.uid()
      AND group_id = slack_connections.group_id
      AND role IN ('super_admin','group_admin')
  ));
