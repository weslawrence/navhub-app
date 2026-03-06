import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildXeroConsentUrl } from '@/lib/xero'
import type { EntityType } from '@/lib/types'

export async function GET(request: NextRequest) {
  const supabase = createClient()

  // ── Auth ──────────────────────────────────────────────────
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // ── Validate query params ─────────────────────────────────
  const { searchParams } = new URL(request.url)
  const entityType = searchParams.get('entity_type') as EntityType | null
  const entityId   = searchParams.get('entity_id')

  if (!entityType || !entityId || !['company', 'division'].includes(entityType)) {
    return NextResponse.json(
      { error: 'entity_type (company|division) and entity_id are required.' },
      { status: 400 }
    )
  }

  // ── Verify access to the entity ───────────────────────────
  if (entityType === 'company') {
    const { data } = await supabase
      .from('companies')
      .select('id')
      .eq('id', entityId)
      .single()

    if (!data) {
      return NextResponse.json({ error: 'Company not found or access denied.' }, { status: 404 })
    }
  } else {
    const { data } = await supabase
      .from('divisions')
      .select('id')
      .eq('id', entityId)
      .single()

    if (!data) {
      return NextResponse.json({ error: 'Division not found or access denied.' }, { status: 404 })
    }
  }

  // ── Encode entity context in OAuth state ──────────────────
  // State = base64(JSON({ entity_type, entity_id, user_id }))
  const statePayload = {
    entity_type: entityType,
    entity_id:   entityId,
    user_id:     session.user.id,
  }
  const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url')

  const consentUrl = buildXeroConsentUrl(state)
  return NextResponse.redirect(consentUrl)
}
