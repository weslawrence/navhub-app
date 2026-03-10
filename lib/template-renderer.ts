// ============================================================
// Phase 5a — Report Template Renderer
// ============================================================
// Server-side only — do not import from client components

import type { ReportTemplate, SlotDefinition } from '@/lib/types'

// ─── Slot rendering ───────────────────────────────────────────────────────────

/**
 * Replace all {{slot_name}} placeholders in a scaffold string with values
 * from slotData. Placeholders that don't have a matching key in slotData
 * are left as empty strings.
 *
 * If the slot value is an object/array, it is JSON-serialised.
 */
export function renderSlots(
  scaffold: string,
  slotData: Record<string, unknown>
): string {
  return scaffold.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    if (!(key in slotData)) return ''
    const val = slotData[key]
    if (typeof val === 'string') return val
    if (val === null || val === undefined) return ''
    return JSON.stringify(val)
  })
}

// ─── Token rendering ──────────────────────────────────────────────────────────

/**
 * Replace all {{token_name}} placeholders in a CSS string with values
 * from the design_tokens map.
 *
 * Tokens are matched by their name (hyphens allowed), e.g. {{col-axis}} → #34d399.
 */
export function renderTokens(
  css:    string,
  tokens: Record<string, string>
): string {
  return css.replace(/\{\{([\w-]+)\}\}/g, (match, key: string) => {
    return tokens[key] ?? match   // leave unknown tokens unchanged
  })
}

// ─── Combined renderer ────────────────────────────────────────────────────────

/**
 * Render a ReportTemplate with the given slot data into a single
 * self-contained HTML string (inline style + script).
 *
 * Order of operations:
 * 1. renderTokens on scaffold_css  (replace design token placeholders)
 * 2. renderSlots  on scaffold_html (replace slot value placeholders)
 * 3. Assemble: <html><head><style>…</style></head><body>…<script>…</script></body></html>
 */
export function renderTemplate(
  template: ReportTemplate,
  slotData: Record<string, unknown>
): string {
  const css  = template.scaffold_css
    ? renderTokens(template.scaffold_css, template.design_tokens)
    : ''

  const body = template.scaffold_html
    ? renderSlots(template.scaffold_html, slotData)
    : '<p style="font-family:sans-serif;padding:2rem;">No scaffold defined for this template.</p>'

  const js   = template.scaffold_js ?? ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(template.name)}</title>
  ${css ? `<style>\n${css}\n</style>` : ''}
</head>
<body>
${body}
${js ? `<script>\n${js}\n</script>` : ''}
</body>
</html>`
}

// ─── Slot validation ──────────────────────────────────────────────────────────

export interface SlotValidationResult {
  valid:   boolean
  missing: string[]   // names of required slots with no value in slotData
}

/**
 * Validate that all required slots have been filled.
 * Slots with data_source !== 'manual' are skipped (they are auto-filled).
 */
export function validateSlots(
  slots:    SlotDefinition[],
  slotData: Record<string, unknown>
): SlotValidationResult {
  const missing: string[] = []

  for (const slot of slots) {
    if (!slot.required) continue
    // Non-manual slots are auto-filled by NavHub or agents — skip validation
    if (slot.data_source !== 'manual') continue
    const val = slotData[slot.name]
    if (val === undefined || val === null || val === '') {
      missing.push(slot.name)
    }
  }

  return { valid: missing.length === 0, missing }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
