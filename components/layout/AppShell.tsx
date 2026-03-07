'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  LayoutDashboard,
  Building2,
  Plug,
  Bot,
  Settings,
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { signOut } from '@/app/(auth)/actions'
import GroupSwitcher from './GroupSwitcher'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { getPalette } from '@/lib/themes'
import type { Group, UserGroup } from '@/lib/types'

// ============================================================
// Nav items — Dashboard · Companies · Integrations · Agents · Settings
// ============================================================

const NAV_ITEMS = [
  { label: 'Dashboard',    href: '/dashboard',    Icon: LayoutDashboard },
  { label: 'Companies',    href: '/companies',    Icon: Building2 },
  { label: 'Integrations', href: '/integrations', Icon: Plug },
  { label: 'Agents',       href: '/agents',       Icon: Bot },
  { label: 'Settings',     href: '/settings',     Icon: Settings },
] as const

// ============================================================
// Props
// ============================================================

interface AppShellProps {
  children:    React.ReactNode
  user:        { id: string; email: string }
  groups:      UserGroup[]
  activeGroup: Group
}

// ============================================================
// Component
// ============================================================

export default function AppShell({ children, user, groups, activeGroup }: AppShellProps) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()

  // Sidebar collapse state — persisted in localStorage
  const [collapsed,  setCollapsed]  = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mounted,    setMounted]    = useState(false)

  // Apply full palette CSS vars on mount / group change
  useEffect(() => {
    const palette = getPalette(activeGroup.palette_id)
    document.documentElement.style.setProperty('--palette-primary',   palette.primary)
    document.documentElement.style.setProperty('--palette-secondary', palette.secondary)
    document.documentElement.style.setProperty('--palette-accent',    palette.accent)
    document.documentElement.style.setProperty('--palette-surface',   palette.surface)
    document.documentElement.style.setProperty('--group-primary',     palette.primary)
  }, [activeGroup.palette_id])

  // Load sidebar state from localStorage after mount (avoids hydration mismatch)
  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem('navhub-sidebar')
    if (saved === 'collapsed') setCollapsed(true)
  }, [])

  function toggleSidebar() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('navhub-sidebar', next ? 'collapsed' : 'expanded')
  }

  const userInitials = user.email.slice(0, 2).toUpperCase()

  // ────────────────────────────────────────────────────────
  // Sidebar
  // ────────────────────────────────────────────────────────

  function Sidebar({ mobile = false }: { mobile?: boolean }) {
    return (
      <TooltipProvider delayDuration={0}>
        <aside
          className={cn(
            'flex flex-col border-r border-white/10 transition-all duration-200',
            mobile
              ? 'fixed inset-y-0 left-0 z-50 w-64 shadow-xl'
              : cn(
                  'hidden lg:flex sticky top-14 h-[calc(100vh-3.5rem)]',
                  collapsed ? 'w-16' : 'w-56'
                )
          )}
          style={{ backgroundColor: 'var(--palette-surface)' }}
        >
          <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
            {NAV_ITEMS.map(({ label, href, Icon }) => {
              const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
              return (
                <Tooltip key={href}>
                  <TooltipTrigger asChild>
                    <Link
                      href={href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-white/10 text-white'
                          : 'text-white/60 hover:text-white hover:bg-white/10',
                        collapsed && !mobile ? 'justify-center' : ''
                      )}
                      style={
                        active
                          ? { borderLeft: '3px solid var(--palette-primary)', paddingLeft: '5px' }
                          : { borderLeft: '3px solid transparent', paddingLeft: '5px' }
                      }
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      {(!collapsed || mobile) && <span>{label}</span>}
                    </Link>
                  </TooltipTrigger>
                  {collapsed && !mobile && (
                    <TooltipContent side="right">{label}</TooltipContent>
                  )}
                </Tooltip>
              )
            })}
          </nav>

          {/* Collapse toggle — desktop only */}
          {!mobile && mounted && (
            <div className="border-t border-white/10 p-2">
              <button
                onClick={toggleSidebar}
                className="flex w-full items-center justify-center gap-2 rounded-md px-2 py-1.5 text-xs text-white/50 hover:bg-white/10 hover:text-white/80 transition-colors"
              >
                {collapsed
                  ? <ChevronRight className="h-4 w-4" />
                  : <><ChevronLeft className="h-4 w-4" /><span>Collapse</span></>}
              </button>
            </div>
          )}
        </aside>
      </TooltipProvider>
    )
  }

  // ────────────────────────────────────────────────────────
  // Top bar + layout
  // ────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Top bar ── */}
      <header
        className="fixed top-0 inset-x-0 z-40 h-14 bg-background/95 backdrop-blur flex items-center gap-3 px-4"
        style={{ borderBottom: '2px solid var(--palette-primary)' }}
      >
        {/* Mobile sidebar toggle */}
        <button
          className="lg:hidden text-muted-foreground hover:text-foreground"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {/* Desktop sidebar toggle */}
        <button
          className="hidden lg:block text-muted-foreground hover:text-foreground"
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Wordmark */}
        <Link href="/dashboard" className="font-bold text-lg tracking-tight mr-2">
          Nav<span style={{ color: 'var(--palette-primary)' }}>Hub</span>
        </Link>

        <div className="flex-1" />

        {/* Right side: GroupSwitcher + theme toggle + user menu */}
        <div className="flex items-center gap-2">
          {groups.length > 0 && (
            <GroupSwitcher groups={groups} activeGroup={activeGroup} />
          )}

          {/* Theme toggle */}
          {mounted && (
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          )}

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="focus:outline-none">
              <Avatar className="h-8 w-8 cursor-pointer">
                <AvatarFallback
                  className="text-xs text-white font-semibold"
                  style={{ backgroundColor: 'var(--palette-primary)' }}
                >
                  {userInitials}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="font-normal">
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={async () => { await signOut() }}
                className="text-destructive focus:text-destructive cursor-pointer"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 pt-14">
        {/* Desktop sidebar */}
        <Sidebar />

        {/* Mobile sidebar overlay */}
        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <Sidebar mobile />
          </>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
