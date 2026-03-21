-- Phase 8b+8c: Extend marketing_connections with OAuth token storage fields
-- These fields support Google, Meta, and LinkedIn OAuth integrations

ALTER TABLE marketing_connections
  ADD COLUMN IF NOT EXISTS access_token_expires_at  timestamptz,
  ADD COLUMN IF NOT EXISTS scope                    text,
  ADD COLUMN IF NOT EXISTS external_account_id      text,
  ADD COLUMN IF NOT EXISTS external_account_name    text;
