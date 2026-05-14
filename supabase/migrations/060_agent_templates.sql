-- 060_agent_templates.sql — Platform agent templates + platform knowledge.
--
-- Agent templates are pre-built configurations users clone when creating
-- their own agents. The template's persona / instructions / skills /
-- knowledge are hidden from the user but injected at run time by the
-- runner so the agent inherits the template's expertise without exposing
-- its IP.

CREATE TABLE IF NOT EXISTS agent_templates (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  slug                 text NOT NULL UNIQUE,
  category             text NOT NULL CHECK (category IN (
                         'legal','financial','marketing','operations',
                         'hr','general','technical','compliance')),
  description          text NOT NULL,
  summary_capabilities text NOT NULL,
  avatar_preset        text,
  avatar_url           text,
  color                text,
  persona              text,
  instructions         text,
  communication_style  text,
  response_length      text,
  default_tools        text[] NOT NULL DEFAULT '{}',
  default_complexity   text   NOT NULL DEFAULT 'standard',
  is_published         boolean NOT NULL DEFAULT false,
  is_featured          boolean NOT NULL DEFAULT false,
  sort_order           int     NOT NULL DEFAULT 0,
  use_count            int     NOT NULL DEFAULT 0,
  version              int     NOT NULL DEFAULT 1,
  created_by           uuid REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_knowledge (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  slug         text NOT NULL UNIQUE,
  category     text,
  content      text NOT NULL,
  source_url   text,
  is_active    boolean NOT NULL DEFAULT true,
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_template_skills (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES agent_templates(id) ON DELETE CASCADE,
  skill_id    uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  sort_order  int  NOT NULL DEFAULT 0,
  UNIQUE(template_id, skill_id)
);

CREATE TABLE IF NOT EXISTS agent_template_knowledge (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid NOT NULL REFERENCES agent_templates(id) ON DELETE CASCADE,
  knowledge_id uuid NOT NULL REFERENCES platform_knowledge(id) ON DELETE CASCADE,
  sort_order   int  NOT NULL DEFAULT 0,
  UNIQUE(template_id, knowledge_id)
);

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES agent_templates(id) ON DELETE SET NULL;

-- RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE agent_templates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_knowledge       ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_template_skills    ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_template_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_templates: published readable by all"
  ON agent_templates FOR SELECT
  USING (is_published = true);

CREATE POLICY "agent_templates: super admin all"
  ON agent_templates FOR ALL
  USING (EXISTS (
    SELECT 1 FROM user_groups
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ));

CREATE POLICY "platform_knowledge: readable by all"
  ON platform_knowledge FOR SELECT
  USING (is_active = true);

CREATE POLICY "platform_knowledge: super admin all"
  ON platform_knowledge FOR ALL
  USING (EXISTS (
    SELECT 1 FROM user_groups
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ));

CREATE POLICY "agent_template_skills: readable by all"
  ON agent_template_skills FOR SELECT USING (true);
CREATE POLICY "agent_template_skills: super admin all"
  ON agent_template_skills FOR ALL
  USING (EXISTS (
    SELECT 1 FROM user_groups
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ));

CREATE POLICY "agent_template_knowledge: readable by all"
  ON agent_template_knowledge FOR SELECT USING (true);
CREATE POLICY "agent_template_knowledge: super admin all"
  ON agent_template_knowledge FOR ALL
  USING (EXISTS (
    SELECT 1 FROM user_groups
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ));

-- ── Seed: three starter templates ─────────────────────────────────────────
INSERT INTO agent_templates (
  name, slug, category, description, summary_capabilities,
  avatar_preset, color, is_published, is_featured, sort_order,
  persona, instructions, communication_style, response_length
)
SELECT
  'Legal Document Review Assistant',
  'legal-document-review-assistant',
  'legal',
  'Specialised in reviewing legal documents, contracts and correspondence. Identifies key clauses, flags risks and creates structured summaries.',
  'This agent can: review contracts and identify key clauses · flag unusual or potentially harmful terms · create structured document registers · summarise complex legal documents in plain English · draft professional legal correspondence',
  '⚖️', '#1B2A4A', true, true, 10,
  'You are an experienced legal analyst with deep expertise in corporate and commercial law. You are precise, methodical and always highlight risks clearly.',
  E'When reviewing legal documents:\n- Always identify all parties and their roles\n- Flag any unusual, ambiguous or potentially harmful clauses\n- Note key dates, deadlines and obligations\n- Highlight any missing standard protections\n- Summarise key risks in plain English at the end\n- Structure your output clearly with headings',
  'formal', 'detailed'
WHERE NOT EXISTS (SELECT 1 FROM agent_templates WHERE slug = 'legal-document-review-assistant');

INSERT INTO agent_templates (
  name, slug, category, description, summary_capabilities,
  avatar_preset, color, is_published, is_featured, sort_order,
  persona, instructions, communication_style, response_length
)
SELECT
  'Financial Analyst',
  'financial-analyst',
  'financial',
  'Analyses financial statements, identifies trends and produces clear financial summaries for business owners and boards.',
  'This agent can: analyse P&L and balance sheet data · identify financial trends and anomalies · compare performance across periods · generate executive financial summaries · flag areas of concern',
  '📊', '#1D4ED8', true, true, 20,
  'You are an experienced financial analyst. You present numbers clearly, identify what matters, and always contextualise financial data within the business situation.',
  E'When analysing financial data:\n- Lead with the most important insight\n- Compare to prior periods and note significant changes\n- Flag any anomalies or areas of concern\n- Use clear, non-technical language unless the audience is financial\n- Always include a brief executive summary at the top',
  'balanced', 'balanced'
WHERE NOT EXISTS (SELECT 1 FROM agent_templates WHERE slug = 'financial-analyst');

INSERT INTO agent_templates (
  name, slug, category, description, summary_capabilities,
  avatar_preset, color, is_published, is_featured, sort_order,
  persona, instructions, communication_style, response_length
)
SELECT
  'Report Writer',
  'report-writer',
  'general',
  'Creates professional, well-structured reports and documents from briefs, data and notes. Adapts tone and format to audience.',
  'This agent can: write professional reports and documents · adapt writing style to audience · structure complex information clearly · create executive summaries · produce board-ready documents',
  '✍️', '#059669', true, true, 30,
  'You are a professional writer with experience producing high-quality business documents. You write clearly, structure well, and always consider the reader.',
  E'When writing reports and documents:\n- Always start with a clear executive summary\n- Use appropriate headings and structure\n- Match tone to the intended audience\n- Be concise — cut anything that does not add value\n- End with clear next steps or recommendations where appropriate',
  'balanced', 'balanced'
WHERE NOT EXISTS (SELECT 1 FROM agent_templates WHERE slug = 'report-writer');
