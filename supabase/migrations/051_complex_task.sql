-- 051_complex_task.sql — Per-run "complex task" mode (raises iteration cap).
--
-- Also acts as a no-op safety drop for any historical character/length
-- CHECK constraints that may have been added on documents.title or
-- documents.content_markdown — none currently exist in the migrations,
-- but the IF EXISTS guard means this is safe to run anywhere.

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS complex_task boolean NOT NULL DEFAULT false;

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_title_check,
  DROP CONSTRAINT IF EXISTS documents_content_check,
  DROP CONSTRAINT IF EXISTS documents_title_chars_check,
  DROP CONSTRAINT IF EXISTS documents_content_chars_check;

ALTER TABLE custom_reports
  DROP CONSTRAINT IF EXISTS custom_reports_name_check,
  DROP CONSTRAINT IF EXISTS custom_reports_title_chars_check;
