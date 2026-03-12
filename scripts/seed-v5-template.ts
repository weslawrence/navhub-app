/**
 * scripts/seed-v5-template.ts
 *
 * Check-and-patch utility for the Role & Task Matrix V5 template.
 * Import this from app/api/dev/seed-v5-template/route.ts to invoke it.
 *
 * The function accepts the admin Supabase client as a parameter (dependency
 * injection) so it can run inside any Next.js server context without needing
 * to resolve @/ path aliases.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Required field lists ─────────────────────────────────────────────────────

export const REQUIRED_SLOT_NAMES = [
  'matrix_title',
  'organisation_name',
  'version_label',
  'entity_definitions',
  'column_definitions',
  'section_definitions',
  'role_data',
  'headcount_summary',
] as const

export type RequiredSlotName = (typeof REQUIRED_SLOT_NAMES)[number]

export const REQUIRED_TOKEN_KEYS = [
  'col-axis',
  'col-proj',
  'col-obs',
  'col-dev',
  'col-data',
  'col-forge',
  'col-mkt-ax',
  'col-mkt-gr',
  'bg-dark',
  'bg-card',
] as const

export type RequiredTokenKey = (typeof REQUIRED_TOKEN_KEYS)[number]

// ─── Result type ──────────────────────────────────────────────────────────────

export interface V5SeedResult {
  templateFound:   boolean
  templateId:      string | null
  templateName:    string | null
  scaffoldPresent: boolean
  slotsOk:         boolean
  missingSlots:    string[]
  tokensOk:        boolean
  missingTokens:   string[]
  wasPatched:      boolean
  patchedFields:   string[]
  log:             string[]
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Check the V5 template for the given group and optionally patch missing scaffold.
 *
 * @param admin        Supabase admin client (service role)
 * @param groupId      Active group UUID
 * @param scaffoldHtml Optional: pass scaffold HTML to patch if scaffold_html is empty
 * @param scaffoldCss  Optional: pass scaffold CSS to patch if scaffold_css is empty
 * @param scaffoldJs   Optional: pass scaffold JS  to patch if scaffold_js  is empty
 */
export async function checkAndPatchV5Template(
  admin:        SupabaseClient,
  groupId:      string,
  scaffoldHtml?: string,
  scaffoldCss?:  string,
  scaffoldJs?:   string,
): Promise<V5SeedResult> {
  const log: string[] = []

  // ── 1. Look for the template by name ────────────────────────────────────────
  const { data: existing, error: fetchError } = await admin
    .from('report_templates')
    .select('id, name, scaffold_html, scaffold_css, scaffold_js, slots, design_tokens')
    .eq('group_id', groupId)
    .eq('name', 'Role & Task Matrix')
    .eq('is_active', true)
    .maybeSingle()

  if (fetchError) {
    log.push(`DB error: ${fetchError.message}`)
  }

  if (!existing) {
    log.push('Template "Role & Task Matrix" not found for this group.')
    log.push('→ Run POST /api/report-templates/seed to create it first.')
    return {
      templateFound:   false,
      templateId:      null,
      templateName:    null,
      scaffoldPresent: false,
      slotsOk:         false,
      missingSlots:    [...REQUIRED_SLOT_NAMES],
      tokensOk:        false,
      missingTokens:   [...REQUIRED_TOKEN_KEYS],
      wasPatched:      false,
      patchedFields:   [],
      log,
    }
  }

  log.push(`Found template "${existing.name}" (${existing.id as string})`)

  // ── 2. Verify slots ──────────────────────────────────────────────────────────
  const slotNames   = ((existing.slots as Array<{ name: string }>) ?? []).map(s => s.name)
  const missingSlots = REQUIRED_SLOT_NAMES.filter(s => !slotNames.includes(s))
  const slotsOk      = missingSlots.length === 0

  if (slotsOk) {
    log.push(`Slots: all ${REQUIRED_SLOT_NAMES.length} required slots present (${slotNames.length} total)`)
  } else {
    log.push(`Slots: MISSING — ${missingSlots.join(', ')}`)
  }

  // ── 3. Verify design tokens ──────────────────────────────────────────────────
  const tokenKeys    = Object.keys((existing.design_tokens as Record<string, string>) ?? {})
  const missingTokens = REQUIRED_TOKEN_KEYS.filter(k => !tokenKeys.includes(k))
  const tokensOk      = missingTokens.length === 0

  if (tokensOk) {
    log.push(`Tokens: all ${REQUIRED_TOKEN_KEYS.length} entity tokens present (${tokenKeys.length} total)`)
  } else {
    log.push(`Tokens: MISSING — ${missingTokens.join(', ')}`)
  }

  // ── 4. Patch scaffold if empty and caller provided one ───────────────────────
  const patchedFields: string[] = []
  const needsHtml = !existing.scaffold_html && !!scaffoldHtml
  const needsCss  = !existing.scaffold_css  && !!scaffoldCss
  const needsJs   = !existing.scaffold_js   && !!scaffoldJs

  if (needsHtml || needsCss || needsJs) {
    const updates: Record<string, string | null> = {
      updated_at: new Date().toISOString(),
    }
    if (needsHtml && scaffoldHtml) { updates.scaffold_html = scaffoldHtml; patchedFields.push('scaffold_html') }
    if (needsCss  && scaffoldCss)  { updates.scaffold_css  = scaffoldCss;  patchedFields.push('scaffold_css')  }
    if (needsJs   && scaffoldJs)   { updates.scaffold_js   = scaffoldJs;   patchedFields.push('scaffold_js')   }

    const { error: patchError } = await admin
      .from('report_templates')
      .update(updates)
      .eq('id', existing.id as string)

    if (patchError) {
      log.push(`Patch error: ${patchError.message}`)
    } else {
      log.push(`Patched: ${patchedFields.join(', ')} ✓`)
    }
  } else if (!existing.scaffold_html) {
    log.push('scaffold_html: EMPTY — no scaffold provided; run POST /api/report-templates/seed to restore')
  } else {
    log.push(`scaffold_html: present (${(existing.scaffold_html as string).length.toLocaleString()} chars)`)
  }

  const scaffoldNowPresent =
    !!(existing.scaffold_html) || patchedFields.includes('scaffold_html')

  return {
    templateFound:   true,
    templateId:      existing.id as string,
    templateName:    existing.name as string,
    scaffoldPresent: scaffoldNowPresent,
    slotsOk,
    missingSlots,
    tokensOk,
    missingTokens,
    wasPatched:      patchedFields.length > 0,
    patchedFields,
    log,
  }
}
