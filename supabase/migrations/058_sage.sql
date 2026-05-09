-- 058_sage.sql — Sage: platform intelligence agent.
--
-- Sage is a super-admin-only analyst that reviews platform-wide patterns
-- (agent runs, errors, stuck runs, token usage, stale invites, user
-- suggestions) and emits structured findings. Three tables:
--   • sage_scans     — log of when Sage ran and what it produced
--   • sage_findings  — individual observations from a scan
--   • user_suggestions — feedback users submit; Sage triages them

-- Each finding carries observation / interpretation / recommendation as
-- separate columns so the UI can layer them, plus an action_type tag so
-- the operator knows whether they can act unilaterally or need to escalate.
CREATE TABLE IF NOT EXISTS sage_findings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid,
  finding_type    text NOT NULL CHECK (finding_type IN (
                    'performance','usage','friction','security',
                    'feature','health','suggestion','alert')),
  severity        text NOT NULL DEFAULT 'info'
                  CHECK (severity IN ('critical','warning','info','positive')),
  action_type     text NOT NULL DEFAULT 'awareness'
                  CHECK (action_type IN ('operator_can_act','escalate_to_builder','awareness')),
  title           text NOT NULL,
  observation     text NOT NULL,
  interpretation  text NOT NULL,
  recommendation  text,
  affected_groups uuid[],
  affected_count  int,
  cluster_key     text,
  status          text NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new','acknowledged','acting','resolved','dismissed')),
  dismissed_reason text,
  acknowledged_by uuid REFERENCES auth.users(id),
  acknowledged_at timestamptz,
  scan_type       text NOT NULL DEFAULT 'weekly'
                  CHECK (scan_type IN ('weekly','daily','adhoc','alert','requested')),
  period_start    timestamptz,
  period_end      timestamptz,
  raw_data        jsonb,
  scan_id         uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sage_findings_status      ON sage_findings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sage_findings_severity    ON sage_findings(severity);
CREATE INDEX IF NOT EXISTS idx_sage_findings_scan_id     ON sage_findings(scan_id);

CREATE TABLE IF NOT EXISTS sage_scans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_type     text NOT NULL CHECK (scan_type IN ('weekly','daily','adhoc','alert','requested')),
  triggered_by  uuid REFERENCES auth.users(id),
  status        text NOT NULL DEFAULT 'running'
                CHECK (status IN ('running','complete','failed')),
  findings_count int NOT NULL DEFAULT 0,
  critical_count int NOT NULL DEFAULT 0,
  summary       text,
  focus_area    text,
  period_days   int,
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_sage_scans_started ON sage_scans(started_at DESC);

CREATE TABLE IF NOT EXISTS user_suggestions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        uuid REFERENCES groups(id) ON DELETE SET NULL,
  submitted_by    uuid REFERENCES auth.users(id),
  what_trying     text NOT NULL,
  what_happened   text NOT NULL,
  what_wanted     text NOT NULL,
  category        text CHECK (category IN ('feature_request','bug_report','workflow_friction','knowledge_gap','other')),
  sage_triage     jsonb,
  status          text NOT NULL DEFAULT 'submitted'
                  CHECK (status IN ('submitted','triaged','acknowledged','acting','declined','shipped')),
  operator_note   text,
  user_notified_at timestamptz,
  sage_finding_id uuid REFERENCES sage_findings(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_suggestions_status ON user_suggestions(status, created_at DESC);

ALTER TABLE sage_findings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sage_scans       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_suggestions ENABLE ROW LEVEL SECURITY;

-- Sage data is super_admin-only.
CREATE POLICY "sage_findings: super admin only"
  ON sage_findings FOR ALL
  USING (EXISTS (
    SELECT 1 FROM user_groups
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ));

CREATE POLICY "sage_scans: super admin only"
  ON sage_scans FOR ALL
  USING (EXISTS (
    SELECT 1 FROM user_groups
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ));

-- Users see their own suggestions.
CREATE POLICY "user_suggestions: users manage own"
  ON user_suggestions FOR ALL
  USING (submitted_by = auth.uid());

-- Super admins see everyone's.
CREATE POLICY "user_suggestions: super admin all"
  ON user_suggestions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM user_groups
    WHERE user_id = auth.uid() AND role = 'super_admin'
  ));
