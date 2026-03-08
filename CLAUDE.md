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
    agents/page.tsx         # AI Agents stub — "Coming Soon"
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
    settings/page.tsx       # Display prefs (number format, currency) + group colour (admin)
    reports/
      profit-loss/page.tsx  # P&L detail — period selector, summary/detail toggle, company columns
      balance-sheet/page.tsx # Balance Sheet detail — same layout + Net Assets highlight
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
    forecast/
      streams/route.ts      # GET (active streams by sort_order) | POST (admin only)
      streams/[id]/route.ts # PATCH (update fields) | DELETE (soft delete, admin only)
      state/route.ts        # GET (user state or defaults) | PATCH (upsert state)
    settings/route.ts       # GET (user prefs) | PATCH (upsert)
    groups/
      active/route.ts       # GET — active group + user role (used by settings page)
      [id]/route.ts         # PATCH — update group fields (palette_id; admin only)
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
  types.ts                  # TypeScript types for all DB entities + financial data
  utils.ts                  # cn(), formatCurrency(amount,format,currency), formatVariance(), period helpers, generateSlug()

supabase/
  migrations/
    001_initial_schema.sql  # All tables, enums, RLS, helper functions
    002_companies_divisions.sql  # ADD description, industry, is_active to companies + divisions
    003_user_settings.sql   # user_settings table with currency + number_format prefs (Phase 2b)
    004_group_palette.sql   # ADD palette_id to groups (Phase 2c)
    005_forecast.sql        # forecast_streams + forecast_user_state tables + RLS (Phase 2e)

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

## Phase Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Auth, AppShell, Xero OAuth, Excel upload, base schema |
| Phase 2a | ✅ Complete | Company + Division CRUD, Agents stub, migration 002 |
| Phase 2b | ✅ Complete | Dashboard 4-card layout, user settings, group colour, period navigation |
| Phase 2c | ✅ Complete | Palette system, sidebar polish, real Xero status, Excel UX, sync/all |
| Phase 2d | ✅ Complete | Financial report pages (P&L, Balance Sheet), Reports nav, ConnectXero UX, period-aware sync |
| Phase 2e | ✅ Complete | Revenue Forecast Model — streams, 7-year projection, sliders, share link, auto-save |
| Phase 3 | Planned | AI Agents (Claude API integration) — see docs/AI_Agent_Module_Build_Spec.md |

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
- Sub-items: Profit & Loss → `/reports/profit-loss`, Balance Sheet → `/reports/balance-sheet`
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

## Next Steps

1. Add multi-tenant user management page (invite users, assign roles/divisions)
2. Set up Supabase Storage bucket `excel-uploads` with appropriate policies
3. Add `error.tsx` files for each route segment
4. Build AI Agent module (see `docs/AI_Agent_Module_Build_Spec.md`)
5. Add cashflow report page at `/reports/cashflow`
6. Add chart visualisations to financial report pages (trend lines, bar charts)
