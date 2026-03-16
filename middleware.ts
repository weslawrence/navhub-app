import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest }          from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // Refresh session — critical for SSR cookie sync
  const { data: { session } } = await supabase.auth.getSession()
  const { pathname } = request.nextUrl

  // Public routes — no auth required
  const isPublic =
    pathname === '/login'                       ||
    pathname.startsWith('/api/cron/')           ||
    pathname.startsWith('/api/auth')            ||
    pathname.startsWith('/_next')              ||
    // Standalone report viewer — allows token-based unauthenticated access
    pathname.startsWith('/view/report/')        ||
    // Standalone document viewer — allows token-based unauthenticated access
    pathname.startsWith('/view/document/')      ||
    // Public file endpoint — serves shared reports via token
    pathname.startsWith('/api/reports/public/')

  if (isPublic) {
    // Redirect authenticated users away from login
    if (pathname === '/login' && session) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return response
  }

  // Unauthenticated → /login
  if (!session) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  // ── Admin route protection ────────────────────────────────────────────────────
  // /admin/** pages and /api/admin/** routes require super_admin role.
  const isAdminRoute =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api/admin/')

  if (isAdminRoute) {
    const { data: adminCheck } = await supabase
      .from('user_groups')
      .select('role')
      .eq('user_id', session.user.id)
      .eq('role', 'super_admin')
      .limit(1)

    if (!adminCheck || adminCheck.length === 0) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  // ── Impersonation write-block ─────────────────────────────────────────────────
  // During impersonation, block all mutating API calls except:
  //   DELETE /api/admin/impersonate  (exit impersonation)
  const impersonateCookie = request.cookies.get('navhub_impersonate_group')?.value
  const method = request.method.toUpperCase()

  if (
    impersonateCookie &&
    ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) &&
    pathname.startsWith('/api/')
  ) {
    // Always allow exiting impersonation
    if (pathname === '/api/admin/impersonate' && method === 'DELETE') {
      return response
    }

    return NextResponse.json(
      { error: 'Writes are disabled while impersonating a group. Exit impersonation first.' },
      { status: 403 }
    )
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
