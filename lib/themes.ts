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
    id:        'ocean',
    name:      'Ocean',
    primary:   '#0ea5e9',   // sky-500
    secondary: '#0369a1',   // sky-700
    accent:    '#38bdf8',   // sky-400
    surface:   '#0c1a2e',   // dark navy sidebar bg
  },
  {
    id:        'forest',
    name:      'Forest',
    primary:   '#16a34a',   // green-600
    secondary: '#14532d',   // green-900
    accent:    '#4ade80',   // green-400
    surface:   '#0d1f14',   // dark green sidebar bg
  },
  {
    id:        'slate',
    name:      'Slate',
    primary:   '#6366f1',   // indigo-500
    secondary: '#3730a3',   // indigo-800
    accent:    '#a5b4fc',   // indigo-300
    surface:   '#13111e',   // dark indigo sidebar bg
  },
  {
    id:        'ember',
    name:      'Ember',
    primary:   '#f97316',   // orange-500
    secondary: '#9a3412',   // orange-800
    accent:    '#fdba74',   // orange-300
    surface:   '#1c0f06',   // dark ember sidebar bg
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
