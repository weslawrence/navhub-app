-- 043_provider_configs.sql — Provider-level API key storage + per-agent provider/model

-- Provider-level API key storage (replaces group_model_configs for new agents)
CREATE TABLE IF NOT EXISTS group_provider_configs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          uuid        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  provider          text        NOT NULL CHECK (provider IN ('anthropic','openai','google','mistral','custom')),
  api_key_encrypted text        NOT NULL,
  base_url          text,                          -- for custom OpenAI-compatible providers
  is_active         boolean     NOT NULL DEFAULT true,
  created_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_group_provider_configs ON group_provider_configs(group_id);

-- Add ai_provider + ai_model directly on agents (replaces model_config_id flow).
-- model_config_id stays in place for backwards-compat with existing agents.
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS ai_provider text DEFAULT 'anthropic',
  ADD COLUMN IF NOT EXISTS ai_model    text DEFAULT 'claude-haiku-4-5-20251001';

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE group_provider_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "provider_configs_read"  ON group_provider_configs;
CREATE POLICY "provider_configs_read" ON group_provider_configs
  FOR SELECT USING (group_id = ANY(get_user_group_ids()));

DROP POLICY IF EXISTS "provider_configs_admin" ON group_provider_configs;
CREATE POLICY "provider_configs_admin" ON group_provider_configs
  FOR ALL USING (is_group_admin(group_id))
  WITH CHECK (is_group_admin(group_id));
