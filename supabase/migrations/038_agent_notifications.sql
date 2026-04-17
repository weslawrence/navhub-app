-- Migration 038: Agent notifications + Slack workspace connection
-- ─────────────────────────────────────────────────────────────────

-- Notification config per agent
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS notify_on_completion boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_on_output     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_email         text,
  ADD COLUMN IF NOT EXISTS notify_slack_channel text;

-- Per-run notification override (populated from RunModal)
ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS notify_email         text,
  ADD COLUMN IF NOT EXISTS notify_slack_channel text;

-- Group-level Slack connection (OAuth workspace link)
CREATE TABLE IF NOT EXISTS slack_connections (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id              uuid        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  team_id               text        NOT NULL,
  team_name             text,
  bot_token_encrypted   text        NOT NULL,
  webhook_url_encrypted text,
  is_active             boolean     NOT NULL DEFAULT true,
  connected_by          uuid        REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_slack_connections_group
  ON slack_connections(group_id, is_active);

ALTER TABLE slack_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view Slack connections"
  ON slack_connections FOR SELECT
  USING (group_id = ANY(get_user_group_ids()));

CREATE POLICY "Group admins can manage Slack connections"
  ON slack_connections FOR ALL
  USING (
    group_id IN (
      SELECT group_id FROM user_groups
      WHERE user_id = auth.uid() AND role IN ('super_admin', 'group_admin')
    )
  );
