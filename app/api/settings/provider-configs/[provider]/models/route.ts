import { NextResponse }     from 'next/server'
import { cookies }           from 'next/headers'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt }           from '@/lib/encryption'

/**
 * GET /api/settings/provider-configs/[provider]/models
 * Returns the list of usable models for the configured provider.
 *
 * Anthropic returns a hardcoded list (no public models endpoint).
 * OpenAI / Google / Mistral query the provider API live using the stored key.
 */

export const runtime = 'nodejs'

interface ModelOption { id: string; label: string }

const ANTHROPIC_MODELS: ModelOption[] = [
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku (Fast)'   },
  { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet (Smart)' },
  { id: 'claude-opus-4-6',           label: 'Claude Opus (Best)'    },
]

export async function GET(_req: Request, { params }: { params: { provider: string } }) {
  const supabase     = createClient()
  const cookieStore  = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  const { data: { session } } = await supabase.auth.getSession()
  if (!session)       return NextResponse.json({ error: 'Unauthorized' },    { status: 401 })
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const admin = createAdminClient()
  const { data: cfg } = await admin
    .from('group_provider_configs')
    .select('api_key_encrypted, base_url')
    .eq('group_id', activeGroupId)
    .eq('provider', params.provider)
    .eq('is_active', true)
    .maybeSingle()

  if (!cfg) return NextResponse.json({ error: 'Provider not configured' }, { status: 404 })

  let apiKey: string
  try { apiKey = decrypt(cfg.api_key_encrypted) }
  catch { return NextResponse.json({ error: 'Stored key could not be decrypted' }, { status: 500 }) }

  try {
    switch (params.provider) {
      case 'anthropic':
        return NextResponse.json({ data: ANTHROPIC_MODELS })

      case 'openai': {
        const baseUrl = (cfg.base_url as string | null)?.replace(/\/+$/, '') ?? 'https://api.openai.com/v1'
        const res = await fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        })
        if (!res.ok) return NextResponse.json({ data: [] })
        const json = await res.json() as { data?: Array<{ id: string }> }
        const models = (json.data ?? [])
          .filter(m => m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3'))
          .sort((a, b) => a.id.localeCompare(b.id))
          .map(m => ({ id: m.id, label: m.id }))
        return NextResponse.json({ data: models })
      }

      case 'google': {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        )
        if (!res.ok) return NextResponse.json({ data: [] })
        const json = await res.json() as { models?: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }> }
        const models = (json.models ?? [])
          .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
          .map(m => ({
            id:    m.name.replace('models/', ''),
            label: m.displayName ?? m.name.replace('models/', ''),
          }))
        return NextResponse.json({ data: models })
      }

      case 'mistral': {
        const res = await fetch('https://api.mistral.ai/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        })
        if (!res.ok) return NextResponse.json({ data: [] })
        const json = await res.json() as { data?: Array<{ id: string }> }
        const models = (json.data ?? []).map(m => ({ id: m.id, label: m.id }))
        return NextResponse.json({ data: models })
      }

      case 'custom': {
        const baseUrl = (cfg.base_url as string | null)?.replace(/\/+$/, '')
        if (!baseUrl) return NextResponse.json({ data: [] })
        const res = await fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        })
        if (!res.ok) return NextResponse.json({ data: [] })
        const json = await res.json() as { data?: Array<{ id: string }> }
        const models = (json.data ?? []).map(m => ({ id: m.id, label: m.id }))
        return NextResponse.json({ data: models })
      }

      default:
        return NextResponse.json({ data: [] })
    }
  } catch {
    return NextResponse.json({ data: [] })
  }
}
