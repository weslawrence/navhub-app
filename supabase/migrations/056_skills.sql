-- 056_skills.sql — Skills system (platform / group / agent tiers).
--
-- A skill is a self-contained block of expertise: instructions + optional
-- knowledge text + optional reference documents + optional tool grants.
-- The runner injects every applicable skill into the system prompt
-- automatically — users never need to instruct an agent to use a skill.
--
-- Tiers:
--   platform — managed by super_admins; readable by everyone, applied to
--              every agent across every group when published.
--   group    — managed by group admins; applied to every agent in that
--              one group via the group_skills join.
--   agent    — managed by group admins; applied only to specific agents
--              via the agent_skills join.

CREATE TABLE IF NOT EXISTS skills (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier            text NOT NULL CHECK (tier IN ('platform','group','agent')),
  group_id        uuid REFERENCES groups(id) ON DELETE CASCADE,
  name            text NOT NULL,
  slug            text NOT NULL,
  category        text,
  description     text NOT NULL,
  instructions    text NOT NULL,
  knowledge_text  text,
  examples        text,
  tool_grants     text[] NOT NULL DEFAULT '{}',
  is_active       boolean NOT NULL DEFAULT true,
  is_published    boolean NOT NULL DEFAULT false,
  version         int NOT NULL DEFAULT 1,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Slug uniqueness scoped per (tier, group). NULL group_id (platform) is
  -- coalesced to the all-zeros UUID so the unique index works.
  UNIQUE(tier, COALESCE(group_id, '00000000-0000-0000-0000-000000000000'::uuid), slug)
);

CREATE INDEX IF NOT EXISTS idx_skills_tier_group ON skills(tier, group_id);
CREATE INDEX IF NOT EXISTS idx_skills_published   ON skills(is_published, is_active);

-- Reference documents pinned to a skill (full-text injected as context).
CREATE TABLE IF NOT EXISTS skill_knowledge_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id    uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  file_name   text NOT NULL,
  file_type   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skill_knowledge_documents_skill ON skill_knowledge_documents(skill_id);

-- Per-agent assignment (agent-tier skills + selectively-applied platform skills).
CREATE TABLE IF NOT EXISTS agent_skills (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  skill_id   uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_skills_agent ON agent_skills(agent_id);

-- Per-group assignment (group-tier skills + selectively-applied platform skills).
CREATE TABLE IF NOT EXISTS group_skills (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  skill_id   uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_group_skills_group ON group_skills(group_id);

-- ── Row Level Security ──────────────────────────────────────────────────────
ALTER TABLE skills                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_skills             ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_skills             ENABLE ROW LEVEL SECURITY;

-- Platform skills readable by all authenticated users (only when published).
CREATE POLICY "skills: platform readable by all"
  ON skills FOR SELECT
  USING (tier = 'platform' AND is_published = true);

-- Group-tier skills readable by members of that group.
CREATE POLICY "skills: group readable by members"
  ON skills FOR SELECT
  USING (
    tier = 'group' AND
    EXISTS (SELECT 1 FROM user_groups WHERE user_id = auth.uid() AND group_id = skills.group_id)
  );

-- Agent-tier skills: same group-membership gate. (group_id on agent-tier
-- skills points at the owning group, so the same SELECT logic applies.)
CREATE POLICY "skills: agent readable by group members"
  ON skills FOR SELECT
  USING (
    tier = 'agent' AND
    EXISTS (SELECT 1 FROM user_groups WHERE user_id = auth.uid() AND group_id = skills.group_id)
  );

-- Admins can manage skills:
--   platform tier → super_admin
--   group/agent tier → super_admin or group_admin of that group
CREATE POLICY "skills: admins write"
  ON skills FOR ALL
  USING (
    (tier = 'platform' AND EXISTS (
      SELECT 1 FROM user_groups WHERE user_id = auth.uid() AND role = 'super_admin'
    )) OR
    (tier IN ('group','agent') AND EXISTS (
      SELECT 1 FROM user_groups
      WHERE user_id = auth.uid()
      AND group_id = skills.group_id
      AND role IN ('super_admin','group_admin')
    ))
  );

CREATE POLICY "skill_knowledge_documents: readable by skill access"
  ON skill_knowledge_documents FOR SELECT
  USING (EXISTS (SELECT 1 FROM skills WHERE id = skill_knowledge_documents.skill_id));

CREATE POLICY "agent_skills: group members read"
  ON agent_skills FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM agents a JOIN user_groups ug ON ug.group_id = a.group_id
    WHERE a.id = agent_skills.agent_id AND ug.user_id = auth.uid()
  ));

CREATE POLICY "group_skills: group members read"
  ON group_skills FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_groups WHERE user_id = auth.uid() AND group_id = group_skills.group_id
  ));
