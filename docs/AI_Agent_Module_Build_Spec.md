# AI Agent Module — Build Specification

**Status**: Planned (stub page live at `/agents`)
**Author**: NavHub Engineering
**Last updated**: 2025-01

---

## Overview

The AI Agent module lets group administrators run automated analysis and reporting
tasks against their financial data. Agents are preconfigured workflows that consume
`financial_snapshots` data and produce structured outputs (summaries, alerts, reports).

---

## Goals

1. Allow non-technical users to trigger financial analysis without writing queries
2. Surface anomalies, trends, and benchmarks automatically
3. Support scheduled (cron) and on-demand agent runs
4. Log all agent activity for audit purposes

---

## Agent Types (Planned)

| Agent | Description | Inputs | Output |
|-------|-------------|--------|--------|
| `variance-monitor` | Detects P&L lines with > X% variance month-over-month | company_id, threshold_pct | Alert list |
| `cashflow-forecast` | Projects next 3 months of cash flow from actuals | company_id, division_id? | Forecast JSONB |
| `benchmark-report` | Compares company metrics to group median | group_id, period | Benchmark card |
| `snapshot-summary` | Produces a plain-English summary of a period snapshot | snapshot_id | Markdown string |
| `data-quality-check` | Flags missing or implausible data in financial_snapshots | group_id, period | Issue list |

---

## Data Flow

```
User triggers agent (UI or cron)
    ↓
POST /api/agents/run  { agent_type, entity, params }
    ↓
API route validates session + group membership
    ↓
Agent worker reads financial_snapshots (admin client)
    ↓
Calls Claude API (claude-sonnet-4-6) with structured prompt
    ↓
Saves result to agent_runs table
    ↓
Returns { run_id, status, output }
```

---

## Database Tables (to be added in a future migration)

```sql
-- Track each agent execution
CREATE TABLE agent_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid NOT NULL REFERENCES groups(id),
  company_id    uuid REFERENCES companies(id),
  division_id   uuid REFERENCES divisions(id),
  agent_type    text NOT NULL,
  status        text NOT NULL DEFAULT 'pending',  -- pending|running|success|error
  params        jsonb,
  output        jsonb,
  error_message text,
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id)
);

-- RLS: users can only see runs for their groups
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_runs_group_access" ON agent_runs
  USING (group_id = ANY(get_user_group_ids()));
```

---

## API Routes (to be built)

```
POST   /api/agents/run             # Trigger an agent run
GET    /api/agents/runs            # List runs for active group
GET    /api/agents/runs/[id]       # Get run detail + output
DELETE /api/agents/runs/[id]       # Cancel a pending run
```

### POST /api/agents/run body

```json
{
  "agent_type":  "variance-monitor",
  "company_id":  "uuid",
  "division_id": null,
  "params": {
    "period":        "2025-01",
    "threshold_pct": 15
  }
}
```

---

## Claude Integration

All agents call the Claude API using `claude-sonnet-4-6`.

### Prompt pattern (variance-monitor example)

```
System: You are a financial analyst reviewing P&L data for a business group.
        Return ONLY valid JSON matching the schema provided.

User:   Here is the P&L data for [Company] for [Period]:
        [financial_snapshots.data as JSON]

        Identify all line items where the month-over-month change exceeds 15%.
        Return: { alerts: [{ account_name, current, prior, pct_change, direction }] }
```

### SDK Usage

```typescript
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const message = await client.messages.create({
  model:      'claude-sonnet-4-6',
  max_tokens: 1024,
  system:     SYSTEM_PROMPT,
  messages:   [{ role: 'user', content: userPrompt }],
})
```

---

## UI (Planned)

Located at `/agents`. Stub currently shows "Coming Soon".

### Phase 1 UI
- List of available agent types with descriptions
- "Run" button per agent type → opens a param form (entity selector + agent params)
- Run history table (status, entity, started_at, view output)

### Phase 2 UI
- Real-time status polling while agent runs
- Inline output viewer (renders structured JSON as human-readable cards)
- Scheduled runs configuration per agent

---

## Environment Variables to Add

```bash
ANTHROPIC_API_KEY=    # Claude API key
```

---

## Implementation Order

1. Add `agent_runs` migration (003_agent_runs.sql)
2. Install `@anthropic-ai/sdk`
3. Create `lib/agents/` directory with agent worker functions
4. Build `/api/agents/run` and `/api/agents/runs` routes
5. Build agent UI at `/agents` (replace stub)
6. Add ANTHROPIC_API_KEY to Vercel environment
7. Test end-to-end with `variance-monitor` agent

---

## Notes

- Agents always use the **admin client** to read `financial_snapshots` (bypasses RLS;
  group ownership verified manually before calling Claude)
- All money values are in **cents** — divide by 100 before including in prompts
- Claude output is stored raw in `agent_runs.output` and rendered client-side
- Agent runs are fire-and-forget initially (no streaming); polling every 2s is fine
  for the first iteration
