-- ============================================================
-- Migration 024: Marketing Intelligence Foundation
-- ============================================================

-- Marketing platform connections
CREATE TABLE IF NOT EXISTS marketing_connections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id              uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  company_id            uuid REFERENCES companies(id) ON DELETE CASCADE,
  platform              text NOT NULL CHECK (platform IN (
                          'ga4','search_console','meta','linkedin',
                          'google_ads','meta_ads','mailchimp','hubspot','freshsales'
                        )),
  credentials_encrypted text,
  config                jsonb NOT NULL DEFAULT '{}',
  is_active             boolean NOT NULL DEFAULT true,
  last_synced_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, company_id, platform)
);

-- Marketing metric snapshots
CREATE TABLE IF NOT EXISTS marketing_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  company_id    uuid REFERENCES companies(id) ON DELETE CASCADE,
  platform      text NOT NULL,
  metric_key    text NOT NULL,
  value_number  numeric,
  value_text    text,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  period_type   text NOT NULL DEFAULT 'month'
                CHECK (period_type IN ('day','week','month')),
  source        text NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual','ga4','search_console','meta',
                                  'linkedin','google_ads','meta_ads',
                                  'mailchimp','hubspot','freshsales')),
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, company_id, platform, metric_key, period_start, period_type)
);

-- Marketing database/CRM contact counts
CREATE TABLE IF NOT EXISTS marketing_database_snapshots (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id                 uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  company_id               uuid REFERENCES companies(id) ON DELETE CASCADE,
  platform                 text NOT NULL,
  total_contacts           integer,
  active_contacts          integer,
  new_this_period          integer,
  unsubscribed_this_period integer,
  snapshot_date            date NOT NULL,
  source                   text NOT NULL DEFAULT 'manual',
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, company_id, platform, snapshot_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_marketing_snapshots_group
  ON marketing_snapshots(group_id, company_id, platform, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_snapshots_period
  ON marketing_snapshots(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_marketing_db_snapshots_group
  ON marketing_database_snapshots(group_id, company_id, platform, snapshot_date DESC);

-- RLS policies
ALTER TABLE marketing_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_database_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view marketing_connections"
  ON marketing_connections FOR SELECT
  USING (group_id = ANY(get_user_group_ids()));

CREATE POLICY "Group admins can manage marketing_connections"
  ON marketing_connections FOR ALL
  USING (is_group_admin(group_id))
  WITH CHECK (is_group_admin(group_id));

CREATE POLICY "Group members can view marketing_snapshots"
  ON marketing_snapshots FOR SELECT
  USING (group_id = ANY(get_user_group_ids()));

CREATE POLICY "Group members can insert marketing_snapshots"
  ON marketing_snapshots FOR INSERT
  WITH CHECK (group_id = ANY(get_user_group_ids()));

CREATE POLICY "Group admins can update marketing_snapshots"
  ON marketing_snapshots FOR UPDATE
  USING (is_group_admin(group_id));

CREATE POLICY "Group admins can delete marketing_snapshots"
  ON marketing_snapshots FOR DELETE
  USING (is_group_admin(group_id));

CREATE POLICY "Group members can view marketing_database_snapshots"
  ON marketing_database_snapshots FOR SELECT
  USING (group_id = ANY(get_user_group_ids()));

CREATE POLICY "Group members can insert marketing_database_snapshots"
  ON marketing_database_snapshots FOR INSERT
  WITH CHECK (group_id = ANY(get_user_group_ids()));

CREATE POLICY "Group admins can manage marketing_database_snapshots"
  ON marketing_database_snapshots FOR ALL
  USING (is_group_admin(group_id));
