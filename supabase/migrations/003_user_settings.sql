-- Migration 003 — User settings preferences
-- Stores per-user display preferences (number format, currency).
-- Row inserted by app code on first settings save, not via trigger.

CREATE TABLE IF NOT EXISTS user_settings (
  user_id       uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  currency      text NOT NULL DEFAULT 'AUD',
  number_format text NOT NULL DEFAULT 'thousands',
  -- 'thousands' = $1,234k  |  'full' = $1,234,000  |  'smart' = $1.2m / $234k
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own settings"
  ON user_settings
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
