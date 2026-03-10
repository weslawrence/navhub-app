-- ============================================================
-- Phase 4a — 13-Week Rolling Cash Flow Forecast (Manual Mode)
-- ============================================================

-- cashflow_settings: one row per company
CREATE TABLE IF NOT EXISTS cashflow_settings (
  company_id            uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  opening_balance_cents bigint      NOT NULL DEFAULT 0,
  week_start_day        integer     NOT NULL DEFAULT 1
    CHECK (week_start_day BETWEEN 0 AND 6),   -- 0=Sun, 1=Mon
  ar_lag_days           integer     NOT NULL DEFAULT 30,
  ap_lag_days           integer     NOT NULL DEFAULT 30,
  currency              text        NOT NULL DEFAULT 'AUD',
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- cashflow_items: recurring and one-off line items
CREATE TABLE IF NOT EXISTS cashflow_items (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  label          text        NOT NULL,
  section        text        NOT NULL
    CHECK (section IN ('inflow', 'regular_outflow', 'payable')),
  amount_cents   bigint      NOT NULL DEFAULT 0,
  recurrence     text        NOT NULL
    CHECK (recurrence IN ('weekly', 'fortnightly', 'monthly', 'one_off')),
  start_date     date        NOT NULL,
  end_date       date,
  day_of_week    integer     CHECK (day_of_week BETWEEN 0 AND 6),
  day_of_month   integer     CHECK (day_of_month BETWEEN 1 AND 31),
  pending_review boolean     NOT NULL DEFAULT false,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- cashflow_xero_items: stub for Phase 4b (Xero AR/AP pull)
CREATE TABLE IF NOT EXISTS cashflow_xero_items (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  xero_invoice_id  text        NOT NULL,
  contact_name     text        NOT NULL,
  amount_cents     bigint      NOT NULL DEFAULT 0,
  due_date         date        NOT NULL,
  section          text        NOT NULL
    CHECK (section IN ('inflow', 'payable')),
  is_overridden    boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- cashflow_forecasts: auto-saved forecast state (one row per company, upserted)
CREATE TABLE IF NOT EXISTS cashflow_forecasts (
  company_id  uuid        PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  grid_data   jsonb       NOT NULL DEFAULT '{}',
  saved_at    timestamptz NOT NULL DEFAULT now()
);

-- cashflow_snapshots: named saved versions
CREATE TABLE IF NOT EXISTS cashflow_snapshots (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  notes       text,
  grid_data   jsonb       NOT NULL DEFAULT '{}',
  created_by  uuid        NOT NULL REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS cashflow_items_company_id
  ON cashflow_items(company_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS cashflow_xero_items_company_id
  ON cashflow_xero_items(company_id);
CREATE INDEX IF NOT EXISTS cashflow_snapshots_company_id
  ON cashflow_snapshots(company_id);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE cashflow_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashflow_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashflow_xero_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashflow_forecasts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashflow_snapshots   ENABLE ROW LEVEL SECURITY;

-- Helper subquery: company IDs accessible to the current user
-- (reuses get_user_group_ids() defined in migration 001)

-- cashflow_settings
CREATE POLICY "cashflow_settings_group_access" ON cashflow_settings
  FOR ALL
  USING (
    company_id IN (
      SELECT c.id FROM companies c
      WHERE c.group_id = ANY(get_user_group_ids())
    )
  );

-- cashflow_items
CREATE POLICY "cashflow_items_group_access" ON cashflow_items
  FOR ALL
  USING (
    company_id IN (
      SELECT c.id FROM companies c
      WHERE c.group_id = ANY(get_user_group_ids())
    )
  );

-- cashflow_xero_items
CREATE POLICY "cashflow_xero_items_group_access" ON cashflow_xero_items
  FOR ALL
  USING (
    company_id IN (
      SELECT c.id FROM companies c
      WHERE c.group_id = ANY(get_user_group_ids())
    )
  );

-- cashflow_forecasts
CREATE POLICY "cashflow_forecasts_group_access" ON cashflow_forecasts
  FOR ALL
  USING (
    company_id IN (
      SELECT c.id FROM companies c
      WHERE c.group_id = ANY(get_user_group_ids())
    )
  );

-- cashflow_snapshots
CREATE POLICY "cashflow_snapshots_group_access" ON cashflow_snapshots
  FOR ALL
  USING (
    company_id IN (
      SELECT c.id FROM companies c
      WHERE c.group_id = ANY(get_user_group_ids())
    )
  );
