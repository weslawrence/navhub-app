-- ─── Migration 005 — Revenue Forecast Model ─────────────────────────────────
-- Adds forecast_streams (per-group stream config) and
-- forecast_user_state (per-user UI state snapshot).

-- ── Revenue streams ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS forecast_streams (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id             uuid        NOT NULL REFERENCES groups ON DELETE CASCADE,
  name                 text        NOT NULL,
  tag                  text        NOT NULL DEFAULT 'Revenue',
  color                text        NOT NULL DEFAULT '#4ade80',
  y1_baseline          bigint      NOT NULL DEFAULT 0,
    -- stored as cents, same convention as financial_snapshots
  default_growth_rate  integer     NOT NULL DEFAULT 20,
    -- percentage integer, e.g. 20 = 20%
  default_gp_margin    integer     NOT NULL DEFAULT 40,
    -- percentage integer, e.g. 40 = 40%
  sort_order           integer     NOT NULL DEFAULT 0,
  is_active            boolean     NOT NULL DEFAULT true,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

ALTER TABLE forecast_streams ENABLE ROW LEVEL SECURITY;

-- Any group member can read active streams
CREATE POLICY "Group members can read forecast streams"
  ON forecast_streams FOR SELECT
  USING (
    group_id IN (
      SELECT group_id FROM user_groups
      WHERE user_id = auth.uid()
    )
  );

-- Only group admins can insert / update / delete
CREATE POLICY "Group admins can manage forecast streams"
  ON forecast_streams FOR ALL
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

-- ── User forecast state ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS forecast_user_state (
  user_id     uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  group_id    uuid        NOT NULL REFERENCES groups     ON DELETE CASCADE,
  state       jsonb       NOT NULL DEFAULT '{}',
    -- { year: number, showGP: boolean, showAll: boolean,
    --   rates: { [stream_id]: { gr: number, gp: number } } }
  updated_at  timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, group_id)
);

ALTER TABLE forecast_user_state ENABLE ROW LEVEL SECURITY;

-- Users can fully manage their own state row
CREATE POLICY "Users manage own forecast state"
  ON forecast_user_state FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
