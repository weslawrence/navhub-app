-- Migration 031: Role revision + Permissions matrix + Agent visibility
-- ──────────────────────────────────────────────────────────────────────

-- 1. Update role constraint to new role set
ALTER TABLE user_groups DROP CONSTRAINT IF EXISTS user_groups_role_check;
ALTER TABLE user_groups ADD CONSTRAINT user_groups_role_check
  CHECK (role IN ('super_admin','group_admin','manager','viewer'));

-- Migrate old roles
UPDATE user_groups SET role = 'viewer' WHERE role IN ('company_viewer','division_viewer');

-- 2. Permissions matrix
CREATE TABLE IF NOT EXISTS user_permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id    uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  feature     text NOT NULL CHECK (feature IN ('financials','reports','documents','marketing','agents','settings')),
  company_id  uuid REFERENCES companies(id) ON DELETE CASCADE,
  access      text NOT NULL DEFAULT 'none' CHECK (access IN ('none','view','edit')),
  updated_by  uuid REFERENCES auth.users(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, group_id, feature, company_id)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_lookup
  ON user_permissions(user_id, group_id);

ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own permissions"
  ON user_permissions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage permissions"
  ON user_permissions FOR ALL
  USING (
    group_id IN (
      SELECT group_id FROM user_groups
      WHERE user_id = auth.uid() AND role IN ('super_admin', 'group_admin')
    )
  );

-- 3. Agent visibility + creator
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private','public')),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- 4. Assistant conversations user isolation index
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user
  ON assistant_conversations(user_id, group_id, updated_at DESC);
