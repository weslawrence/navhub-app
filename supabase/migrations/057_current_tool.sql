-- 057_current_tool.sql — Live "what tool is running right now" pointer.
--
-- The runner sets this column to the tool name immediately before invoking
-- executeTool() and clears it back to NULL once the tool returns. The
-- stream-route poller reads this column on every tick and emits a
-- tool_start event the moment it changes — so the run-detail UI can show
-- "Reading documents…" as soon as the tool starts, instead of waiting
-- until the tool's persisted output appears in tool_calls.

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS current_tool text;
