# CLAUDE.md — NavHub Codebase Reference

## Project Overview

NavHub is a multi-tenant financial dashboard for business groups to monitor performance
across companies and divisions.

- **App URL**: https://app.navhub.co
- **Stack**: Next.js 14.2.35, Supabase, Tailwind CSS, shadcn/ui
- **Deployed on**: Vercel
- **DNS**: Cloudflare

---

## Hierarchy

```
Group        ← top-level tenant (e.g. "Navigate Group")
  └── Company      ← legal entity or brand
        └── Division     ← optional department or BU
```

- Division is optional per company
- Integrations attach at either Company OR Division level (not both — enforced by CHECK constraint)
- Reporting rolls up: Division → Company → Group

---

## Tech Stack & Versions

| Package               | Version  | Purpose                                    |
|-----------------------|----------|--------------------------------------------|
| next                  | 14.2.35  | App Router, Server Components, API Routes  |
| react / react-dom     | ^18      | UI framework                               |
| @supabase/ssr         | 0.8.0    | SSR-safe Supabase client (browser + server)|
| @supabase/supabase-js | ^2       | Base Supabase client (admin only)          |
| next-themes           | latest   | Dark/light theme with system default       |
| tailwindcss           | ^3.4.1   | Utility-first CSS                          |
| tailwindcss-animate   | latest   | Animation utilities for shadcn             |
| lucide-react          | latest   | Icon set                                   |
| react-dropzone        | latest   | Drag-and-drop file uploads                 |
| xlsx                  | latest   | Parse .xlsx / .xls files                  |
| xero-node             | latest   | Xero OAuth client (connect route only)     |
| class-variance-authority | latest | shadcn component variants                 |
| clsx + tailwind-merge | latest   | cn() utility for conditional classes      |
| @radix-ui/react-switch | latest  | Toggle switch primitive (Phase 2a)         |
| @radix-ui/react-alert-dialog | latest | Confirm dialog primitive (Phase 2a)  |

**Critical constraints**:
- ONLY `@supabase/ssr` — do NOT install `auth-helpers-nextjs` or `@supabase/auth-helpers-nextjs`
- Pin Next.js at `14.2.35` — do not upgrade without testing

---

## File Tree

```
app/
  (auth)/
    actions.ts              # Server actions: signIn, signOut, switchGroup
    login/page.tsx          # Login page — minimal card with email+password
  (dashboard)/
    layout.tsx              # Auth check, loads active group, injects --group-primary
    dashboard/page.tsx      # Dashboard — 4-card layout: Overview, Position, Performance, Status
    agents/
      page.tsx              # Agent list — 3-col grid, Run/Edit/History buttons (Phase 3a)
      _form.tsx             # Shared create/edit form — 4 tabs: Identity, Behaviour, Tools, Credentials
      new/page.tsx          # Create agent
      [id]/
        edit/page.tsx       # Edit agent
        runs/page.tsx       # Run history — paginated table
      runs/
        [runId]/page.tsx    # Run stream view — SSE display + tool call blocks
    companies/
      page.tsx              # Companies list — client component, is_active toggle
      new/page.tsx          # Create company form
      [id]/
        page.tsx            # Company detail — divisions table, Xero section
        edit/page.tsx       # Edit company + Danger Zone (deactivate)
        divisions/
          new/page.tsx      # Create division form
          [divisionId]/
            page.tsx        # Division detail — Xero section
            edit/page.tsx   # Edit division + Danger Zone
    integrations/page.tsx   # Xero connection status + Excel upload + ConnectXero
    settings/page.tsx       # Display / Group / Members tabs — prefs, palette, invites (Phase 2f)
    reports/
      profit-loss/page.tsx  # P&L detail — period selector, summary/detail toggle, company columns
      balance-sheet/page.tsx # Balance Sheet detail — same layout + Net Assets highlight
      custom/
        page.tsx            # Reports Library — tile grid + upload panel (admin) (Phase 2f)
        [id]/page.tsx       # Report viewer — full-height iframe + toolbar (Phase 2f)
    forecasting/
      page.tsx              # Redirect → /forecasting/revenue
      revenue/page.tsx      # Interactive 7-year revenue model (client, sliders + charts)
      setup/page.tsx        # Stream configuration — admin creates/edits/reorders streams
  api/
    companies/
      route.ts              # GET (list + division_count + has_xero + last_synced_at) | POST
      [id]/route.ts         # GET (single + divisions) | PATCH | DELETE (soft)
    divisions/
      route.ts              # GET (list by company_id) | POST (create + slug)
      [id]/route.ts         # GET (single + parent) | PATCH | DELETE (soft)
    dashboard/
      summary/route.ts      # GET — aggregated metrics for active group (Phase 2b)
    reports/
      periods/route.ts      # GET — distinct periods available in financial_snapshots
      data/route.ts         # GET — snapshot data per company for ?type=&period=
      custom/
        route.ts            # GET (list active reports) | POST (upload HTML file, multipart)
        [id]/route.ts       # DELETE (soft delete + Storage remove)
        [id]/file/route.ts  # GET — 1-hour signed URL for report file
    forecast/
      streams/route.ts      # GET (active streams by sort_order) | POST (admin only)
      streams/[id]/route.ts # PATCH (update fields) | DELETE (soft delete, admin only)
      state/route.ts        # GET (user state or defaults) | PATCH (upsert state)
    settings/route.ts       # GET (user prefs) | PATCH (upsert)
    groups/
      route.ts              # GET (all user groups + counts) | POST (create new group) (Phase 2f)
      active/route.ts       # GET — active group + user role (used by settings page)
      [id]/route.ts         # PATCH — update group fields (palette_id, name; admin only)
      [id]/members/route.ts         # GET — list members with emails (admin only) (Phase 2f)
      [id]/members/[userId]/route.ts # PATCH (role) | DELETE (remove member) (Phase 2f)
      [id]/invites/route.ts         # GET (pending) | POST (create invite) (Phase 2f)
      [id]/invites/[inviteId]/route.ts # DELETE — cancel invite (Phase 2f)
    xero/
      connect/route.ts      # GET — start Xero OAuth flow
      callback/route.ts     # GET — handle Xero OAuth callback, store tokens
      sync/
        profit-loss/route.ts
        balance-sheet/route.ts
        cashflow/route.ts
        all/route.ts        # POST — sync all connections; accepts optional { period? } body
    cron/
      xero-sync/route.ts    # GET — nightly batch sync (Vercel Cron)
    agents/
      route.ts              # GET (list active agents) | POST (create, admin) (Phase 3a)
      [id]/route.ts         # GET | PATCH | DELETE (soft) (Phase 3a)
      [id]/credentials/route.ts # GET (no values) | POST (encrypt + store) (Phase 3a)
      [id]/credentials/[credId]/route.ts # PATCH (re-encrypt) | DELETE (hard) (Phase 3a)
      [id]/run/route.ts     # POST — create queued run record → returns run_id (Phase 3a)
      [id]/runs/route.ts    # GET — paginated run history (Phase 3a)
      runs/[runId]/info/route.ts  # GET — run + agent metadata (Phase 3a)
      runs/[runId]/stream/route.ts # GET — SSE stream; executes or replays run (Phase 3a)
    excel/
      upload/route.ts       # POST — upload+parse Excel, upsert financial_snapshots
  layout.tsx                # Root HTML shell — ThemeProvider, metadata
  page.tsx                  # "/" → redirect to /dashboard
  globals.css               # Tailwind base + shadcn CSS vars + --group-primary

components/
  ui/
    button.tsx
    input.tsx
    label.tsx
    card.tsx
    badge.tsx
    separator.tsx
    dropdown-menu.tsx
    tooltip.tsx
    avatar.tsx
    progress.tsx
    toggle-switch.tsx       # Radix Switch wrapper (Phase 2a)
    confirm-dialog.tsx      # Radix AlertDialog wrapper (Phase 2a)
  layout/
    AppShell.tsx            # CLIENT: top bar + collapsible sidebar + Reports nav group
    GroupSwitcher.tsx       # CLIENT: group dropdown with colour swatches
  companies/
    CompanyForm.tsx         # CLIENT: reusable create/edit form for companies
    DivisionForm.tsx        # CLIENT: reusable create/edit form for divisions
  dashboard/
    DashboardCard.tsx       # CLIENT: wrapper with loading skeleton + error state (Phase 2b)
  integrations/
    ConnectXero.tsx         # CLIENT: entity selector + confirm dialog + OAuth popup
    SyncButton.tsx          # CLIENT: period selector + sync P&L/Balance Sheet buttons
  agents/
    RunModal.tsx            # CLIENT: period/company selector + POST run → navigate to stream (Phase 3a)
  excel/
    ExcelUpload.tsx         # CLIENT: drag-and-drop uploader, Step 1/Step 2 progression

lib/
  supabase/
    client.ts               # Browser client (createBrowserClient)
    server.ts               # Server client (createServerClient + cookie try-catch)
    admin.ts                # Admin client (service role, bypasses RLS, server only)
  xero.ts                   # Xero OAuth helpers + token management + data normalisation
  themes.ts                 # Palette definitions + getPalette() + buildPaletteCSS() (Phase 2c)
  financial.ts              # extractRows(), getRowValue(), sumGroupTotal(), getPeriodLabel() (Phase 2d)
  types.ts                  # TypeScript types for all DB entities + financial data + agent types
  utils.ts                  # cn(), formatCurrency(amount,format,currency), formatVariance(), period helpers, generateSlug()
  encryption.ts             # AES-256-GCM encrypt/decrypt — server only (Phase 3a)
  agent-tools.ts            # Tool implementations: read_financials, send_email etc (Phase 3a)
  agent-runner.ts           # Execution engine: streaming Claude/GPT-4o, tool loop, run persistence (Phase 3a)

supabase/
  migrations/
    001_initial_schema.sql  # All tables, enums, RLS, helper functions
    002_companies_divisions.sql  # ADD description, industry, is_active to companies + divisions
    003_user_settings.sql   # user_settings table with currency + number_format prefs (Phase 2b)
    004_group_palette.sql   # ADD palette_id to groups (Phase 2c)
    005_forecast.sql        # forecast_streams + forecast_user_state tables + RLS (Phase 2e)
    006_group_management.sql # group_invites + custom_reports tables + RLS (Phase 2f)
    007_agents.sql          # agents + agent_credentials + agent_runs + agent_schedules (Phase 3a)

docs/
  AI_Agent_Module_Build_Spec.md  # Agent module spec (Claude API integration plan)

middleware.ts               # Session check — protect all routes, /api/cron excluded
vercel.json                 # Cron job: /api/cron/xero-sync at 02:00 AEST daily
.env.local.example          # Required environment variables
CLAUDE.md                   # This file
```

---

## Supabase Client Patterns

### Browser Client (`lib/supabase/client.ts`)
```typescript
import { createClient } from '@/lib/supabase/client'
const supabase = createClient()
```
- Used in `'use client'` components
- Subject to RLS

### Server Client (`lib/supabase/server.ts`)
```typescript
import { createClient } from '@/lib/supabase/server'
const supabase = createClient()
```
- Used in Server Components, layouts, and API routes (reads)
- Subject to RLS (anon key)

### Admin Client (`lib/supabase/admin.ts`)
```typescript
import { createAdminClient } from '@/lib/supabase/admin'
const admin = createAdminClient()
```
- **SERVER ONLY** — service role key, bypasses RLS
- Used for: cron sync, Excel upload processing, Xero token refresh, **CRUD writes in API routes**

**Rule**: reads in client components → browser client; reads in API routes → server client (RLS check); writes in API routes → admin client (after manual group verification).

---

## Auth Flow

1. User visits `/login`, submits email + password
2. `signIn()` server action calls `supabase.auth.signInWithPassword()`
3. Finds `is_default` group in `user_groups`, sets `active_group_id` cookie
4. Redirects to `/dashboard`
5. `signOut()` clears session + cookie, redirects to `/login`

### Active Group in API Routes
```typescript
const cookieStore = cookies()
const activeGroupId = cookieStore.get('active_group_id')?.value
```

---

## Multi-Tenant RLS

All tables use Row Level Security. Access is governed by:

```sql
CREATE FUNCTION get_user_group_ids() RETURNS uuid[] ...
CREATE FUNCTION is_group_admin(gid uuid) RETURNS boolean ...
CREATE FUNCTION can_access_division(div_id uuid) RETURNS boolean ...
```

**Hierarchy access rules**:
- `super_admin` / `group_admin`: full access within their groups
- `company_viewer`: read access to all companies and divisions in their group
- `division_viewer`: read access restricted to divisions listed in `user_divisions`

**Critical**: RLS is the security layer. Never substitute with app-level filtering.

---

## CRUD API Route Pattern (Phase 2a)

Company and Division CRUD uses API routes (not server actions).

```
GET    /api/companies              → list (include_inactive param)
POST   /api/companies              → create
GET    /api/companies/[id]         → single + divisions[]
PATCH  /api/companies/[id]         → update fields
DELETE /api/companies/[id]         → soft delete (is_active = false)

GET    /api/divisions?company_id=  → list for company
POST   /api/divisions              → create (body: company_id required)
GET    /api/divisions/[id]         → single + parent company
PATCH  /api/divisions/[id]         → update fields
DELETE /api/divisions/[id]         → soft delete (is_active = false)
```

### Ownership verification pattern in PATCH/DELETE
```typescript
// 1. Read with server client (RLS enforces group membership)
const { data: existing } = await supabase
  .from('companies')
  .select('id')
  .eq('id', params.id)
  .eq('group_id', activeGroupId ?? '')
  .single()
if (!existing) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

// 2. Write with admin client (bypasses RLS — safe because we verified above)
const admin = createAdminClient()
await admin.from('companies').update(updates).eq('id', params.id)
```

### Soft delete
Never hard-delete companies or divisions. Financial snapshots must remain intact.
```typescript
await admin.from('companies').update({ is_active: false }).eq('id', params.id)
```

### Slug generation
`generateSlug()` in `lib/utils.ts`. Slugs are unique per group (companies) or per company (divisions).
409 Conflict is returned if the slug is already taken — no auto-suffix.

---

## Group Brand Color

```css
:root { --group-primary: #0ea5e9; }  /* injected server-side by layout.tsx */
```
```ts
colors: { primary: "var(--group-primary)" }
```
Use `text-primary`, `bg-primary`, `border-primary` classes everywhere.

---

## Financial Data JSONB Structure

```typescript
interface FinancialData {
  period:       string       // "YYYY-MM"
  report_type:  ReportType   // "profit_loss" | "balance_sheet" | "cashflow"
  currency:     string       // "AUD"
  rows:         FinancialRow[]
  generated_at: string
}
interface FinancialRow {
  account_name:  string
  row_type:      'header' | 'row' | 'summaryRow' | 'section'
  amount_cents:  number | null
  children?:     FinancialRow[]
}
```
**Money rule**: all amounts stored as integer cents. Format with `formatCurrency()`.

---

## Xero Integration

### Token management
`getValidToken(connectionId)` in `lib/xero.ts`:
- Loads connection from DB via admin client
- Refreshes if token expires within 5 minutes
- Returns `{ access_token, xero_tenant_id }`

### Cron sync
`/api/cron/xero-sync` runs at 16:00 UTC (02:00 AEST) daily.
- Authenticated via `Authorization: Bearer {CRON_SECRET}`
- Syncs last 3 months × 3 report types × all connections

---

## Conventions

| Rule | Detail |
|------|--------|
| API routes for integrations + CRUD | Xero, Excel, companies, divisions |
| Server actions only for auth | signIn, signOut, switchGroup |
| Never anon client in API routes | Server client for reads; admin for writes |
| Soft delete only | `is_active = false` — never hard delete |
| Money as cents | `1234` = $12.34 |
| Dates as ISO 8601 | `"2025-01-15T10:30:00.000Z"` |
| Period as YYYY-MM | `"2025-01"` |
| ADD COLUMN IF NOT EXISTS | All future migrations |
| cn() for classes | From `@/lib/utils` |
| No auth-helpers-nextjs | Only `@supabase/ssr` |
| generateSlug() | From `@/lib/utils` — used in company + division creation |

---

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
XERO_CLIENT_ID=
XERO_CLIENT_SECRET=
XERO_REDIRECT_URI=https://app.navhub.co/api/xero/callback
NEXT_PUBLIC_APP_URL=https://app.navhub.co
NEXT_PUBLIC_APP_NAME=NavHub
CRON_SECRET=
# Phase 3 (AI Agents — not yet implemented):
# ANTHROPIC_API_KEY=
```

---

## Gotchas & Decisions

### 1. No handle_new_user trigger
Users are created directly in Supabase Auth. The `user_groups` membership is added manually by a super_admin.

### 2. Xero tenant selection
Callback always selects `tenants[0]`. Repeat the connect flow per entity for multiple orgs.

### 3. upsert conflict columns
`financial_snapshots` uses `UNIQUE NULLS NOT DISTINCT`. Upsert `onConflict` key must be dynamic.

### 4. Sidebar collapse hydration
AppShell reads `localStorage` for sidebar state. `mounted = false` → default (expanded) on first render.

### 5. Palette flash prevention (updated Phase 2c)
`app/(dashboard)/layout.tsx` injects full palette CSS block server-side via `buildPaletteCSS(getPalette(activeGroup.palette_id))`.
This sets `--palette-primary`, `--palette-secondary`, `--palette-accent`, `--palette-surface`, and `--group-primary` (alias) before any client JS runs.

### 6. xero-node used only for OAuth
All Xero API calls use raw `fetch()`. `lib/xero.ts` implements OAuth without the xero-node XeroClient.

### 7. Excel sheet name matching
Upload route maps sheet names to report types via `SHEET_MAP` constant — the only place for sheet name aliases.

### 8. Cookie mutation in Server Components
`lib/supabase/server.ts` wraps `cookieStore.set()` in try/catch. Intentional — prevents crashes in RSCs.

### 9. CRUD writes use admin client after RLS read
Pattern: verify group ownership with server client (RLS), then mutate with admin client (bypasses RLS).
This is safe because the ownership check already ran.

### 10. Division join for group ownership in API routes
Divisions don't have a `group_id` column — ownership is through `companies.group_id`.
Use `companies!inner(group_id)` in Supabase join and filter by `companies.group_id`.

---

## Phase 2b — Number Formatting Convention

`formatCurrency` signature changed in Phase 2b:
```typescript
// OLD (Phase 1): formatCurrency(cents, currency?)
// NEW (Phase 2b): formatCurrency(amount, format, currency?)
formatCurrency(amount: number | null, format: 'thousands'|'full'|'smart', currency?: string): string
```
User's `number_format` preference is loaded from `/api/settings` and passed as `format` everywhere.
All amounts remain stored as integer cents. Format only at render time.

### Dashboard summary rollup logic
- For each company: if any division has snapshot data → use division data; else use company data
- Prevents double-counting when both company and division snapshots exist for same period
- QTD / Last Qtr use calendar quarters; YTD uses Australian financial year (July 1 start)
- `null` means no data available for that field

### Settings page is now a client component
Settings page fetches `/api/groups/active` to get group info and user role client-side.
Admin-only palette section conditionally rendered based on `is_admin` flag.
Palette selection previews CSS vars immediately; persists via PATCH `/api/groups/[id]` with `{ palette_id }`.

---

## Phase 2c — Palette System

### Theme palette (lib/themes.ts)
Four named palettes: Ocean (#0ea5e9), Forest (#16a34a), Slate (#6366f1), Ember (#f97316).
Each palette: `{ id, name, primary, secondary, accent, surface }`.

```typescript
import { getPalette, buildPaletteCSS } from '@/lib/themes'
// layout.tsx server-side injection:
buildPaletteCSS(getPalette(activeGroup.palette_id))
// AppShell client-side update on group switch:
const palette = getPalette(activeGroup.palette_id)
document.documentElement.style.setProperty('--palette-primary', palette.primary)
// ...etc
```

### CSS variables
| Var | Usage |
|-----|-------|
| `--palette-primary` | Buttons, active states, links, Tailwind `primary` |
| `--palette-secondary` | Hover states on primary elements |
| `--palette-accent` | Icon highlights, subtle accents |
| `--palette-surface` | Sidebar background (always dark) |
| `--group-primary` | Alias for `--palette-primary` (Tailwind compat) |

### Migration 004
```sql
ALTER TABLE groups ADD COLUMN IF NOT EXISTS palette_id text NOT NULL DEFAULT 'ocean';
```

### API changes
- `PATCH /api/groups/[id]` now accepts `{ palette_id }` (validates against PALETTES ids)
- Also writes `primary_color` derived from palette for backwards compat
- Returns `palette_id` in all group selects

### Companies API — Xero status
`GET /api/companies` now returns `has_xero: boolean` and `last_synced_at: string | null` per company.
Fetches xero_connections for company IDs + division IDs, merges most-recent sync time per company.

### Xero sync/all
`POST /api/xero/sync/all` now fully implemented:
- Finds all active companies + divisions for the active group
- Fetches all xero_connections for those entities
- Syncs last 3 months × 3 report types (profit_loss, balance_sheet, cashflow) per connection
- Returns `{ synced: number, errors: string[] }`

### Excel Upload step UX
ExcelUpload component now shows explicit Step 1 / Step 2 progression.
Step 2 (dropzone) is dimmed and non-interactive until Step 1 (entity selection) is complete.

### AppShell sidebar polish
- Sidebar background: `var(--palette-surface)` (always dark)
- Nav text: white/60 inactive → white active (readable on dark bg)
- Active nav item: left 3px accent border in `var(--palette-primary)`
- Top bar: 2px bottom border in `var(--palette-primary)`
- Avatar: background in `var(--palette-primary)`

---

## Phase 2d — Financial Detail Views

### New report pages
- `/reports/profit-loss` — P&L report; period selector, summary/detail toggle, company columns, Group Total
- `/reports/balance-sheet` — Balance Sheet; same layout with special divider rows + Net Assets highlight

### Report table conventions
- Companies are columns; account names are rows (order from first company with data)
- **Section rows** (`row_type === 'section'`): grey bg, uppercase tiny text, no amount
- **Summary rows** (`row_type === 'summaryRow'`): bold, `bg-muted/20`
- **Divider rows** (Total Assets / Total Liabilities / Total Equity / Net Assets): `border-t-2` separator
- **Net Assets**: `bg-primary/10 font-bold text-primary` highlight
- **Group Total** column only shown when > 1 company
- Negative amounts shown in red (`text-red-600 dark:text-red-400`)
- Missing data: amber banner warning, badge on column header

### lib/financial.ts
```typescript
export function extractRows(data: FinancialData | null, mode: 'summary'|'detail'): DisplayRow[]
export function getRowValue(data: FinancialData | null, accountName: string): number | null
export function sumGroupTotal(datasets: (FinancialData | null)[], accountName: string): number | null
export function getPeriodLabel(period: string): string  // "2026-01" → "Jan 2026"
```
`extractRows` flattens the nested row tree. Summary mode: sections + summaryRows only. Detail: all.

### API routes (Phase 2d)
```
GET /api/reports/periods
  → { data: { periods: string[], report_types: Record<period, string[]> } }
  → ordered most-recent first; scoped to active group

GET /api/reports/data?type=profit_loss|balance_sheet|cashflow&period=YYYY-MM
  → { data: { company_id, company_name, data: FinancialData | null }[] }
  → rollup: division snapshots preferred over company-level (same as dashboard)
```

### ConnectXero component (`components/integrations/ConnectXero.tsx`)
- `<optgroup>` dropdown: Companies + Divisions sections
- On "Connect" click: shows confirm panel with entity name
- On "Open Xero": `window.open('/api/xero/connect?entity_type=...&entity_id=...', '_blank')`

### SyncButton component (`components/integrations/SyncButton.tsx`)
- Period selector (last 6 months)
- "Sync P&L" → POST `/api/xero/sync/profit-loss`
- "Sync Balance Sheet" → POST `/api/xero/sync/balance-sheet`
- Shows relative "Last synced" time

### Dashboard Refresh button
- "Refresh" button added next to period navigation arrows in dashboard header
- Calls `POST /api/xero/sync/all` with `{ period }` body for the current period
- After sync completes, re-fetches all dashboard data via `fetchAll(period)`
- sync/all now accepts optional `{ period? }` — if omitted, syncs last 3 months

### Reports nav (AppShell)
- Expandable "Reports" group in sidebar between Dashboard and Companies
- Sub-items: Profit & Loss → `/reports/profit-loss`, Balance Sheet → `/reports/balance-sheet`, Reports Library → `/reports/custom`
- Defaults open when `pathname.startsWith('/reports')`
- Indicator: `ChevronDown` rotates to `ChevronUp` when expanded

### void for fire-and-forget Supabase inserts
Supabase `PostgrestFilterBuilder` does not have `.catch()`. Use `void` prefix:
```typescript
// ✅ Correct
void admin.from('sync_logs').insert({ ... })
// ❌ Wrong — TS error: Property 'catch' does not exist
await admin.from('sync_logs').insert({ ... }).catch(() => {})
```

---

## Phase 2e — Revenue Forecast Model

### Database tables
- **`forecast_streams`** — per-group revenue stream config; soft-delete with `is_active`
- **`forecast_user_state`** — per-user per-group UI state (year, showGP, showAll, rates); PRIMARY KEY (user_id, group_id)

### Forecast math
```typescript
// Y1 = y1_baseline (baseline / starting position, in cents)
// Yn = baseline × (1 + gr/100)^(n-1)
function streamRevenue(baseline: number, gr: number, year: number): number
function streamGP(revenue: number, gp: number): number
```

### ForecastStream fields
- `y1_baseline` — bigint cents (same convention as financial_snapshots)
- `default_growth_rate` / `default_gp_margin` — integer percentages (e.g. 20 = 20%)
- `sort_order` — display order; swapped pairwise via PATCH for reorder
- `color` — hex string, used directly for dots/bars/chart segments

### API routes
```
GET  /api/forecast/streams           → all active streams, sorted by sort_order
POST /api/forecast/streams           → create stream (admin only)
PATCH  /api/forecast/streams/[id]    → update fields (admin only)
DELETE /api/forecast/streams/[id]    → soft delete (admin only)
GET  /api/forecast/state             → user's saved state or defaults
PATCH /api/forecast/state            → upsert state (user scoped)
```

### Revenue Model page (`/forecasting/revenue`)
- Left panel (w-72): year slider (Y1-Y7), growth rate sliders per stream (0-120%, step 5), GP margin sliders per stream (5-85%, step 1), display toggles, action buttons
- Right panel: total card, revenue mix proportional bar, bar chart (stacked/single mode), stream cards grid, summary table (Y1-Y7 columns)
- Auto-save state 2s debounce; manual "Save view" button
- Share link: `/forecasting/revenue?yr=N&{streamId}_gr=X&{streamId}_gp=Y` — restored on page load, URL params take priority over saved state
- Streams with `y1_baseline ≤ 0` return 0 revenue (no negative forecasts)
- Sliders styled with stream's `color` as `accentColor`

### Stream Setup page (`/forecasting/setup`)
- Admin only controls (edit/delete/add buttons hidden for non-admins)
- Inline add form (card) + inline edit form (replaces row)
- Up/Down arrow buttons for sort_order — PATCH both swapped items simultaneously
- Delete shows inline confirm panel before soft-deleting
- Y1 baseline input is in dollars, converted to/from cents on save/display
- Role check: fetches `/api/groups/active` to determine admin status

### AppShell Forecasting nav
- `ForecastGroup` component — same pattern as `ReportsGroup`
- Derives `isAdmin` from `groups.find(g => g.group_id === activeGroup.id)?.role`
- Stream Setup sub-item filtered out for non-admins in `FORECAST_CHILDREN_BASE`
- Defaults open when `pathname.startsWith('/forecasting')`
- `TrendingUp` icon; `ChevronDown` rotates when expanded

---

## Phase 2f — Group Management + Custom Reports Library

### Database (migration 006)
- **`group_invites`** — pending email invites; `UNIQUE(group_id, email)`; no email sending — record only
- **`custom_reports`** — HTML report files; soft-delete with `is_active`; `sort_order` for future reordering
- RLS: admins can manage both tables; members can read their own invites + active reports
- Storage bucket `report-files` must be created **manually** in Supabase dashboard (private, no public access)

### Group Management API
```
GET  /api/groups                          → all groups for user (role, member_count, company_count)
POST /api/groups                          → create new group (body: { name }) → auto-slug, add creator as super_admin
GET  /api/groups/[id]/members             → list members with emails (admin only; uses admin.auth.admin.getUserById)
PATCH  /api/groups/[id]/members/[userId]  → update role (admin only; blocks last super_admin change)
DELETE /api/groups/[id]/members/[userId]  → remove member (admin only; blocks last super_admin removal)
GET  /api/groups/[id]/invites             → list pending invites (accepted_at IS NULL)
POST /api/groups/[id]/invites             → create/upsert invite (body: { email, role })
DELETE /api/groups/[id]/invites/[id]      → cancel (hard delete) invite
```

Also extended: `PATCH /api/groups/[id]` now accepts `{ name }` in addition to `{ palette_id }`.

### Custom Reports API
```
GET  /api/reports/custom                  → list active reports (sort_order ASC)
POST /api/reports/custom                  → upload HTML file (multipart: file + name + description); max 5 MB
DELETE /api/reports/custom/[id]           → soft delete (is_active = false) + Storage hard delete
GET  /api/reports/custom/[id]/file        → 1-hour signed URL { url, name }
```

Storage path pattern: `{group_id}/reports/{timestamp}_{sanitisedFilename}`

### Settings Page (tabbed — Phase 2f)
Three tabs: **Display** | **Group** | **Members**
- **Display**: number format radios + currency select + account info card (unchanged behaviour)
- **Group**: editable group name (admin), palette selector (admin), create new group inline form (any user)
- **Members** (admin only, lazy-loaded on first open):
  - Member list with role `<select>` (PATCH on change) + inline "Remove" confirm
  - Pending invites list with inline "Revoke" confirm
  - Invite form: email + role select + Invite button

### Custom Reports UI
- **`/reports/custom`** — tile grid (3-col on desktop). Admin sees Upload panel (drag & drop + name/desc). Delete button per tile (admin only).
- **`/reports/custom/[id]`** — full-height iframe with `sandbox="allow-scripts allow-same-origin"`. Toolbar: Back · Download · Open in tab · Delete (admin).
- Signed URL fetched fresh on each page load (1-hour TTL from Supabase Storage).

### Members email lookup
`auth.users` is not queryable via anon/server client. Use `admin.auth.admin.getUserById(uid)` in parallel for each member. Acceptable for small groups (typical: < 50 members).

### Last super_admin protection
`PATCH` and `DELETE` on `/api/groups/[id]/members/[userId]` check if the target user is the only remaining `super_admin`. Returns 422 if so.

### Manual setup required (Supabase dashboard)
1. Create Storage bucket: **`report-files`** — private (not public)
2. Add Storage RLS policy (SELECT for group members):
   ```sql
   USING ((storage.foldername(name))[1] IN (
     SELECT group_id::text FROM user_groups WHERE user_id = auth.uid()
   ))
   ```
3. Add Storage RLS policy (SELECT + INSERT + DELETE for group admins):
   ```sql
   USING ((storage.foldername(name))[1] IN (
     SELECT group_id::text FROM user_groups
     WHERE user_id = auth.uid() AND role IN ('super_admin', 'group_admin')
   ))
   ```

---

## Phase Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Auth, AppShell, Xero OAuth, Excel upload, base schema |
| Phase 2a | ✅ Complete | Company + Division CRUD, Agents stub, migration 002 |
| Phase 2b | ✅ Complete | Dashboard 4-card layout, user settings, group colour, period navigation |
| Phase 2c | ✅ Complete | Palette system, sidebar polish, real Xero status, Excel UX, sync/all |
| Phase 2d | ✅ Complete | Financial report pages (P&L, Balance Sheet), Reports nav, ConnectXero UX, period-aware sync |
| Phase 2e | ✅ Complete | Revenue Forecast Model — streams, 7-year projection, sliders, share link, auto-save |
| Phase 2f | ✅ Complete | Group management (members/invites), Settings tabs, Custom Reports library + viewer |
| Phase 3a | ✅ Complete | AI Agent Foundation — CRUD, credentials, streaming execution engine, run history |
| Phase 3b | ✅ Complete | Settings overhaul (5-tab), Excel upload pipeline, FY-aware periods, Xero connection matching, CreateGroup modal |
| Phase 3c | Planned | Agent scheduling, email inbound triggers, Slack slash commands |

---

## Phase 3a — AI Agent Foundation

### Database (migration 007)
- **`agents`** — per-group agent config (model, persona, tools, scope, email/Slack settings)
- **`agent_credentials`** — AES-256-GCM encrypted credentials per agent; value never returned to client
- **`agent_runs`** — run history with streamed output, tool call log, token usage
- **`agent_schedules`** — stub table for future cron-based scheduling
- `groups` table extended with `slack_webhook_url`, `slack_default_channel`, email domain fields
- `custom_reports` extended with `is_draft`, `draft_notes`, `agent_run_id`

### Encryption (`lib/encryption.ts`)
- AES-256-GCM, 96-bit IV, server-side only
- Key: `NAVHUB_ENCRYPTION_KEY` env var (64-char hex = 32 bytes)
- Format: `base64(iv):base64(authTag):base64(ciphertext)`

### Agent tools (`lib/agent-tools.ts`)
Five callable tools:
- `read_financials` — queries financial_snapshots, returns summary string
- `read_companies` — lists companies + Xero status
- `generate_report` — converts markdown → styled HTML → saves to Storage as draft
- `send_slack` — posts to group's Slack webhook
- `send_email` — sends via Resend API from agent's email address

### Agent runner (`lib/agent-runner.ts`)
- Builds system prompt with context (date, period, company scope, available periods)
- Supports Claude (Anthropic API, streaming SSE) and GPT-4o (OpenAI API)
- Agentic loop: calls model → executes tool calls → continues until no more tools
- Emits `RunEvent` stream: `text` | `tool_start` | `tool_end` | `error` | `done`
- Saves completed output + tool_calls to `agent_runs` on completion

### API routes
```
GET  /api/agents                                  → list agents (active group)
POST /api/agents                                  → create agent (admin)
GET  /api/agents/[id]                             → single agent
PATCH  /api/agents/[id]                           → update agent (admin)
DELETE /api/agents/[id]                           → soft delete (admin)
GET  /api/agents/[id]/credentials                 → list credentials (no values)
POST /api/agents/[id]/credentials                 → add credential (encrypted)
PATCH  /api/agents/[id]/credentials/[credId]      → update/re-encrypt credential
DELETE /api/agents/[id]/credentials/[credId]      → hard delete credential
POST /api/agents/[id]/run                         → create run record → returns run_id
GET  /api/agents/[id]/runs                        → run history (paginated)
GET  /api/agents/runs/[runId]/info                → run + agent metadata
GET  /api/agents/runs/[runId]/stream              → SSE stream (executes or replays run)
```

### Agent UI pages
- `/agents` — grid of agent cards with Run / Edit / History buttons
- `/agents/new` — create agent (Identity → Behaviour → Tools tabs)
- `/agents/[id]/edit` — edit agent (4 tabs including Credentials tab)
- `/agents/[id]/runs` — paginated run history table
- `/agents/runs/[runId]` — real-time stream view with tool call blocks + output

### Required environment variables
- `NAVHUB_ENCRYPTION_KEY` — 32-byte hex (MUST be in Vercel env vars)
- `ANTHROPIC_API_KEY` — from console.anthropic.com (MUST be in Vercel env vars)
- `RESEND_API_KEY` — from resend.com (required for send_email tool)
- `RESEND_FROM_DOMAIN` — e.g. `navhub.co`

### AppShell note
Agents nav item already existed as Bot icon → `/agents`. No change needed to sidebar.

---

## Next Steps

1. Set up Supabase Storage bucket `report-files` with RLS policies (manual — see Phase 2f section)
2. Set up Supabase Storage bucket `excel-uploads` with appropriate policies
3. Add `NAVHUB_ENCRYPTION_KEY` and `ANTHROPIC_API_KEY` to Vercel environment variables
4. Run migration `007_agents.sql` in Supabase dashboard
5. **Run migration `008_settings.sql`** in Supabase dashboard (Phase 3b — fy_end_month + excel_uploads fields)
6. Add `error.tsx` files for each route segment
7. Add cashflow report page at `/reports/cashflow`
8. Add chart visualisations to financial report pages (trend lines, bar charts)

---

## Phase 3b — Settings Overhaul + Excel Upload Pipeline

### Database (migration 008)
- `user_settings.fy_end_month` — integer 1–12, default 6 (June); drives FY quarter/year calculations
- `excel_uploads.report_type` — 'pl' | 'bs' | 'tb'
- `excel_uploads.period_value` — YYYY-MM string
- `excel_uploads.column_mapping` — JSONB, reserved for future custom column mapping
- `excel_uploads.status` — 'processed' | 'error'
- `excel_uploads.error_message` — error detail on failure

### Settings Page (5-tab rebuild)
`app/(dashboard)/settings/page.tsx` — replaced 3-tab layout with 5-tab layout:
- **Display** (`components/settings/DisplayTab.tsx`) — Group name, palette (admin), number format, currency, FY end month; Save Preferences button styled with `--palette-primary`
- **Companies** (`components/settings/CompaniesTab.tsx`) — company list with add/edit/view links; replaces `/companies` route
- **Integrations** (`components/settings/IntegrationsTab.tsx`) — Xero connections with link/unlink dropdown, ConnectXero; replaces `/integrations` route
- **Uploads** (`components/settings/UploadsTab.tsx`) — 5-step upload pipeline: entity → report type → period → download template → upload; previous uploads table
- **Members** (`components/settings/MembersTab.tsx`) — invite form, member list with role selector + remove, pending invites + revoke; user email shown here

### Route Changes
- `/companies` → `redirect('/settings?tab=companies')` — sidebar no longer links to /companies separately
- `/integrations` → `redirect('/settings?tab=integrations')` — sidebar no longer links to /integrations
- Companies and Integrations removed from `BOTTOM_NAV` in AppShell (Settings tab handles both)

### FY-Aware Period System
- `lib/periods.ts` — FY-aware helpers: `getFYYear()`, `getFYQuarter()`, `getFYQuarterMonths()`, `getFYAllMonths()`, `getQTDMonthsFY()`, `getYTDMonthsFY()`, `buildPeriodOptions()`
- `lib/hooks/useUserSettings.ts` — React hook that fetches `/api/settings`, returns `{ currency, numberFormat, fyEndMonth }`
- `components/ui/PeriodSelector.tsx` — mode toggle (Month | Quarter | FY Year), dropdown of period options; accepts `fyEndMonth` prop

### Excel Upload Pipeline
- `GET /api/uploads/template?type=pl|bs|tb` — generates + downloads .xlsx template using xlsx package
  - P&L template: pre-populated Category/Subcategory/Line Item/Amount with standard AU P&L sections
  - Balance Sheet template: pre-populated with asset/liability/equity sections
  - Trial Balance template: blank Account Code/Account Name/Debit/Credit
- `POST /api/uploads/process` — multipart: file + entity_type + entity_id + report_type + period_value; parses xlsx, upserts to `financial_snapshots` in same JSONB format as Xero, records in `excel_uploads`
- `GET /api/uploads` — list uploads for active group (with company/division join)
- `DELETE /api/uploads/[uploadId]` — hard delete upload record

### Xero Connection Matching (Fix 3)
- `GET /api/xero/connections` — list all Xero connections for active group with company/division joins
- `PATCH /api/xero/connections/[connectionId]` — link/unlink to entity (`{ entity_type, entity_id }`)
- `DELETE /api/xero/connections/[connectionId]` — disconnect (hard delete)
- IntegrationsTab shows "Linked to" dropdown per connection; updates on change

### CreateGroupModal (Fix 4)
- `components/groups/CreateGroupModal.tsx` — modal with group name input + palette selector + Create button
- Added to AppShell user dropdown — visible only to `super_admin` users
- On create: inserts group, redirects to `/dashboard` after success
- Removed "Create Group" card from Settings page entirely

### AppShell Changes
- `isSuperAdmin` flag derived from active role
- User dropdown: "Create Group" item (super_admin only) above Sign Out
- `CreateGroupModal` rendered conditionally in AppShell
- `BOTTOM_NAV` simplified to `[Agents, Settings]` — Companies & Integrations now accessible via Settings tabs
- AvatarFallback text colour uses explicit `color: '#ffffff'` to avoid white-on-white in light mode

### Text Contrast (Fix 5)
- All tab components use `text-foreground` for body text on light backgrounds
- `text-muted-foreground` for secondary/helper text
- Palette/section heading use `text-foreground` not `text-white`
- `select` elements use `text-foreground` + `bg-background` for light mode compatibility
- AppShell sidebar uses `var(--palette-surface)` (always dark) so `text-white` remains correct there
