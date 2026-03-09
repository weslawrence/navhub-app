-- ============================================================
-- Migration 008 — Settings overhaul + Excel upload pipeline
-- Phase 3b
-- ============================================================

-- Add fy_end_month to user_settings
-- 6 = June (AU standard), 12 = December (calendar year), etc.
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS fy_end_month integer DEFAULT 6
    CHECK (fy_end_month BETWEEN 1 AND 12);

-- Add structured fields to excel_uploads for the new upload pipeline
ALTER TABLE excel_uploads
  ADD COLUMN IF NOT EXISTS report_type  text
    CHECK (report_type IN ('pl', 'bs', 'tb')),
  ADD COLUMN IF NOT EXISTS period_value text,
  ADD COLUMN IF NOT EXISTS column_mapping jsonb,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'processed'
    CHECK (status IN ('processed', 'error')),
  ADD COLUMN IF NOT EXISTS error_message text;
