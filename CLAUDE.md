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
      templates/
        page.tsx            # Template Library — card grid, type filter, Generate/View buttons (Phase 5a)
        new/page.tsx        # 3-path creation: Upload Document | Describe to Agent | Build Manually (Phase 5c)
        new/review/page.tsx # Side-by-side diff review of agent proposal (Phase 5c)
        new/manual/page.tsx # Full manual editor — Details/Slots/Tokens/Scaffold tabs (Phase 5c)
        [id]/page.tsx       # Template Detail — 4 tabs: Overview, Slots, Design Tokens, Version History + Restore (Phase 5a/5c)
        [id]/edit/page.tsx  # Edit template — same 4-tab layout, PATCH on save (Phase 5c)
        [id]/generate/page.tsx # Generate Wizard — 3-step: Fill Slots → Preview → Save (Phase 5a)
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
    report-templates/
      route.ts              # GET (list, no scaffold) | POST (create, admin) (Phase 5a)
      [id]/route.ts         # GET (full) | PATCH (saves version, increments) | DELETE (soft) (Phase 5a)
      [id]/render/route.ts  # POST { slot_data } → { html, missing_slots, valid } — preview, no save (Phase 5a)
      [id]/generate/route.ts # POST { slot_data, report_name, notes } → renders + saves to custom_reports (Phase 5a)
      [id]/versions/route.ts # GET — list version metadata (no scaffold content) (Phase 5a)
      [id]/versions/[versionId]/route.ts # GET — full version including scaffold (Phase 5a)
      seed/route.ts         # POST — seed Role & Task Matrix V5 template for active group (admin) (Phase 5a)
      analyse/route.ts      # POST multipart (file + instructions) → proposed template JSON, no save (Phase 5c)
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
  cashflow/
    ItemModal.tsx           # CLIENT: create/edit cash flow item modal (Phase 4a)

lib/
  supabase/
    client.ts               # Browser client (createBrowserClient)
    server.ts               # Server client (createServerClient + cookie try-catch)
    admin.ts                # Admin client (service role, bypasses RLS, server only)
  xero.ts                   # Xero OAuth helpers + token management + data normalisation
  themes.ts                 # Palette definitions + getPalette() + buildPaletteCSS() (Phase 2c)
  financial.ts              # extractRows(), getRowValue(), sumGroupTotal(), getPeriodLabel() (Phase 2d)
  types.ts                  # TypeScript types for all DB entities + financial data + agent types + template types
  utils.ts                  # cn(), formatCurrency(amount,format,currency), formatVariance(), period helpers, generateSlug()
  encryption.ts             # AES-256-GCM encrypt/decrypt — server only (Phase 3a)
  agent-tools.ts            # Tool implementations: read_financials, send_email etc (Phase 3a)
  agent-runner.ts           # Execution engine: streaming Claude/GPT-4o, tool loop, run persistence (Phase 3a)
  cashflow.ts               # Projection engine: getWeekStart, get13Weeks, projectItem, buildForecastGrid (Phase 4a)
  template-renderer.ts      # renderSlots, renderTokens, renderTemplate, validateSlots (Phase 5a)

supabase/
  migrations/
    001_initial_schema.sql  # All tables, enums, RLS, helper functions
    002_companies_divisions.sql  # ADD description, industry, is_active to companies + divisions
    003_user_settings.sql   # user_settings table with currency + number_format prefs (Phase 2b)
    004_group_palette.sql   # ADD palette_id to groups (Phase 2c)
    005_forecast.sql        # forecast_streams + forecast_user_state tables + RLS (Phase 2e)
    006_group_management.sql # group_invites + custom_reports tables + RLS (Phase 2f)
    007_agents.sql          # agents + agent_credentials + agent_runs + agent_schedules (Phase 3a)
    008_settings.sql        # user_settings.fy_end_month + excel_uploads table (Phase 3b)
    009_cashflow.sql        # cashflow_settings/items/xero_items/forecasts/snapshots tables (Phase 4a)
    010_report_templates.sql # report_templates + report_template_versions + ALTER custom_reports (Phase 5a)

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
`tailwind.config.ts` maps `primary` to the palette CSS variable with fallback chain:
```ts
primary: {
  DEFAULT:    "var(--palette-primary, var(--group-primary, #0ea5e9))",
  foreground: "#ffffff",
}
```
Use `text-primary`, `bg-primary`, `border-primary` classes everywhere.

### tailwind.config.ts — full shadcn color palette
`tailwind.config.ts` now includes the complete shadcn/ui color mapping:
- `darkMode: ["class"]` — enables class-based dark mode (next-themes applies `.dark`)
- All shadcn colors (`card`, `popover`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`) mapped to their HSL CSS variables from `globals.css`
- `borderRadius` tokens (`lg`, `md`, `sm`) mapped to `var(--radius)`
- Without this full mapping, shadcn utility classes (`bg-secondary`, `text-muted-foreground`, etc.) generate no CSS

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

### 5. Palette flash prevention (updated Phase 2c + Palette Persistence Fix)
`app/(dashboard)/layout.tsx` injects full palette CSS block server-side via `buildPaletteCSS(getPalette(activeGroup.palette_id))`.
This sets `--palette-primary`, `--palette-secondary`, `--palette-accent`, `--palette-surface`, and `--group-primary` (alias) before any client JS runs.

**Palette persistence fix**: `unstable_noStore()` (from `next/cache`) is called at the top of `DashboardLayout()` to opt out of Next.js's Data Cache. Without this, the Supabase `fetch` calls can be served stale (cached) values — meaning a palette change saved to the DB would not be reflected on hard refresh until the cache expired.

**Group switch fix**: `switchGroup()` server action now returns `{ primaryColor, palette_id }`. `GroupSwitcher.tsx` uses `getPalette(result.palette_id)` to apply all 5 CSS vars immediately via `style.setProperty()` when switching groups (previously only `--group-primary` was updated, causing a brief flash on other palette-coloured elements).

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
| Phase 4a | ✅ Complete | 13-Week Rolling Cash Flow Forecast (manual mode) — items, projection engine, grid UI, snapshots |
| Phase 4b | Planned | Cash Flow — Xero AR/AP pull, group summary page |
| Phase 5a | ✅ Complete | Report Template Infrastructure — templates DB, renderer, 7 API routes, 3 UI pages, seed (Matrix V5) |
| Phase 5b | ✅ Complete | Agent Template Tools — 6 new tools: list/read/create/update template, render_report, analyse_document |
| Phase 5c | ✅ Complete | Template Editor UI — 3-path creation wizard, review diff page, manual editor, edit page, Restore button |
| Phase 5d | ✅ Complete | V5 Matrix E2E Test — seed script, V5 agent prompt, Run V5 Test modal, Report Generated card, template health page |
| Phase 7a | ✅ Complete | Document Intelligence UI — Documents section, folders, editor/viewer with locking, share tokens, standalone viewer |
| Phase 7b | ✅ Complete | Agent Document Tools — 4 new tools (list/read/create/update_document), Document Created card in run stream |
| Agent UX Fixes | ✅ Complete | Period toggle (per-agent localStorage), streaming timeline with one-line summaries, completion summary card |
| Agent Rate Limit Optimisation | ✅ Complete | readReportTemplate scaffold_size, system prompt token reduction, token estimate in RunModal |
| SuperAdmin Section | ✅ Complete | /admin area with platform dashboard, groups, users, agent runs, system; group impersonation |
| Agent Kill Switch + Disable | ✅ Complete | Cancel running run (SSE checkpoint), disable/enable agent toggle, migration 015 |
| Agent Run Detail Restructure | ✅ Complete | CollapsibleSection component, Brief/Activity/Output sections on run pages, brief preview in run history |
| NavHub Assistant | ✅ Complete | Floating chat panel (claude-haiku), streaming, Agent Brief Cards, ?brief= pre-fill on agents page |
| Tailwind + AssistantButton Fix | ✅ Complete | Full shadcn color palette wired in tailwind.config.ts; agent.tools null safety on run page |
| Assistant Data + UX Enhancements | ✅ Complete | Server-side context (runs/companies/docs/reports/folders), localStorage history, draggable + resizable panel, pointer-pass-through backdrop |

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

## Phase 5d — V5 Matrix End-to-End Test Case

### Files added
- **`scripts/seed-v5-template.ts`** — `checkAndPatchV5Template(admin, groupId, ...)` checks the V5 template exists, verifies required slots/tokens, and optionally patches missing scaffold. Exports `REQUIRED_SLOT_NAMES`, `REQUIRED_TOKEN_KEYS`, `V5SeedResult`.
- **`app/api/dev/seed-v5-template/route.ts`** — dev-only POST route (returns 404 in production). Auth + admin check, then calls `checkAndPatchV5Template` (check-only, no scaffold patch from this route). Returns JSON health report + instructions.
- **`lib/agent-prompts/v5-test-run.ts`** — exports `V5_TEST_PROMPT`: complete 5-step prompt for generating an AxisTech Group V5 matrix. Includes fully-inline slot data: 8 entities, 4 column groups, 4 sections with rows, ~25 role entries, headcount summary.
- **`app/(dashboard)/reports/templates/health/page.tsx`** — admin-only health dashboard. Shows all active templates with: type badge, version, slot count, token count, HTML/CSS/JS scaffold presence (✓/✗), reports generated count, last updated date, health score (OK / No slots / Missing scaffold).

### Files modified
- **`app/(dashboard)/reports/templates/[id]/page.tsx`** — adds "Run V5 Test" button (super_admin only, visible when template name === "Role & Task Matrix"). Opens `V5TestModal`: read-only prompt textarea, agent selector, period picker, "Launch Agent Run" → navigates to run stream page.
- **`app/(dashboard)/agents/runs/[runId]/page.tsx`** — after tool call log, renders green "Report Generated" card(s) for any completed `render_report` tool event where output parses to `{ success: true, data: { report_id, report_name } }`. Shows "View Report" (→ `/view/report/[id]`) and "Library" buttons.
- **`components/agents/RunModal.tsx`** — adds blue informational note when `agent.tools.includes('render_report')`: "This agent can generate reports. Any report created will be saved to your Reports Library."

### Run V5 Test flow
1. Navigate to `/reports/templates/[id]` for "Role & Task Matrix" template
2. Click "Run V5 Test" (super_admin only — dashed border button)
3. Select an agent with `render_report` tool + choose period
4. "Launch Agent Run" → creates run via `POST /api/agents/[id]/run` with `extra_instructions: V5_TEST_PROMPT`
5. Redirects to run stream page; after `render_report` completes, a green card appears with direct report link

### Template health page
Navigate to `/reports/templates/health` (admin only — access check on load).
Fetches template list + full detail (for scaffold presence) + custom reports (for count per template).
Health scores: **OK** = scaffold HTML+CSS present + slots > 0; **No slots** = missing slots; **Missing scaffold** = no HTML or CSS.

---

## Phase 7a — Document Intelligence UI

### Database (migration 014)
- **`document_folders`** — per-group folders: `name`, `description`, `sort_order`, `is_active`; soft-delete
- **`documents`** — per-group documents: `folder_id` (nullable FK), `company_id` (nullable FK), `document_type`, `audience`, `status` ('draft'|'published'|'archived'), `content_markdown`, `word_count`, `locked_by` (uuid FK → auth.users), `locked_at` (timestamptz), `share_token` (text), `is_shareable` (boolean), `agent_run_id` (uuid FK); soft-delete with `is_active`
- **`document_versions`** — auto-saved on content edit: `document_id`, `version` (int), `content_markdown`, `word_count`, `saved_by`
- **`document_sync_connections`** — stub for Phase 7c (Xero/external sync)
- **`document_sync_log`** — stub for Phase 7c
- RLS on all tables using `get_user_group_ids()` via group_id; admins (super_admin/group_admin) have full access; members can SELECT active records

### lib/types.ts additions
```typescript
export type DocumentType = 'employment_contract' | 'service_agreement' | 'nda' | 'board_resolution' |
  'board_minutes' | 'policy' | 'procedure' | 'report' | 'memo' | 'letter' | 'other'
export type DocumentAudience = 'internal' | 'board' | 'executive' | 'staff' | 'external' | 'confidential'
export interface DocumentFolder { id, group_id, name, description, sort_order, is_active, created_at }
export interface Document {
  id, group_id, folder_id, company_id, title, document_type: DocumentType, audience: DocumentAudience,
  status, content_markdown, word_count, locked_by, locked_at, is_shareable, share_token,
  share_token_created_at, agent_run_id, is_active, created_by, created_at, updated_at
}
export interface DocumentVersion { id, document_id, version, content_markdown, word_count, saved_by, created_at }
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string>
export const DOCUMENT_AUDIENCE_LABELS: Record<DocumentAudience, string>
```
Also extended `AgentTool` union: `'list_documents' | 'read_document' | 'create_document' | 'update_document'`

### API routes
```
GET  /api/documents                    → list docs (optional: folder_id, company_id, document_type, status); enriches locked_by_email
POST /api/documents                    → create document → 201

GET  /api/documents/[id]              → fetch single (group ownership via RLS)
PATCH  /api/documents/[id]            → update fields; auto-versions if content_markdown changes
DELETE /api/documents/[id]            → admin only → soft delete (is_active = false)

POST /api/documents/[id]/lock         → acquire lock; 409 if locked by another user within 30 min
DELETE /api/documents/[id]/lock       → release lock (only lock holder)

GET  /api/documents/[id]/share        → { is_shareable, share_url, created_at }
POST /api/documents/[id]/share        → generate randomBytes(32) token; idempotent (regenerates)
DELETE /api/documents/[id]/share      → revoke (is_shareable=false, share_token=null)

GET  /api/documents/folders           → list folders for active group
POST /api/documents/folders           → create folder (admin only)
DELETE /api/documents/folders         → delete folder (admin; 409 if has documents)

GET  /api/documents/[id]/versions     → list versions (ordered by version desc)
```

### UI pages

#### `app/(dashboard)/documents/page.tsx` — Documents Library
- Left sidebar: folder navigation with doc counts, "All Documents" + "Unfiled" entries, named folders, "New Folder" inline form (admin only)
- Document grid: `DocumentCard` component per doc — type badge, audience badge, company name, date, Sparkles icon for agent-created, Lock icon if locked, "Shared" emerald badge if `is_shareable`
- Three-dot menu per card: Open, Move to Folder (dropdown), Share, Delete (admin)
- Toolbar: search input, type dropdown filter, company dropdown filter, "New Document" button
- Loads in parallel: documents + folders + companies + role check

#### `components/documents/NewDocumentModal.tsx`
- Three steps: `'pick'`, `'manual'`, `'agent'`
- **Write Manually**: title, type, audience, company (required for financial types), folder → POST `/api/documents` → navigates to `/documents/[id]?edit=1`
- **Create with Agent**: same fields + agent selector + data context checkboxes (P&L, Balance Sheet, Cash Flow, Company info) + additional instructions → assembles `audienceGuidance` string + structured prompt with `create_document` tool instruction → POST `/api/documents` (status='draft') → POST `/api/agents/[agentId]/run` with `extra_instructions` → navigates to run stream page
- `isFinancialType()` helper: financial document types require a company to be selected

#### `app/(dashboard)/documents/[id]/page.tsx` — Document Viewer/Editor
- **View mode**: renders `content_markdown` with `ReactMarkdown` + `remarkGfm`; toolbar: Edit, History, Share buttons
- **Edit mode**: acquires lock via `POST /api/documents/${docId}/lock`; split pane (textarea left, live preview right using `ReactMarkdown`); word count display; Save (PATCH + lock release) and Discard (lock release only) buttons
- Lock keepalive: `setInterval` POST every 10 minutes while editing
- `beforeunload` → `navigator.sendBeacon('/api/documents/${id}/lock', ...)` for lock release on tab close/navigate
- Lock banner: amber warning when document locked by another user (shows "locked by {email}")
- Version history panel: collapsible right side panel; lists all versions; "Restore" button per version (PATCHes content, dismisses panel)
- `SharePopover` inline component: same pattern as reports — lazy fetch GET on open, generate/copy/revoke actions
- Auto-enters edit mode when `searchParams.get('edit') === '1'`

#### `app/view/document/[id]/page.tsx` — Standalone Share Viewer
- Server component outside `(dashboard)` layout — no AppShell/sidebar
- 44px branded header: NavHub wordmark · group name · document title · "Back to Documents" (authenticated only)
- **Path 1 — Session user**: verifies group membership via `supabase` (RLS) → fetches document
- **Path 2 — Token user**: admin client query with `is_shareable=true`; compares `share_token` — if mismatch, renders `<NotAvailable />`
- Renders markdown as styled HTML with inline `<style>` tag (prose classes for typography)
- "Back to Documents" link shown only when `isAuthenticated`

### Middleware update
Added `pathname.startsWith('/view/document/')` to `isPublic` conditions so share links bypass session check.

### AppShell update
- `FileText` icon from lucide-react
- `documentsActive = pathname.startsWith('/documents')` state
- Documents flat nav item (not a group — single route) inserted between ReportsGroup and CashflowGroup

### Dependencies added
- `react-markdown` — markdown-to-JSX rendering in editor preview and document viewer
- `remark-gfm` — GFM extensions (tables, strikethrough, task lists) for ReactMarkdown

### Document locking pattern
- Lock acquired via `POST /lock` — stores `locked_by` (user_id) + `locked_at` (timestamp)
- Lock conflict: if another user has `locked_at` within 30 minutes, returns 409 with `{ locked_by, locked_at }`
- Lock release: `DELETE /lock` — only lock holder can release (otherwise 403)
- Keepalive: editor calls POST every 10 min to refresh `locked_at`; locks expire after 30 min of inactivity
- `navigator.sendBeacon` used for tab close (avoids blocking navigation)

### Document versioning pattern
On every PATCH to `content_markdown`:
1. Count existing versions → new version number = count + 1
2. Insert current content into `document_versions` before applying update
3. Apply update to `documents` (updated_at auto-refreshed by Supabase)

### Share token pattern
- `randomBytes(32).toString('hex')` — 64-char hex, not guessable
- Generic 403 on public endpoint (no enumeration of doc IDs)
- `Cache-Control: private, no-store` on signed URLs
- Share URL: `{NEXT_PUBLIC_APP_URL}/view/document/{id}?token={token}`
- Revoking sets `is_shareable=false` + `share_token=null` immediately

---

## Phase 7b — Agent Document Tools

### New tools in lib/agent-tools.ts
Four new tools. All use admin Supabase client after group/ownership verification. Return `JSON.stringify({ success, data })` or error string.

| Tool | Description |
|------|-------------|
| `list_documents` | Lists active docs for group; optional `document_type`/`folder_id`/`company_id` filters; returns id, title, document_type, audience, status, word_count, updated_at |
| `read_document` | Fetches full document including `content_markdown`; verifies group_id ownership |
| `create_document` | Inserts new document with `agent_run_id: context.runId`, `status: 'published'`; returns `{ document_id, title, document_type, audience, view_url }` |
| `update_document` | Auto-versions current content (count → insert version), then applies updates to document |

### lib/agent-runner.ts changes
- Import 4 new tool functions
- 4 new entries in `ALL_TOOL_DEFS` with full JSON schema (input_schema with properties/required)
- 4 new `case` branches in `executeTool()` dispatcher

### lib/types.ts — AgentTool additions
```typescript
| 'list_documents' | 'read_document' | 'create_document' | 'update_document'
```

### Run stream page — Document Created card
`app/(dashboard)/agents/runs/[runId]/page.tsx`:
- Extended `toolEmoji`: `list_documents: '📂'`, `read_document: '📖'`, `create_document: '📝'`, `update_document: '✍️'`
- Blue "Document Created" card rendered from `create_document` tool output (`tool_end` event, `success: true`)
- Card shows: title (truncated), document_type + audience text, "Open" (→ `/documents/[id]`), "Documents" (→ `/documents`) buttons
- Positioned before "Report Generated" cards

### Agent pages
- `app/(dashboard)/agents/page.tsx`: `TOOL_LABELS` extended with 4 entries
- `app/(dashboard)/agents/_form.tsx`: `TOOL_OPTIONS` extended with labels, emoji, and descriptions for all 4 tools

---

## Agent UX Fixes — Period Toggle + Streaming Timeline

### Fix 1 — Period Selector Toggle (`components/agents/RunModal.tsx`)

**Behaviour**
- Toggle: "Include period context" (default: **off**)
- When **off**: period selector is hidden; no `period` field in the POST body → agent receives no period in its system prompt
- When **on**: period dropdown appears; `period` is sent as before
- Toggle state is persisted in `localStorage` keyed by agent ID (`navhub:agent-period:{agentId}`) so each agent remembers its last setting

**Implementation**
```typescript
// State
const [includePeriod, setIncludePeriod] = useState(false)

// Restore from localStorage on mount
useEffect(() => {
  const saved = localStorage.getItem(`navhub:agent-period:${agent.id}`)
  if (saved === 'true') setIncludePeriod(true)
}, [agent.id])

// Persist on toggle
function handlePeriodToggle() {
  const next = !includePeriod
  setIncludePeriod(next)
  localStorage.setItem(`navhub:agent-period:${agent.id}`, next ? 'true' : 'false')
}

// POST body — period only sent when toggle is on
body: JSON.stringify({
  ...(includePeriod ? { period } : {}),
  ...
})
```

Toggle rendered as an inline switch (`role="switch"`) using Tailwind — no extra dependencies.

---

### Fix 2 — Streaming Timeline + Summary Card (`app/(dashboard)/agents/runs/[runId]/page.tsx`)

**During run — streaming timeline**

Replaced the previous "Tool calls" accordion + "Output area" with a unified streaming view:

```
● Thinking…                              ← animated pulse (before first tool call)
✓ 📋 List Templates                      ← completed tool (green check)
   → Found 3 templates                   ← one-line result summary (muted)
   Details ›                             ← disclosure, hidden by default
✓ 🔍 Read Template                       ← completed
   → Role & Task Matrix — 8 slots
● 🖨️ Render Report                       ← in-progress (animated blue dot)
   running…
```

Text output from the agent streams in below the tool events as a live area (with blinking cursor). When run completes, the live text area is removed and reappears in the summary card's "Full output" collapsible.

**`TimelineEntry` component**
- `inProgress=true`: animated blue dot + "running…" label
- `inProgress=false`: green `CheckCircle2` icon
- `resultSummary`: one-line human-readable string extracted by `summariseTool()`
- "Details" disclosure: opens input/output raw JSON, **hidden by default**

**`summariseTool(tool, output)` helper**
Parses JSON output and returns a compact summary per tool:

| Tool | Summary format |
|------|----------------|
| `list_report_templates` | "Found N templates" |
| `read_report_template` | "{name} — N slots" |
| `render_report` | "Rendered: {report_name}" |
| `create_document` | "Created: {title}" |
| `list_documents` | "Found N documents" |
| `read_companies` | "Found N companies" |
| `send_email` | "Email sent" |
| other | "Done" / truncated raw output |

**After completion — summary card**

```
┌────────────────────────────────────────────┐
│ ✓ Run complete · 4 tool calls · 12s · Claude Sonnet 4 · 1,234 tokens │
│                                            │
│ [Document Created card (blue)]             │
│ [Report Generated card (green)]            │
│                                            │
│ Full output  ›  (collapsible)  [Copy]      │
└────────────────────────────────────────────┘
```

For failed runs: `XCircle` icon + red error detail block inside the summary card (no separate error banner).

**Duration tracking**: `start = Date.now()` captured when stream begins; `durationSecs = Math.round((Date.now() - start) / 1000)` set on `done` / `error` event.

**Files modified**
- `components/agents/RunModal.tsx` — period toggle
- `app/(dashboard)/agents/runs/[runId]/page.tsx` — streaming timeline + summary card

---

## Agent Rate Limit Optimisation

Four targeted changes to reduce token usage in agent runs.

### Fix 1 — `read_report_template` scaffold exclusion (`lib/agent-tools.ts`)

`readReportTemplate` now always fetches scaffold fields from DB to compute a `scaffold_size` byte count, but strips `scaffold_html`, `scaffold_css`, `scaffold_js` from the response unless `include_scaffold: true` is explicitly passed.

**Response when `include_scaffold` is false (default):**
```json
{ "success": true, "data": { "id": "...", "name": "...", "slots": [...], "scaffold_size": 42800, ... } }
```
- `scaffold_size` = total character count of all scaffold fields combined
- Agent can decide whether loading scaffold is worth the token cost before calling again with `include_scaffold: true`

**Tool description updated** in `lib/agent-runner.ts`:
```
Scaffold HTML/CSS/JS is NOT returned by default to save tokens — the response includes
scaffold_size (total chars) so you can judge whether loading it is needed. Pass
include_scaffold:true only when you need to read or modify the actual scaffold code.
```

### Fix 2 — `render_report` scaffold source (confirmed ✓)

`renderReport` already fetches the full template (including scaffold) server-side from Supabase with `select('*')`. No change needed — the agent never needs to pass scaffold content to this tool.

### Fix 3 — System prompt token reduction (`lib/agent-runner.ts` + `lib/agent-tools.ts`)

**Period list** — `buildSystemPrompt()` now limits available periods to 6 (down from 12):
```typescript
.limit(6)  // was .limit(12)
```

**`read_companies` tool** — now returns `id + name` only (stripped: `description`, `industry`, `is_active`, Xero connection status). Output format changed from verbose text to minimal list:
```
• Acme Corp (id: abc-123)
  └ Sydney Office (id: def-456)
```

**`list_report_templates` tool** — now returns `id + name + template_type` only (stripped: `description`, `version`, `updated_at`). Agent calls `read_report_template` for full detail.

### Fix 4 — Token estimate indicator (`components/agents/RunModal.tsx`)

A row showing the estimated system context size is displayed above the Extra instructions field. Computed with `useMemo`:

```typescript
const estimatedTokens = useMemo(() => {
  let tokens = 2000 // base: persona + instructions + group context
  if (includePeriod) tokens += 800  // period context + periods list
  tokens += 1500                    // available financial data context
  const companyCount = selectedCompanyIds.length > 0 ? selectedCompanyIds.length : companies.length
  tokens += companyCount * 300      // per-company scope info
  return tokens
}, [includePeriod, selectedCompanyIds, companies.length])
```

Display: muted row showing `"~4,100 tokens"`. Turns **amber** with a warning message when `estimatedTokens > 20,000`.

---

## Agent Kill Switch + Disable

### Migration (015_agent_cancel.sql)
```sql
ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS cancellation_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at           timestamptz;
```
Note: `agents.is_active` already existed from `007_agents.sql`.

### Fix 1 — Cancel Running Agent Run

**Flow**
1. User clicks "Cancel Run" button on run stream page (only visible when `status === 'running'`)
2. Inline confirmation panel: "Cancel this run?" + Confirm / Nevermind buttons
3. Confirm → `POST /api/agents/runs/[runId]/cancel`
4. Cancel route sets `cancellation_requested = true` on the `agent_runs` row
5. The `executeAgentRun()` loop polls for this flag at the **start of each iteration** (before calling the model)
6. When detected: updates run to `status='cancelled'`, emits `{ type: 'cancelled' }` SSE event, returns early
7. Run page handles `cancelled` event → sets `status = 'cancelled'`, shows summary card with amber "Run cancelled" message

**Key files**
- `app/api/agents/runs/[runId]/cancel/route.ts` (new) — POST sets `cancellation_requested=true`; only works on `running`/`queued` runs
- `lib/agent-runner.ts` — cancellation check added at top of agentic while-loop; `RunEvent` union extended with `{ type: 'cancelled' }`
- `app/api/agents/runs/[runId]/stream/route.ts` — replay of cancelled runs now emits partial output + `{ type: 'cancelled' }`
- `app/(dashboard)/agents/runs/[runId]/page.tsx` — Cancel button with inline confirmation; handles `cancelled` SSE event; SummaryCard shows `Ban` icon + "Run cancelled" for `isCancelled` status

**Cancellation checkpoint timing**
The DB poll happens before each model API call. This means the agent stops cleanly between model calls — never mid-stream. Current tool execution completes before the stop is detected.

### Fix 2 — Disable/Enable Agent

**Behaviour**
- Each agent card on `/agents` shows a small pill toggle (admin only): `● On` / `○ Off`
- Hovering the `● On` pill previews red (disable intent); hovering `○ Off` previews green (enable intent)
- Clicking does an optimistic UI update + `PATCH /api/agents/[id]` with `{ is_active: false/true }`
- On error: reverts to previous state
- When disabled: card is dimmed (`opacity-60`), "Disabled" badge shown next to name, **Run button hidden**
- `PATCH /api/agents/[id]` already accepts `{ is_active }` — no route change needed
- `POST /api/agents/[id]/run` already validates `agent.is_active` and returns 422 if false — no route change needed

**lib/types.ts — AgentRun additions**
```typescript
cancellation_requested: boolean
cancelled_at:           string | null
```

---

## Agent Run Detail Restructure + CollapsibleSection

### components/ui/CollapsibleSection.tsx (new)
`'use client'` component used in both server and client components for collapsible panels.

```typescript
interface CollapsibleSectionProps {
  title:           string
  badge?:          string        // shown right-aligned in header, truncated to 280px
  defaultOpen?:    boolean       // default true
  children:        React.ReactNode
  className?:      string        // override card bg/border (e.g. zinc dark theme for admin)
  headerClassName?: string       // override hover colour
}
```
- Chevron rotates 180° when expanded
- Smooth expand/collapse via CSS grid trick: `grid-rows-[0fr]` ↔ `grid-rows-[1fr]`
- `overflow-hidden` on inner wrapper prevents content flash during transition

### app/(dashboard)/agents/runs/[runId]/page.tsx
Restructured into three CollapsibleSections:
- **Brief** (collapsed by default): `extra_instructions` prompt, agent name + model, tools badge list, period from `input_context`; badge = first 60 chars of instructions or "No additional instructions"
- **Activity** (expanded): streaming timeline (unchanged); badge when isDone = "N tool calls · Xs"; badge hidden while running
- **Output** (expanded, rendered only when `isDone`): doc/report cards + text response with copy button; badge = "Error" | "~N words" | "Cancelled"

`SummaryCard` component removed entirely. `renderDocCards()` and `renderReportCards()` extracted as standalone functions. `copied/setCopied` state moved to main component.

### app/(dashboard)/agents/[id]/runs/page.tsx
Added brief preview below status badge in each table row — 60-char truncated `input_context.extra_instructions` shown as `text-[11px] text-muted-foreground`.

### app/(admin)/admin/agent-runs/[runId]/page.tsx
Full rewrite with same three CollapsibleSections (Brief/Activity/Output) matching the admin zinc dark theme:
- Zinc styling passed via props: `className="bg-zinc-900 border-zinc-800"` + `headerClassName="hover:bg-zinc-800/50"`
- `input_context` and `model_used` added to DB select query
- Activity section uses `<details>` accordion for tool calls (same pattern as before, now inside CollapsibleSection)
- `model_used` → human label: `claude-*-opus-*` → "Claude Opus 4", `gpt-4o` → "GPT-4o", else → "Claude Sonnet 4"

---

## NavHub Assistant

### Overview
A floating AI chat assistant available on every page. Uses Claude Haiku for fast, context-aware responses. Can generate **Agent Briefs** (structured prompts) that users can copy or launch directly into a Run.

### lib/assistant.ts
Pure helpers and types — no side effects.

```typescript
export interface AssistantContext {
  pathname:         string
  groupName:        string
  companyName?:     string
  userRole:         string
  agents:           { id: string; name: string; tools: string[]; is_active: boolean }[]
  templates:        { id: string; name: string; template_type: string }[]
  recentRuns:       { id: string; agentName: string; status: string; created_at: string; duration_seconds: number | null }[]
  companies:        { id: string; name: string }[]
  recentDocuments:  { id: string; title: string; document_type: string; created_at: string }[]
  recentReports:    { id: string; name: string; created_at: string }[]
  folders:          { id: string; name: string }[]
}

export interface AssistantMessage {
  id:      string
  role:    'user' | 'assistant'
  content: string
  brief?:  string | null
}

export function extractBrief(text: string): { displayText: string; brief: string | null }
// Extracts [BRIEF_START]...[BRIEF_END] markers from assistant text.
// Returns brief content + displayText with markers stripped.

export function buildSystemPrompt(context: AssistantContext, isAdmin?: boolean): string
// Builds system prompt injecting all context: group, role, agents, templates, recent runs,
// companies, recent documents, recent reports, folders, and current page.
// Instructs the model to emit [BRIEF_START]...[BRIEF_END] for agent briefs.
```

### app/api/assistant/chat/route.ts
```
POST /api/assistant/chat
  body: { messages: ChatMessage[], context: { pathname, userRole }, isAdmin?: boolean }
  → Auth check + active group check (from cookie)
  → buildAssistantContext(groupId, pathname, userRole) — fetches all live data server-side:
      agents, templates, last 10 runs, companies, last 5 docs, last 5 reports, folders
  → buildSystemPrompt(fullContext, isAdmin)
  → Call Anthropic API (claude-haiku-4-5-20251001, max_tokens: 1024, stream: true)
  → Proxy SSE chunks back to client as: data: {"type":"chunk","content":"..."}
  → On stream end: extractBrief(fullText), emit:
       data: {"type":"done","brief":string|null,"displayText":string|null}
  → On error: data: {"type":"error","message":"..."}
```
Returns `Content-Type: text/event-stream`.

**`buildAssistantContext(groupId, pathname, userRole)`** — server-side only (admin client):
- Fetches in parallel via `Promise.allSettled`: agents, templates, agent_runs (last 10), companies, documents (last 5), custom_reports (last 5), document_folders
- Any failed fetch silently degrades to empty array — assistant still works with partial data

### components/assistant/AssistantButton.tsx
Fixed bottom-right circle button (`h-12 w-12`, `bg-primary`, `Sparkles` icon).
- `z-40`, `bottom-6 right-6`
- Opens `AssistantPanel` when clicked; re-renders panel on close (state reset)
- Accepts `isAdmin?: boolean` + `groupId?: string` → both passed to `AssistantPanel`

### components/assistant/AssistantPanel.tsx
Floating, draggable, resizable chat panel. Default: 420×580px, positioned bottom-right.

**Position & size**: tracked in state; defaults to `window.innerWidth - width - 24, window.innerHeight - height - 24`.
- Persisted to `localStorage`: `navhub:assistant:position` and `navhub:assistant:size`
- Restored on mount; size clamped to min 300×400 / max 800×900

**Dragging**: `onMouseDown` on header sets `dragging=true`; `mousemove` on `window` updates position; `mouseup` ends drag + saves to localStorage. Buttons in header excluded from drag target.

**Resizing**: 6px handle on left edge (`cursor: ew-resize`) + bottom edge (`cursor: ns-resize`); `mousedown` captures start state; `mousemove` computes new size. Left resize also adjusts `position.x` to keep right edge fixed.

**History persistence**: Messages saved to `localStorage` keyed by `navhub:assistant:messages:{groupId}`. Loaded on mount. "New conversation" (Plus icon) clears both state and localStorage. In-flight streaming messages are not persisted (filtered by `!m.streaming`).

**Backdrop**: `bg-black/10` with `pointer-events: none` — clicks pass through to page content behind the panel. Panel does NOT close when clicking the backdrop.

**Context (client-side)**: Only `pathname` + `userRole` (from one GET `/api/groups/active` on mount) sent to server. Server fetches all live data itself.

**Suggested prompts**: When `messages.length === 0`, shows 4 clickable prompt chips. Disabled until role fetch completes.

**Streaming**: Calls `POST /api/assistant/chat`, reads SSE, accumulates `chunk` events. On `done`: replaces content with `displayText` (markers stripped) + attaches `brief` to message.

**AgentBriefCard**: Rendered below any assistant message with `brief !== null`.
- "Copy Brief": `navigator.clipboard.writeText(brief)`
- "Launch Agent →": navigates to `/agents?brief={encodeURIComponent(brief)}`

**MessageBubble**: User = right-aligned `bg-primary`; Assistant = left-aligned `bg-muted` with `ReactMarkdown` + `remark-gfm`. Streaming cursor blink while `streaming: true`.

**Input**: Auto-resizing textarea (max 4 lines / 96px). Enter → send; Shift+Enter → newline.

### Layout integration
- `app/(dashboard)/layout.tsx`: `<AssistantButton groupId={activeGroup.id} />` — history keyed per group
- `app/(admin)/layout.tsx`: `<AssistantButton isAdmin />` — no groupId (admin spans all groups)

### Agents page — ?brief= pre-fill
`app/(dashboard)/agents/page.tsx`:
- `useSearchParams()` reads `?brief=` query param on mount
- `briefParam` passed as `initialInstructions` to `RunModal` when any agent's Run button is clicked

`components/agents/RunModal.tsx`:
- New prop: `initialInstructions?: string` (default `''`)
- `extraInstructions` state initialised to `initialInstructions`

### Dependencies (already installed)
- `react-markdown` + `remark-gfm` — already installed for Document Intelligence (Phase 7a)

---

## Next Steps

1. Set up Supabase Storage bucket `report-files` with RLS policies (manual — see Phase 2f section)
2. Set up Supabase Storage bucket `excel-uploads` with appropriate policies
3. Add `NAVHUB_ENCRYPTION_KEY` and `ANTHROPIC_API_KEY` to Vercel environment variables
4. Run migration `007_agents.sql` in Supabase dashboard
5. **Run migration `008_settings.sql`** in Supabase dashboard (Phase 3b — fy_end_month + excel_uploads fields)
6. **Run migration `009_cashflow.sql`** in Supabase dashboard (Phase 4a — cashflow tables)
7. **Run migration `010_report_templates.sql`** in Supabase dashboard (Phase 5a — template tables)
8. Seed Role & Task Matrix V5 template: POST `/api/report-templates/seed` (admin user, active group must be set)
9. **Run migration `011_group_slug.sql`** in Supabase dashboard (group slug column + unique index)
10. **Run migration `012_report_sharing.sql`** in Supabase dashboard (is_shareable, share_token, share_token_created_at on custom_reports)
11. **Run migration `014_documents.sql`** in Supabase dashboard (Phase 7a — document_folders, documents, document_versions, document_sync tables)
12. **Run migration `015_agent_cancel.sql`** in Supabase dashboard (Agent Kill Switch — cancellation_requested + cancelled_at on agent_runs)
13. Add `error.tsx` files for each route segment
13. Add chart visualisations to financial report pages (trend lines, bar charts)
14. Phase 4b: Pull Xero AR/AP into cashflow (cashflow_xero_items), group summary page
15. Phase 5e: Agent-scheduled template generation (cron triggers), template sharing/export
16. Phase 7c: Document sync connections (Xero AR/AP pull into documents, external sync)

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

---

## Phase 4a — 13-Week Rolling Cash Flow Forecast (Manual Mode)

### Database (migration 009)
- **`cashflow_settings`** — per-company config: `opening_balance_cents`, `week_start_day` (0=Sun…6=Sat), `ar_lag_days`, `ap_lag_days`, `currency`; PRIMARY KEY = `company_id`
- **`cashflow_items`** — recurring/one-off line items: `section` (inflow|regular_outflow|payable), `recurrence` (weekly|fortnightly|monthly|one_off), `start_date`, `end_date`, `day_of_week`, `day_of_month`, `pending_review`, `is_active`; amounts as bigint cents
- **`cashflow_xero_items`** — stub for Phase 4b (Xero AR/AP pull); columns: `xero_invoice_id`, `contact_name`, `due_date`, `section`, `is_overridden`
- **`cashflow_forecasts`** — auto-saved current forecast grid (JSONB); PRIMARY KEY = `company_id`; upserted on change
- **`cashflow_snapshots`** — named saved versions with `name`, `notes`, `grid_data` JSONB, `created_by`
- All tables: RLS using `get_user_group_ids()` via `companies.group_id` join

### lib/cashflow.ts (projection engine)
```typescript
export function getWeekStart(date: Date, weekStartDay: number): Date
  // weekStartDay: 0=Sun … 6=Sat. Returns Monday (or chosen day) of the containing week.

export function get13Weeks(weekStartDay: number): string[]
  // Returns 13 ISO date strings (week start dates), starting from current week.

export function formatWeekHeader(isoDate: string): string
  // e.g. "07 Apr" — used for column headers

export function projectItem(item: CashflowItem, weeks: string[]): number[]
  // Returns amount_cents for each week (0 if item doesn't occur).
  // weekly: occurs on day_of_week each week
  // fortnightly: alternate weeks from start_date
  // monthly: occurs on day_of_month (clamped to last day of month if needed)
  // one_off: occurs on start_date
  // IMPORTANT: Set<string> iteration avoided — uses [m1, m2] dedup array pattern (no downlevelIteration needed)

export function buildForecastGrid(params: { items, settings, weeks }): ForecastGrid
  // Builds sections (inflows, regularOutflows, payables), subtotals, and rolling balance summary.
  // Net = inflows − outflows − payables (costs are subtracted)
  // Opening/Closing balance rolls forward week-by-week from settings.opening_balance_cents
```

### API routes
```
GET  /api/cashflow/[companyId]/forecast          → compute full ForecastGrid + settings
GET  /api/cashflow/[companyId]/items             → list active items
POST /api/cashflow/[companyId]/items             → create item
PATCH  /api/cashflow/[companyId]/items/[id]      → update item (incl. pending_review, is_active)
DELETE /api/cashflow/[companyId]/items/[id]      → soft delete (is_active = false)
GET  /api/cashflow/[companyId]/settings          → get settings (returns defaults if no row)
PATCH  /api/cashflow/[companyId]/settings        → upsert settings
POST /api/cashflow/[companyId]/save              → upsert computed grid to cashflow_forecasts
POST /api/cashflow/[companyId]/snapshot          → create named snapshot (body: name, notes, grid_data)
GET  /api/cashflow/[companyId]/snapshots         → list snapshots (no grid_data, for perf)
GET  /api/cashflow/[companyId]/snapshots/[id]    → full snapshot including grid_data
DELETE /api/cashflow/[companyId]/snapshots/[id]  → hard delete snapshot
```

### UI pages
- `/cashflow` — company selector cards (company grid, active only)
- `/cashflow/[companyId]` — main 13-week forecast grid (client component)
  - Horizontally scrollable table; sticky left column (200px)
  - Sections: INFLOWS → subtotal, REGULAR OUTFLOWS → subtotal, PAYABLES → subtotal
  - Summary: NET CASH FLOW, OPENING BALANCE, CLOSING BALANCE
  - Negative closing balance → red background cell; uses parenthesis notation e.g. `($1,200)`
  - Edit icon (hover-visible per row) → opens `ItemModal`
  - "+ Add inflow/outflow/payable" button per section
  - Pending review banner (amber) when items have `pending_review = true`
  - "Save snapshot" button (opens name modal) → POST snapshot → redirect to history
  - Auto-save: after item add/edit/delete, grid is re-fetched and saved to cashflow_forecasts
  - `Saving…` / `Saved ✓` indicator in top bar
- `/cashflow/[companyId]/settings` — opening balance, week start day, AR/AP lag, currency
- `/cashflow/[companyId]/history` — list of saved snapshots (no grid_data), delete button
- `/cashflow/[companyId]/history/[snapshotId]` — read-only grid viewer for a snapshot
- `/cashflow/group` — placeholder for Phase 4b group summary

### components/cashflow/ItemModal.tsx
- Modal form: label, section (dropdown), amount ($), recurrence (dropdown)
- Conditionally shows: day_of_week (weekly/fortnightly), day_of_month (monthly)
- start_date (required), end_date (optional)
- Create: POST `/api/cashflow/[companyId]/items`; Edit: PATCH `.../items/[id]`
- Calls `onSave(savedItem)` on success

### AppShell changes (Cash Flow nav)
- `CashflowGroup` component added (same pattern as `ReportsGroup` / `ForecastGroup`)
- `Banknote` icon from lucide-react
- `CASHFLOW_CHILDREN = [{ label: 'Overview', href: '/cashflow' }]`
- Inserted between ReportsGroup and ForecastGroup in sidebar
- State: `cashflowOpen`, `cashflowActive` = `pathname.startsWith('/cashflow')`

### ForecastGrid type
```typescript
interface ForecastGrid {
  weeks: string[]   // 13 ISO date strings
  sections: {
    inflows:        ForecastSection
    regularOutflows: ForecastSection
    payables:       ForecastSection
  }
  summary: {
    netCashFlow:    number[]
    openingBalance: number[]
    closingBalance: number[]
  }
}
interface ForecastSection { rows: ForecastRow[]; subtotals: number[] }
interface ForecastRow { item_id: string|null; label: string; amounts_cents: number[]; is_editable: boolean; pending_review: boolean }
```

### Conventions
- All amounts stored as bigint cents (same as rest of app)
- `formatCents()` helper defined locally in cashflow pages (not in lib/utils — cashflow-specific)
- `pending_review` flag on items: agent or admin sets this to true for items needing human review; shown as amber dot in grid rows
- Snapshots are hard-deleted (not soft-deleted) — they are named versions, not primary data
- Items are soft-deleted (`is_active = false`) — primary source of truth for the forecast

---

## Phase 5a — Report Template Infrastructure

### Database (migration 010)
- **`report_templates`** — per-group reusable templates: `template_type` (financial|matrix|narrative|dashboard|workflow), `version` counter (auto-incremented on PATCH), `design_tokens` JSONB, `slots` JSONB (array of `SlotDefinition`), `scaffold_html/css/js` text, `data_sources` JSONB, `agent_instructions`; soft-delete with `is_active`
- **`report_template_versions`** — auto-saved prior versions on every PATCH; stores full template snapshot including all scaffold content + slots + tokens; `version` = the version number *before* the edit
- **`custom_reports`** extended: `template_id uuid` (FK → report_templates, nullable), `slot_data jsonb` (values used when generating)
- RLS: group members can SELECT; admins (super_admin/group_admin) can ALL

### lib/template-renderer.ts
```typescript
export function renderSlots(scaffold: string, slotData: Record<string, unknown>): string
  // Replaces {{slot_name}} placeholders (word-char regex) with values
  // Objects/arrays are JSON.stringify'd before substitution

export function renderTokens(css: string, tokens: Record<string, string>): string
  // Replaces {{token-name}} placeholders (hyphen-aware regex /\{\{([\w-]+)\}\}/g) with token values
  // Token names can contain hyphens (e.g. {{col-axis}})

export function renderTemplate(template: ReportTemplate, slotData: Record<string, unknown>): string
  // 1. renderTokens on scaffold_css to resolve design token variables
  // 2. renderSlots on scaffold_html to insert slot values
  // 3. Assembles self-contained <html> document with inline <style> and <script>

export function validateSlots(slots: SlotDefinition[], slotData: Record<string, unknown>): SlotValidationResult
  // Returns { valid: boolean, missing: string[] }
  // Only checks 'manual' data_source slots — auto/agent slots are filled server-side
```

### Types added to lib/types.ts
```typescript
export type TemplateType = 'financial' | 'matrix' | 'narrative' | 'dashboard' | 'workflow'
export type SlotType = 'text' | 'html' | 'number' | 'table' | 'list' | 'date' | 'color' | 'object'
export type SlotDataSource = 'navhub_financial' | 'manual' | 'uploaded_file' | 'agent_provided'
export interface SlotDefinition {
  name: string; label: string; type: SlotType; description: string
  required: boolean; default?: unknown; data_source: SlotDataSource
  navhub_query?: { type: string; period: string; companies?: string[] }
}
export interface DataSourceConfig { type: SlotDataSource; config: Record<string, unknown> }
export interface ReportTemplate {
  id: string; group_id: string; name: string; description: string | null
  template_type: TemplateType; version: number
  design_tokens: Record<string, string>; slots: SlotDefinition[]
  scaffold_html: string | null; scaffold_css: string | null; scaffold_js: string | null
  data_sources: DataSourceConfig[]; agent_instructions: string | null
  created_by: string | null; agent_run_id: string | null; is_active: boolean
  created_at: string; updated_at: string
}
export interface ReportTemplateVersion {
  id: string; template_id: string; version: number; name: string; description: string | null
  template_type: TemplateType; design_tokens: Record<string, string>; slots: SlotDefinition[]
  scaffold_html: string | null; scaffold_css: string | null; scaffold_js: string | null
  created_at: string
}
```

### API routes
```
GET  /api/report-templates                                → list active templates (no scaffold, for listing)
POST /api/report-templates                                → create template (admin only)
GET  /api/report-templates/[id]                           → full template record including scaffold
PATCH  /api/report-templates/[id]                         → save current as version → increment version → update
DELETE /api/report-templates/[id]                         → soft delete (is_active = false)
POST /api/report-templates/[id]/render                    → preview: { slot_data } → { html, missing_slots, valid }
POST /api/report-templates/[id]/generate                  → { slot_data, report_name, notes } → render + save to custom_reports
GET  /api/report-templates/[id]/versions                  → list version metadata (no scaffold content)
GET  /api/report-templates/[id]/versions/[versionId]      → full version record including scaffold
POST /api/report-templates/seed                           → seed Role & Task Matrix V5 for active group (admin)
```

### Version history auto-save (PATCH pattern)
```typescript
// Before updating, save current state to report_template_versions
void admin.from('report_template_versions').insert({ template_id: id, version: current.version, ...currentFields })
// Then increment version and update main record
await admin.from('report_templates').update({ version: current.version + 1, ...updates }).eq('id', id)
```

### Generate route — storage path
Generated reports are saved to Storage bucket `report-files` using the same path pattern as custom report uploads:
`{group_id}/reports/{timestamp}_{sanitisedReportName}.html`
Then inserted into `custom_reports` with `template_id` and `slot_data` for traceability.

### Template Library UI (`/reports/templates`)
- Card grid; type filter bar (All | Financial | Matrix | Narrative | Dashboard | Workflow)
- Each card: type badge (coloured), version badge, updated date, template name, description
- Actions: Generate button → `/reports/templates/[id]/generate`, View button → `/reports/templates/[id]`
- Admin: Create New Template button (top-right)
- Empty state with admin create CTA

### Template Detail UI (`/reports/templates/[id]`)
- 4 tabs: **Overview** (name/description/meta), **Slots** (table: name, label, type badge, required, source, description), **Design Tokens** (grid: name, value, colour swatch for hex values), **Version History** (table: version, name, date; click to view full version)
- Toolbar: Back · Edit · Generate (+ admin Delete button)

### Generate Wizard UI (`/reports/templates/[id]/generate`)
- 3 steps: **Fill Slots** (0) → **Preview** (1) → **Save** (2)
- Step 0: One input per slot; `manual` slots render appropriate input (text/number/date/color/textarea); non-manual slots show informational note ("auto-filled from NavHub data")
- Step 1: iframe with `srcDoc={previewHtml}` and `sandbox="allow-scripts allow-same-origin"`; Preview button POSTs to `/render`
- Step 2: Report name + notes inputs; Save button POSTs to `/generate`; on success redirects to `/reports/custom`

### AppShell Reports nav update
`REPORT_CHILDREN` in AppShell extended with Templates entry:
```typescript
const REPORT_CHILDREN = [
  { label: 'Profit & Loss',   href: '/reports/profit-loss'  },
  { label: 'Balance Sheet',   href: '/reports/balance-sheet' },
  { label: 'Templates',       href: '/reports/templates'     },  // ← added Phase 5a
  { label: 'Reports Library', href: '/reports/custom'        },
]
```

### Role & Task Matrix V5 — Seed Template
The seed route (`POST /api/report-templates/seed`) inserts a complete working matrix template for the active group. Key properties:
- **8 slots**: `matrix_title` (text, manual), `organisation_name` (text, manual), `version_label` (text, manual), `entity_definitions` (object, manual), `column_definitions` (object, manual), `section_definitions` (object, manual), `role_data` (object, manual), `headcount_summary` (object, manual)
- **9 entity design tokens** (col-axis, col-corp, col-fin, col-hr, col-ops, col-legal, col-pm, col-mktg, col-it) plus base UI tokens (bg-primary, bg-secondary, text-primary, text-secondary, text-muted, border-color, row-alt, accent-positive, accent-neutral, accent-caution, accent-negative)
- **JSON slot embedding pattern**: complex data slots use `<script type="application/json" id="slot-name">{{slot_name}}</script>` so scaffold JS can `JSON.parse(document.getElementById('slot-name').textContent)` at render time
- **Interactive features in scaffold JS**: entity highlight on legend click, column highlight on header click, cell highlight on click, sticky header, headcount panel, dark/light theme toggle
- **Dual theme**: CSS uses `[data-theme="dark"]` / `[data-theme="light"]` attribute toggling; JS sets initial theme from `prefers-color-scheme` media query

### Token vs slot placeholder regex
- **Slots** (in HTML): `/\{\{(\w+)\}\}/g` — matches `{{slot_name}}` (word chars only)
- **Tokens** (in CSS): `/\{\{([\w-]+)\}\}/g` — matches `{{token-name}}` (word chars including hyphens)
- The different regex patterns ensure design token references in CSS (which use hyphens) don't conflict with slot placeholders in HTML

### Manual setup required
1. Run migration `010_report_templates.sql` in Supabase dashboard
2. Ensure `report-files` Storage bucket exists (used by generate route)
3. Seed template: `POST /api/report-templates/seed` with admin session + active group cookie

---

## Report Viewer Header + Group Slug

### Report Viewer Branded Header
`app/(dashboard)/reports/custom/[id]/page.tsx` — thin 44px branded header injected between toolbar and iframe:
- Background: `var(--palette-surface, #1a1d27)` (always dark; matches sidebar)
- Border-bottom: `1px solid rgba(255,255,255,0.08)`
- Left: NavHub wordmark (nav = `var(--palette-primary)`, hub = white/50) · divider · group name · divider · report name
- Right: Open in new tab icon + Back to Library text link
- `groupName` fetched alongside metadata from `/api/groups/active` (`json.data.group.name`)
- iframe height fills remaining flex-1 space; container uses `flex flex-col`

Same header applied to `app/(dashboard)/cashflow/[companyId]/history/[snapshotId]/page.tsx`:
- Shows: NavHub wordmark · group name · "Cash Flow Snapshot" · snapshot name · Back to History
- Added `/api/groups/active` fetch alongside existing snapshot fetch in parallel

### Group Slug

**Database (migration 011)**
```sql
ALTER TABLE groups ADD COLUMN IF NOT EXISTS slug text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_groups_slug ON groups (slug) WHERE slug IS NOT NULL;
```
Note: `groups.slug` was already being set in the POST /api/groups route (from Phase 3b); migration 011 adds the column and unique index idempotently.

**PATCH /api/groups/[id]** now accepts `{ slug }`:
- Validates: 2+ chars, `/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/` (no leading/trailing hyphens)
- Checks uniqueness against other groups (admin client, `.neq('id', params.id)`)
- Returns 409 if slug taken

**DisplayTab.tsx — URL Slug card** (admin only, between Group Name and Colour Palette):
- Editable text input with monospace font
- Client-side validation: `/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/`
- Save via `PATCH /api/groups/[id]` with `{ slug }`
- Preview URL: `app.navhub.co/[slug]/dashboard`
- Auto-converts input to lowercase on change

---

## Standalone Report Viewer

### `app/view/report/[id]/page.tsx`
- Server component outside the `(dashboard)` layout — no AppShell/sidebar
- Uses admin client to fetch report name (`custom_reports`) and group name (`groups` join)
- Accepts `searchParams: { token?: string }` for public token-based access
- Access control (two paths):
  - **Session user**: checks group membership via admin client → serves file from `/api/reports/custom/${id}/file`
  - **Token user** (no session): validates token against DB (`is_shareable=true`, `share_token===token`) → serves from `/api/reports/public/${id}/file?token=${token}`
  - **Denied**: renders `<NotAvailable />` component (no login prompt, no details)
- Renders 44px branded header + full-viewport iframe (`height: 100vh`)
- "Back to Library" link hidden for unauthenticated token users
- Inline styles used (no Tailwind palette CSS vars since outside dashboard layout):
  - Header bg: `var(--palette-surface, #1a1d27)`; border: `1px solid rgba(255,255,255,0.08)`
  - Wordmark: `nav` in `var(--palette-primary, #0ea5e9)`, `hub` in `rgba(255,255,255,0.5)`

### Middleware public paths
`middleware.ts` (project root) includes `/view/report/` and `/api/reports/public/` in the `isPublic` list so unauthenticated requests pass through without being redirected to `/login`.

---

## Report External Sharing

### Database (migration 012)
```sql
ALTER TABLE custom_reports
  ADD COLUMN IF NOT EXISTS is_shareable          boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS share_token           text,
  ADD COLUMN IF NOT EXISTS share_token_created_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS uq_custom_reports_share_token
  ON custom_reports (share_token) WHERE share_token IS NOT NULL;
```

### Share management API (`app/api/reports/custom/[id]/share/route.ts`)
Admin only (super_admin / group_admin). All three methods verify session + active group + admin role before acting.

```
GET  /api/reports/custom/[id]/share
  → { is_shareable, share_url, created_at }
  → share_url = null when not shared; constructed from NEXT_PUBLIC_APP_URL

POST /api/reports/custom/[id]/share
  → Generates randomBytes(32).toString('hex') token
  → Sets is_shareable=true, share_token, share_token_created_at
  → Returns { is_shareable: true, share_url, created_at }
  → Idempotent — re-calling regenerates the token (old links stop working)

DELETE /api/reports/custom/[id]/share
  → Sets is_shareable=false, share_token=null, share_token_created_at=null
  → Returns { is_shareable: false }
  → Existing links stop working immediately
```

### Public file endpoint (`app/api/reports/public/[id]/file/route.ts`)
- No session required — public endpoint
- GET with `?token=` query param (returns 403 if missing)
- Admin client queries `custom_reports` where `id`, `is_active=true`, `is_shareable=true`
- Compares `share_token` — returns generic 403 for both wrong token and missing report (no information leakage)
- Returns 1-hour signed Storage URL with `Cache-Control: private, no-store`

### lib/types.ts — CustomReport additions
```typescript
is_shareable:           boolean
share_token:            string | null
share_token_created_at: string | null
```

### Dashboard Report Viewer — Share UI (`app/(dashboard)/reports/custom/[id]/page.tsx`)
- Admin only: **Share** button added to toolbar between Download and Open in tab
- Inline `SharePopover` component (backdrop + panel):
  - Lazy fetches `GET /api/reports/custom/${id}/share` on mount
  - **Not shared**: "This report is private" message + "Generate share link" button (POST)
  - **Shared**: read-only URL input + Copy button (2s "Copied!" indicator via `navigator.clipboard.writeText()`) + created date + amber warning text + "Revoke link" button (DELETE with `confirm()`)
  - Close button (X) in panel header

### Reports Library — Shared badge (`app/(dashboard)/reports/custom/page.tsx`)
- Cards where `report.is_shareable === true` show an emerald "Shared" badge:
  - Style: `border-emerald-400/50 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30`
  - Icon: `<Share2 className="h-3 w-3" />`

### Security notes
- Token is 64-char hex (`randomBytes(32)`) — not guessable
- Generic 403 on public endpoint prevents enumeration of report IDs
- Token never included in error messages or logs
- `Cache-Control: private, no-store` prevents CDN/proxy token exposure
- Revoking immediately invalidates all existing links (token set to null)
- Share URL format: `{NEXT_PUBLIC_APP_URL}/view/report/{id}?token={token}`

---

## Phase 5b — Agent Template Tools

### New tools in lib/agent-tools.ts
Six new tools added to the agent system. All use the admin Supabase client and return `JSON.stringify({ success, data })` on success or an error string on failure.

| Tool | Description |
|------|-------------|
| `list_report_templates` | Lists active templates for the group; optional `template_type` filter; returns `id, name, template_type, description, version, updated_at` |
| `read_report_template` | Fetches full template definition; `include_scaffold: true` adds `scaffold_html/css/js` fields |
| `create_report_template` | Inserts new template with `agent_run_id` set to current run; returns `id, name, template_type, version` |
| `update_report_template` | Auto-saves current state to `report_template_versions` then increments version and applies changes |
| `render_report` | Validates slots, renders via `renderTemplate()`, uploads to Storage, inserts `custom_reports` record; returns `report_id, report_name, view_url` |
| `analyse_document` | Fetches file (from URL or `file_content`), calls Anthropic claude-haiku with extraction prompt, returns proposed template JSON — does NOT save |

### generate_report extended
`generate_report` now accepts optional `template_id` + `slot_data`. When both are provided, renders via `renderTemplate()` instead of free-form markdown HTML. Also writes `template_id` and `slot_data` to the `custom_reports` record for traceability.

### lib/agent-runner.ts changes
- Import 6 new tool functions
- 6 new entries in `ALL_TOOL_DEFS` (Claude API tool definition format)
- 6 new `case` branches in `executeTool()` dispatcher

### lib/types.ts — AgentTool additions
```typescript
| 'list_report_templates'
| 'read_report_template'
| 'create_report_template'
| 'update_report_template'
| 'render_report'
| 'analyse_document'
```

### app/(dashboard)/agents/page.tsx + _form.tsx
- `TOOL_LABELS` record extended with labels for all 6 new tools
- `TOOL_OPTIONS` array in `_form.tsx` extended with descriptions and emoji for agent tool selector

---

## Phase 5c — Template Editor UI

### app/(dashboard)/reports/templates/new/page.tsx
Three-path creation flow — path selector shows 3 cards:
- **Upload Document** — file input (`.html`, `.docx`, `.txt`, `.pdf`, max 5 MB) + optional instructions textarea → POST `/api/report-templates/analyse` → stores proposal in `sessionStorage` → navigate to `/new/review`
- **Describe to Agent** — textarea + template type selector → POST analyse with description as file content + instructions → navigate to `/new/review`
- **Build Manually** — navigates directly to `/new/manual`

### app/(dashboard)/reports/templates/new/review/page.tsx
Side-by-side diff review of agent proposal read from `sessionStorage.template_proposal`:
- Left column: "Source Document" — detected metadata (filename, inferred type, slot count, token count)
- Right column: "Agent Proposal" — name, description, type badge; slot tags (green `{{name}}` chips); design token swatches
- Confidence badge (high/medium/low) in header; agent notes shown as amber warning
- Action bar: slot/token count summary · "Edit in Full Editor" (writes proposal to `sessionStorage.template_prefill`, navigates to `/new/manual`) · "Accept & Save Template →" (POST `/api/report-templates`, navigate to detail page)

### app/(dashboard)/reports/templates/new/manual/page.tsx
Full 4-tab manual template editor (creates new template):
- **Details**: Name *, type selector, description, agent_instructions
- **Slots**: table with Edit/Delete per row; "Add Slot" opens modal (name, label, type, data_source, description, required checkbox)
- **Design Tokens**: key/value table with inline value editing, colour swatches for hex values; "Add Token" row
- **Scaffold**: three `<textarea>` editors (HTML | CSS | JS); "Inject slot names" inserts `{{slot}}` comments; "Refresh preview" renders a live preview iframe with slot names shown as `[Label]` placeholders
- Loads prefill from `sessionStorage.template_prefill` on mount (set by review page)
- Save → POST `/api/report-templates`, navigate to template detail

### app/(dashboard)/reports/templates/[id]/edit/page.tsx
Identical 4-tab layout to the manual editor, but:
- Loads existing template via `GET /api/report-templates/[id]` on mount
- Save → PATCH `/api/report-templates/[id]` (auto-versions current state before saving)
- Back button → `/reports/templates/[id]`

### app/(dashboard)/reports/templates/[id]/page.tsx updates
- Added **Edit** button (admin only) to toolbar → `/reports/templates/[id]/edit`
- Added **Restore** button per version in Version History tab (admin only)
  - Fetches full version from `GET /api/report-templates/[id]/versions/[versionId]`
  - PATCHes the template with version's `design_tokens`, `slots`, `scaffold_*` fields
  - Reloads template after successful restore

### app/api/report-templates/analyse/route.ts (NEW)
```
POST /api/report-templates/analyse
  → multipart: file (max 5 MB) + instructions (optional)
  → extracts text content from file (utf-8 for html/txt/docx; sanitised for pdf)
  → calls claude-haiku-4-20250514 with extraction system prompt
  → returns { data: { proposal: TemplateProposalJSON, filename: string } }
  → does NOT save anything — proposal only
  → admin access required
```

### Slot modal (shared pattern in both manual + edit pages)
- Opens as a fixed overlay
- `name` field auto-lowercases and replaces spaces with underscores
- `type` select: text | html | number | table | list | date | color | object
- `data_source` select: manual | navhub_financial | agent_provided | uploaded_file
- `required` checkbox

---

## SuperAdmin Section

### Overview
A dedicated `/admin` area accessible only to users with `super_admin` role. Separate from the regular dashboard — no AppShell. Provides cross-tenant visibility and group impersonation.

### Route group
`app/(admin)/` — a Next.js route group outside `(dashboard)`, with its own layout that has no AppShell sidebar.

### Access control (2-layer)
1. **Middleware** (`middleware.ts`): checks `user_groups.role = 'super_admin'` for all `/admin/**` and `/api/admin/**` routes → redirects to `/dashboard` if not super_admin.
2. **Layout/route defence**: `app/(admin)/layout.tsx` and all admin API routes perform an independent super_admin check (defence-in-depth).

### Impersonation write-block (middleware)
When `navhub_impersonate_group` cookie is present, middleware blocks all `POST/PATCH/PUT/DELETE` requests to `/api/**` routes — except `DELETE /api/admin/impersonate` (exit impersonation). Returns `403` with clear error message.

### Admin layout (`app/(admin)/layout.tsx`)
- Fixed top nav (h-11) with 2px amber border at very top
- NavHub wordmark + amber "ADMIN" badge
- Nav links: Dashboard · Groups · Users · Agent Runs · System
- "Exit Admin" button → `/dashboard`
- No AppShell, no sidebar

### Pages

| Page | Path | Type | Description |
|------|------|------|-------------|
| Platform Dashboard | `/admin` | Server | 4 stat cards (groups/cos/users/runs), recent agent runs, groups at a glance |
| Groups | `/admin/groups` | Client | Table with search; all groups, co/user counts, impersonate button |
| Group Detail | `/admin/groups/[id]` | Client | 3 tabs: Overview (meta + companies + storage), Users (members with roles), Activity (runs/reports/docs/snapshots) |
| Users | `/admin/users` | Client | All users from auth; email, groups+roles (linked chips), created, last sign in |
| Agent Runs | `/admin/agent-runs` | Client | Paginated runs across all groups; status filter; view button |
| Run Detail | `/admin/agent-runs/[runId]` | Server | Metadata cards, tool calls accordion, agent output |
| System | `/admin/system` | Server | Env var status, storage bucket check, DB row counts, recent error runs |

### API routes

```
GET  /api/admin/groups                    → all groups with company_count, user_count, last_run_at
GET  /api/admin/groups/[id]               → group detail + companies + storage file counts
GET  /api/admin/groups/[id]/members       → group members enriched with auth emails
GET  /api/admin/groups/[id]/activity      → recent runs, reports, docs, cashflow snapshots
GET  /api/admin/users                     → all auth users + group memberships (auth.admin.listUsers)
GET  /api/admin/agent-runs                → paginated runs across all groups (?page=&status=)
POST /api/admin/impersonate               → set navhub_impersonate_group cookie + active_group_id
DELETE /api/admin/impersonate             → clear impersonation cookie, restore default group
```

All admin API routes require super_admin verification (admin client check on `user_groups`).

### Group Impersonation

**Flow:**
1. Super_admin clicks "Impersonate" on a group in `/admin/groups`
2. `POST /api/admin/impersonate { group_id }` → encrypts group_id → sets:
   - `navhub_impersonate_group` cookie (httpOnly, AES-256-GCM encrypted, 2h TTL)
   - `active_group_id` cookie (plaintext, 2h TTL) — used by existing API routes
3. Redirects to `/dashboard`
4. Dashboard layout detects `navhub_impersonate_group` cookie → decrypts → fetches group from admin client → shows `ImpersonationBanner` (fixed amber banner at top)
5. AppShell top bar and sidebar are offset by `topOffset=36` to appear below the banner
6. To exit: click "Exit" in banner → `DELETE /api/admin/impersonate` → restores default group → redirects to `/admin/groups`

**Components:**
- `components/admin/ImpersonateButton.tsx` — client component, amber styled, calls POST impersonate
- `components/admin/ImpersonationBanner.tsx` — fixed amber bar at top (z-50), shows group name, Exit button

**Security notes:**
- Writes blocked at middleware level (403) during impersonation
- `navhub_impersonate_group` cookie is httpOnly (JS cannot read it)
- Cookie value is AES-256-GCM encrypted using `NAVHUB_ENCRYPTION_KEY`
- Dashboard layout decrypts and validates the cookie — invalid/expired cookies are silently ignored
- Exit impersonation (`DELETE /api/admin/impersonate`) is the only write allowed during impersonation

**Limitation:** API routes that check user membership via RLS (server client) may not return data for the impersonated group, since the super_admin doesn't have a `user_groups` row for that group. Impersonation currently shows the group name/palette but real data reads may be limited.

### AppShell `topOffset` prop
`components/layout/AppShell.tsx` accepts an optional `topOffset?: number` (default `0`). When set:
- Header `top` is offset by `topOffset` px
- Sidebar `top` is `56 + topOffset` px (56 = h-14)
- Body `paddingTop` is `56 + topOffset` px
Used by dashboard layout to push AppShell down when impersonation banner is active (36px = h-9).
