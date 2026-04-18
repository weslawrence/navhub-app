-- Migration 040: Group-level agent tool settings + custom webhook tools
-- ──────────────────────────────────────────────────────────────────────

-- 1. Group-level web search toggle
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS web_search_enabled boolean NOT NULL DEFAULT false;

-- 2. Custom webhook tools per group
CREATE TABLE IF NOT EXISTS custom_tools (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name          text        NOT NULL,  -- snake_case tool name shown to the agent
  label         text        NOT NULL,  -- human-friendly display name
  description   text        NOT NULL,  -- description the agent sees
  webhook_url   text        NOT NULL,
  http_method   text        NOT NULL DEFAULT 'POST'
                CHECK (http_method IN ('GET','POST','PUT','PATCH')),
  headers       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  parameters    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  is_active     boolean     NOT NULL DEFAULT true,
  created_by    uuid        REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, name)
);

CREATE INDEX IF NOT EXISTS idx_custom_tools_group
  ON custom_tools(group_id, is_active);

ALTER TABLE custom_tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view custom tools"
  ON custom_tools FOR SELECT
  USING (group_id = ANY(get_user_group_ids()));

CREATE POLICY "Group admins can manage custom tools"
  ON custom_tools FOR ALL
  USING (
    group_id IN (
      SELECT group_id FROM user_groups
      WHERE user_id = auth.uid() AND role IN ('super_admin', 'group_admin')
    )
  );

-- 3. Per-agent tool overrides (enable/disable specific tools)
CREATE TABLE IF NOT EXISTS agent_tool_overrides (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   uuid        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tool_name  text        NOT NULL,
  enabled    boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_id, tool_name)
);

CREATE INDEX IF NOT EXISTS idx_agent_tool_overrides
  ON agent_tool_overrides(agent_id);

ALTER TABLE agent_tool_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view agent tool overrides"
  ON agent_tool_overrides FOR SELECT
  USING (
    agent_id IN (
      SELECT id FROM agents WHERE group_id = ANY(get_user_group_ids())
    )
  );

CREATE POLICY "Group admins can manage agent tool overrides"
  ON agent_tool_overrides FOR ALL
  USING (
    agent_id IN (
      SELECT id FROM agents
      WHERE group_id IN (
        SELECT group_id FROM user_groups
        WHERE user_id = auth.uid() AND role IN ('super_admin', 'group_admin')
      )
    )
  );
