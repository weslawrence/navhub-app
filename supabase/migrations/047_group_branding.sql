-- 047_group_branding.sql — Per-group white-label branding (logo + brand name + accent colour)

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS brand_name  text,
  ADD COLUMN IF NOT EXISTS brand_color text DEFAULT '#6366f1',
  ADD COLUMN IF NOT EXISTS logo_url    text;

-- Note: existing palette_id + primary_color columns are kept for the palette
-- system; brand_color is a separate per-group accent override that branded
-- groups can use independently of the palette.
