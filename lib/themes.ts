// ─── NavHub Palette System ────────────────────────────────────────────────────
//
// Each palette defines four CSS custom properties injected server-side
// via the dashboard layout. These drive all colour theming across the UI.
//
// CSS vars injected:
//   --palette-primary    → buttons, active states, links, Tailwind `primary`
//   --palette-secondary  → hover states on primary elements
//   --palette-accent     → icon accents, subtle highlights
//   --palette-surface    → sidebar background
//   --group-primary      → alias for --palette-primary (Tailwind compat)

export interface Palette {
  id:        string
  name:      string
  primary:   string   // main brand colour (hex)
  secondary: string   // deeper shade (hex)
  accent:    string   // lighter highlight (hex)
  surface:   string   // sidebar/dark surface background (hex)
}

export const PALETTES: Palette[] = [
  {
    id: 'navy',       name: 'Navy',
    primary: '#1B2A4A', secondary: '#0f1d35', accent: '#3b5998', surface: '#0d1520',
  },
  {
    id: 'ocean',      name: 'Ocean',
    primary: '#0ea5e9', secondary: '#0369a1', accent: '#38bdf8', surface: '#0c1a2e',
  },
  {
    id: 'sky',        name: 'Sky',
    primary: '#2563EB', secondary: '#1d4ed8', accent: '#60a5fa', surface: '#0f1e3d',
  },
  {
    id: 'teal',       name: 'Teal',
    primary: '#0D9488', secondary: '#0f766e', accent: '#2dd4bf', surface: '#0a1f1e',
  },
  {
    id: 'emerald',    name: 'Emerald',
    primary: '#059669', secondary: '#047857', accent: '#34d399', surface: '#0a1f14',
  },
  {
    id: 'forest',     name: 'Forest',
    primary: '#16a34a', secondary: '#14532d', accent: '#4ade80', surface: '#0d1f14',
  },
  {
    id: 'amber',      name: 'Amber',
    primary: '#D97706', secondary: '#b45309', accent: '#fcd34d', surface: '#1c1200',
  },
  {
    id: 'ember',      name: 'Ember',
    primary: '#f97316', secondary: '#9a3412', accent: '#fdba74', surface: '#1c0f06',
  },
  {
    id: 'rose',       name: 'Rose',
    primary: '#E11D48', secondary: '#be123c', accent: '#fb7185', surface: '#1c0610',
  },
  {
    id: 'purple',     name: 'Purple',
    primary: '#7C3AED', secondary: '#5b21b6', accent: '#a78bfa', surface: '#130d1f',
  },
  {
    id: 'slate',      name: 'Slate',
    primary: '#475569', secondary: '#334155', accent: '#94a3b8', surface: '#111827',
  },
  {
    id: 'charcoal',   name: 'Charcoal',
    primary: '#1F2937', secondary: '#111827', accent: '#6b7280', surface: '#0d1117',
  },
]

/** Resolve a palette by id, falling back to Ocean */
export function getPalette(id: string | null | undefined): Palette {
  return PALETTES.find(p => p.id === id) ?? PALETTES[0]
}

/**
 * Build the CSS :root block for a palette.
 * Sets palette vars AND --group-primary (Tailwind `primary` alias).
 */
export function buildPaletteCSS(palette: Palette): string {
  return [
    `:root {`,
    `  --palette-primary:   ${palette.primary};`,
    `  --palette-secondary: ${palette.secondary};`,
    `  --palette-accent:    ${palette.accent};`,
    `  --palette-surface:   ${palette.surface};`,
    `  --group-primary:     ${palette.primary};`,
    `}`,
  ].join('\n')
}
