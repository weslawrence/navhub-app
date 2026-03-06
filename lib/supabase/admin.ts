import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase Admin client — uses the SERVICE ROLE key, bypassing RLS.
 *
 * ⚠️  Only import this in server-side code (API Route Handlers or
 *     Server Components). NEVER expose it to the browser.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      '[navhub] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
        'Add them to .env.local and restart the dev server.'
    )
  }

  return createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession:   false,
    },
  })
}
