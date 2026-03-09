-- ══════════════════════════════════════════════════════════════════════
-- Migration 007 — AI Agent Foundation (Phase 3a)
-- ══════════════════════════════════════════════════════════════════════

-- ── Agents ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id            uuid NOT NULL REFERENCES groups ON DELETE CASCADE,
  -- Identity
  name                text NOT NULL,
  description         text,
  avatar_color        text DEFAULT '#6366f1',
  -- Model
  model               text NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  -- Persona & Instructions
  persona_preset      text DEFAULT 'custom',
  persona             text,
  instructions        text,
  -- Tools
  tools               text[] DEFAULT '{}',
  -- Scope
  company_scope       uuid[],
  -- Email
  email_address       text,
  email_display_name  text,
  email_recipients    text[],
  -- Slack
  slack_channel       text,
  -- State
  is_active           boolean NOT NULL DEFAULT true,
  created_by          uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can read agents"
  ON agents FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM user_groups WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Group admins can manage agents"
  ON agents FOR ALL
  USING (
    group_id IN (
      SELECT group_id FROM user_groups
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'group_admin')
    )
  )
  WITH CHECK (
    group_id IN (
      SELECT group_id FROM user_groups
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'group_admin')
    )
  );

-- ── Agent Credentials ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_credentials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      uuid NOT NULL REFERENCES agents ON DELETE CASCADE,
  group_id      uuid NOT NULL REFERENCES groups ON DELETE CASCADE,
  name          text NOT NULL,
  key           text NOT NULL,
  value         text NOT NULL,   -- AES-256-GCM encrypted (iv:authTag:ciphertext, base64)
  description   text,
  last_used_at  timestamptz,
  expires_at    timestamptz,
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (agent_id, key)
);

ALTER TABLE agent_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group admins can manage credentials"
  ON agent_credentials FOR ALL
  USING (
    group_id IN (
      SELECT group_id FROM user_groups
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'group_admin')
    )
  )
  WITH CHECK (
    group_id IN (
      SELECT group_id FROM user_groups
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'group_admin')
    )
  );

-- ── Agent Runs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id          uuid NOT NULL REFERENCES agents ON DELETE CASCADE,
  group_id          uuid NOT NULL REFERENCES groups ON DELETE CASCADE,
  triggered_by      text NOT NULL DEFAULT 'manual',
  triggered_by_user uuid REFERENCES auth.users ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'queued',
  input_context     jsonb DEFAULT '{}',
  output            text,
  output_type       text DEFAULT 'text',
  tool_calls        jsonb DEFAULT '[]',
  model_used        text,
  tokens_used       integer,
  error_message     text,
  draft_report_id   uuid,   -- FK added after custom_reports exists (already exists from 006)
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can read runs"
  ON agent_runs FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM user_groups WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Group admins can manage runs"
  ON agent_runs FOR ALL
  USING (
    group_id IN (
      SELECT group_id FROM user_groups
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'group_admin')
    )
  )
  WITH CHECK (
    group_id IN (
      SELECT group_id FROM user_groups
      WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'group_admin')
    )
  );

-- Add FK from agent_runs to custom_reports (already exists)
ALTER TABLE agent_runs
  ADD CONSTRAINT IF NOT EXISTS fk_agent_runs_draft_report
  FOREIGN KEY (draft_report_id) REFERENCES custom_reports ON DELETE SET NULL;

-- ── Agent Schedules (stub) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_schedules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        uuid NOT NULL REFERENCES agents ON DELETE CASCADE,
  cron_expression text NOT NULL,
  timezone        text NOT NULL DEFAULT 'Australia/Sydney',
  is_active       boolean NOT NULL DEFAULT false,
  last_run_at     timestamptz,
  next_run_at     timestamptz,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE agent_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group admins can manage schedules"
  ON agent_schedules FOR ALL
  USING (
    agent_id IN (
      SELECT id FROM agents WHERE group_id IN (
        SELECT group_id FROM user_groups
        WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'group_admin')
      )
    )
  )
  WITH CHECK (
    agent_id IN (
      SELECT id FROM agents WHERE group_id IN (
        SELECT group_id FROM user_groups
        WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'group_admin')
      )
    )
  );

-- ── Groups table additions ───────────────────────────────────────────────
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS custom_email_domain    text,
  ADD COLUMN IF NOT EXISTS custom_email_verified  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS resend_domain_id       text,
  ADD COLUMN IF NOT EXISTS slack_webhook_url      text,
  ADD COLUMN IF NOT EXISTS slack_default_channel  text;

-- ── custom_reports additions ─────────────────────────────────────────────
ALTER TABLE custom_reports
  ADD COLUMN IF NOT EXISTS is_draft     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS draft_notes  text,
  ADD COLUMN IF NOT EXISTS agent_run_id uuid REFERENCES agent_runs ON DELETE SET NULL;
