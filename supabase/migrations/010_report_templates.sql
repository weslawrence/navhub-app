-- ============================================================
-- Phase 5a — Report Template Infrastructure
-- ============================================================

-- report_templates: reusable HTML report scaffolds
CREATE TABLE IF NOT EXISTS report_templates (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id            uuid        NOT NULL REFERENCES groups ON DELETE CASCADE,
  name                text        NOT NULL,
  description         text,
  template_type       text        NOT NULL
    CHECK (template_type IN ('financial','matrix','narrative','dashboard','workflow')),
  version             integer     NOT NULL DEFAULT 1,
  design_tokens       jsonb       NOT NULL DEFAULT '{}',
  slots               jsonb       NOT NULL DEFAULT '[]',
  scaffold_html       text,
  scaffold_css        text,
  scaffold_js         text,
  data_sources        jsonb       DEFAULT '[]',
  agent_instructions  text,
  created_by          uuid        REFERENCES auth.users ON DELETE SET NULL,
  agent_run_id        uuid        REFERENCES agent_runs ON DELETE SET NULL,
  is_active           boolean     NOT NULL DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- report_template_versions: version history for each template
CREATE TABLE IF NOT EXISTS report_template_versions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   uuid        NOT NULL REFERENCES report_templates ON DELETE CASCADE,
  version       integer     NOT NULL,
  design_tokens jsonb,
  slots         jsonb,
  scaffold_html text,
  scaffold_css  text,
  scaffold_js   text,
  saved_by      uuid        REFERENCES auth.users ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now()
);

-- Extend custom_reports with template linkage
ALTER TABLE custom_reports
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES report_templates ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS slot_data   jsonb;

-- Indexes
CREATE INDEX IF NOT EXISTS report_templates_group_id
  ON report_templates(group_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS report_template_versions_template_id
  ON report_template_versions(template_id);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE report_templates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_template_versions ENABLE ROW LEVEL SECURITY;

-- All group members can view templates
CREATE POLICY "Group members can view templates"
  ON report_templates FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM user_groups WHERE user_id = auth.uid()
    )
  );

-- Group admins can manage templates (create/update/delete)
CREATE POLICY "Group admins can manage templates"
  ON report_templates FOR ALL
  USING (
    group_id IN (
      SELECT group_id FROM user_groups
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'group_admin')
    )
  );

-- All group members can view template versions
CREATE POLICY "Group members can view template versions"
  ON report_template_versions FOR SELECT
  USING (
    template_id IN (
      SELECT id FROM report_templates
      WHERE group_id IN (
        SELECT group_id FROM user_groups WHERE user_id = auth.uid()
      )
    )
  );

-- Group admins can manage template versions
CREATE POLICY "Group admins can manage template versions"
  ON report_template_versions FOR ALL
  USING (
    template_id IN (
      SELECT id FROM report_templates
      WHERE group_id IN (
        SELECT group_id FROM user_groups
        WHERE user_id = auth.uid()
          AND role IN ('super_admin', 'group_admin')
      )
    )
  );
