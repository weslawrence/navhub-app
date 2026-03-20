-- 022_assistant_history.sql
-- Stores per-user per-group conversation history for the NavHub Assistant.

CREATE TABLE IF NOT EXISTS assistant_conversations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid        NOT NULL REFERENCES groups(id)     ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text        NOT NULL DEFAULT 'New Conversation',
  messages    jsonb       NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup: user's conversations in a group, newest first
CREATE INDEX IF NOT EXISTS idx_asst_conv_user_group
  ON assistant_conversations (user_id, group_id, updated_at DESC);

-- RLS: each user can only see/manage their own conversations
ALTER TABLE assistant_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their conversations"
  ON assistant_conversations
  FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
