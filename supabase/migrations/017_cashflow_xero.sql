-- 017_cashflow_xero.sql
-- Phase 4b — Xero AR/AP Cash Flow Integration
-- Extends cashflow_settings and cashflow_xero_items for Xero AR/AP pull

-- ── cashflow_settings ─────────────────────────────────────────────────────────
-- Optional: which bank account to use as the opening balance source
ALTER TABLE cashflow_settings
  ADD COLUMN IF NOT EXISTS bank_account_id text;

-- ── cashflow_xero_items ───────────────────────────────────────────────────────
-- New columns to hold richer Xero invoice data and sync state

ALTER TABLE cashflow_xero_items
  ADD COLUMN IF NOT EXISTS xero_contact_name text,
  ADD COLUMN IF NOT EXISTS xero_due_date     date,
  ADD COLUMN IF NOT EXISTS xero_amount_due   bigint,
  ADD COLUMN IF NOT EXISTS invoice_type      text
    CHECK (invoice_type IN ('AR', 'AP')),
  ADD COLUMN IF NOT EXISTS sync_status       text NOT NULL DEFAULT 'synced'
    CHECK (sync_status IN ('pending', 'synced', 'overridden', 'excluded')),
  ADD COLUMN IF NOT EXISTS overridden_week   date,
  ADD COLUMN IF NOT EXISTS overridden_amount bigint,
  ADD COLUMN IF NOT EXISTS last_synced_at    timestamptz;

-- ── Performance index ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cashflow_xero_items_company
  ON cashflow_xero_items (company_id, invoice_type, sync_status);
