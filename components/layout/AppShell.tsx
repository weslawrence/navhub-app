'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  LayoutDashboard,
  Settings,
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
  ChevronLeft,
  ChevronRight,
  BarChart2,
  ChevronDown,
  TrendingUp,
  Bot,
  Plus,
  Banknote,
  FileText,
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
import CreateGroupModal from '@/components/groups/CreateGroupModal'

// ============================================================
// Nav structure
// ============================================================

const REPORT_CHILDREN = [
  { label: 'Profit & Loss',   href: '/reports/profit-loss'  },
  { label: 'Balance Sheet',   href: '/reports/balance-sheet' },
  { label: 'Templates',       href: '/reports/templates'     },
  { label: 'Reports Library', href: '/reports/custom'        },
]

const FORECAST_CHILDREN_BASE = [
  { label: 'Revenue Model', href: '/forecasting/revenue', adminOnly: false },
  { label: 'Stream Setup',  href: '/forecasting/setup',   adminOnly: true  },
]

const CASHFLOW_CHILDREN = [
  { label: 'Overview', href: '/cashflow' },
]

const TOP_NAV = [
  { label: 'Dashboard', href: '/dashboard', Icon: LayoutDashboard },
] as const

const BOTTOM_NAV = [
  { label: 'Agents',   href: '/agents',   Icon: Bot      },
  { label: 'Settings', href: '/settings', Icon: Settings  },
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

  const [collapsed,     setCollapsed]     = useState(false)
  const [mobileOpen,    setMobileOpen]    = useState(false)
  const [mounted,       setMounted]       = useState(false)
  const [reportsOpen,   setReportsOpen]   = useState(() => pathname.startsWith('/reports'))
  const [forecastOpen,  setForecastOpen]  = useState(() => pathname.startsWith('/forecasting'))
  const [cashflowOpen,  setCashflowOpen]  = useState(() => pathname.startsWith('/cashflow'))
  const [showCreateGrp, setShowCreateGrp] = useState(false)
  const documentsActive = pathname.startsWith('/documents')

  // Derive admin status from active group membership
  const activeRole = groups.find(g => g.group_id === activeGroup.id)?.role
  const isAdmin    = activeRole === 'super_admin' || activeRole === 'group_admin'
  const isSuperAdmin = activeRole === 'super_admin'

  // Apply full palette CSS vars on mount / group change
  useEffect(() => {
    const palette = getPalette(activeGroup.palette_id)
    document.documentElement.style.setProperty('--palette-primary',   palette.primary)
    document.documentElement.style.setProperty('--palette-secondary', palette.secondary)
    document.documentElement.style.setProperty('--palette-accent',    palette.accent)
    document.documentElement.style.setProperty('--palette-surface',   palette.surface)
    document.documentElement.style.setProperty('--group-primary',     palette.primary)
  }, [activeGroup.palette_id])

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem('navhub-sidebar')
    if (saved === 'collapsed') setCollapsed(true)
  }, [])

  useEffect(() => {
    if (pathname.startsWith('/reports'))     setReportsOpen(true)
    if (pathname.startsWith('/forecasting')) setForecastOpen(true)
    if (pathname.startsWith('/cashflow'))    setCashflowOpen(true)
  }, [pathname])

  function toggleSidebar() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('navhub-sidebar', next ? 'collapsed' : 'expanded')
  }

  const userInitials    = user.email.slice(0, 2).toUpperCase()
  const reportsActive   = pathname.startsWith('/reports')
  const forecastActive  = pathname.startsWith('/forecasting')
  const cashflowActive  = pathname.startsWith('/cashflow')

  // ────────────────────────────────────────────────────────
  // Sidebar
  // ────────────────────────────────────────────────────────

  function NavLink({
    href, label, Icon, mobile = false,
  }: { href: string; label: string; Icon: React.ComponentType<{ className?: string }>; mobile?: boolean }) {
    const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              'flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-white/10 text-white'
                : 'text-white/60 hover:text-white hover:bg-white/10',
              collapsed && !mobile ? 'justify-center px-2' : 'px-2'
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
  }

  function ReportsGroup({ mobile = false }: { mobile?: boolean }) {
    const expanded = !collapsed || mobile
    return (
      <div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => {
                if (collapsed && !mobile) {
                  toggleSidebar()
                  setReportsOpen(true)
                } else {
                  setReportsOpen(o => !o)
                }
              }}
              className={cn(
                'w-full flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors',
                reportsActive
                  ? 'text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/10',
                collapsed && !mobile ? 'justify-center px-2' : 'px-2'
              )}
              style={{
                borderLeft:  reportsActive ? '3px solid var(--palette-primary)' : '3px solid transparent',
                paddingLeft: '5px',
              }}
            >
              <BarChart2 className="h-5 w-5 shrink-0" />
              {expanded && (
                <>
                  <span className="flex-1 text-left">Reports</span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 text-white/40 transition-transform duration-150',
                      reportsOpen && 'rotate-180'
                    )}
                  />
                </>
              )}
            </button>
          </TooltipTrigger>
          {collapsed && !mobile && <TooltipContent side="right">Reports</TooltipContent>}
        </Tooltip>

        {reportsOpen && expanded && (
          <div className="mt-0.5 ml-4 space-y-0.5">
            {REPORT_CHILDREN.map(child => {
              const active = pathname === child.href
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                    active ? 'text-white bg-white/10' : 'text-white/50 hover:text-white hover:bg-white/10'
                  )}
                  style={
                    active
                      ? { borderLeft: '2px solid var(--palette-accent)' }
                      : { borderLeft: '2px solid transparent' }
                  }
                >
                  {child.label}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  function ForecastGroup({ mobile = false }: { mobile?: boolean }) {
    const expanded       = !collapsed || mobile
    const forecastChildren = FORECAST_CHILDREN_BASE.filter(c => !c.adminOnly || isAdmin)
    return (
      <div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => {
                if (collapsed && !mobile) {
                  toggleSidebar()
                  setForecastOpen(true)
                } else {
                  setForecastOpen(o => !o)
                }
              }}
              className={cn(
                'w-full flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors',
                forecastActive
                  ? 'text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/10',
                collapsed && !mobile ? 'justify-center px-2' : 'px-2'
              )}
              style={{
                borderLeft:  forecastActive ? '3px solid var(--palette-primary)' : '3px solid transparent',
                paddingLeft: '5px',
              }}
            >
              <TrendingUp className="h-5 w-5 shrink-0" />
              {expanded && (
                <>
                  <span className="flex-1 text-left">Forecasting</span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 text-white/40 transition-transform duration-150',
                      forecastOpen && 'rotate-180'
                    )}
                  />
                </>
              )}
            </button>
          </TooltipTrigger>
          {collapsed && !mobile && <TooltipContent side="right">Forecasting</TooltipContent>}
        </Tooltip>

        {forecastOpen && expanded && (
          <div className="mt-0.5 ml-4 space-y-0.5">
            {forecastChildren.map(child => {
              const active = pathname === child.href || pathname.startsWith(child.href)
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                    active ? 'text-white bg-white/10' : 'text-white/50 hover:text-white hover:bg-white/10'
                  )}
                  style={
                    active
                      ? { borderLeft: '2px solid var(--palette-accent)' }
                      : { borderLeft: '2px solid transparent' }
                  }
                >
                  {child.label}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  function CashflowGroup({ mobile = false }: { mobile?: boolean }) {
    const expanded = !collapsed || mobile
    return (
      <div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => {
                if (collapsed && !mobile) {
                  toggleSidebar()
                  setCashflowOpen(true)
                } else {
                  setCashflowOpen(o => !o)
                }
              }}
              className={cn(
                'w-full flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors',
                cashflowActive
                  ? 'text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/10',
                collapsed && !mobile ? 'justify-center px-2' : 'px-2'
              )}
              style={{
                borderLeft:  cashflowActive ? '3px solid var(--palette-primary)' : '3px solid transparent',
                paddingLeft: '5px',
              }}
            >
              <Banknote className="h-5 w-5 shrink-0" />
              {expanded && (
                <>
                  <span className="flex-1 text-left">Cash Flow</span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 text-white/40 transition-transform duration-150',
                      cashflowOpen && 'rotate-180'
                    )}
                  />
                </>
              )}
            </button>
          </TooltipTrigger>
          {collapsed && !mobile && <TooltipContent side="right">Cash Flow</TooltipContent>}
        </Tooltip>

        {cashflowOpen && expanded && (
          <div className="mt-0.5 ml-4 space-y-0.5">
            {CASHFLOW_CHILDREN.map(child => {
              const active = pathname === child.href || pathname.startsWith('/cashflow/')
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                    active ? 'text-white bg-white/10' : 'text-white/50 hover:text-white hover:bg-white/10'
                  )}
                  style={
                    active
                      ? { borderLeft: '2px solid var(--palette-accent)' }
                      : { borderLeft: '2px solid transparent' }
                  }
                >
                  {child.label}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

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
            {TOP_NAV.map(item => (
              <NavLink key={item.href} {...item} mobile={mobile} />
            ))}
            <ReportsGroup   mobile={mobile} />
            {/* Documents — flat nav item */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/documents"
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors',
                    documentsActive
                      ? 'bg-white/10 text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/10',
                    collapsed && !mobile ? 'justify-center px-2' : 'px-2'
                  )}
                  style={
                    documentsActive
                      ? { borderLeft: '3px solid var(--palette-primary)', paddingLeft: '5px' }
                      : { borderLeft: '3px solid transparent', paddingLeft: '5px' }
                  }
                >
                  <FileText className="h-5 w-5 shrink-0" />
                  {(!collapsed || mobile) && <span>Documents</span>}
                </Link>
              </TooltipTrigger>
              {collapsed && !mobile && <TooltipContent side="right">Documents</TooltipContent>}
            </Tooltip>
            <CashflowGroup  mobile={mobile} />
            <ForecastGroup  mobile={mobile} />
            {BOTTOM_NAV.map(item => (
              <NavLink key={item.href} {...item} mobile={mobile} />
            ))}
          </nav>

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
        <button
          className="lg:hidden text-muted-foreground hover:text-foreground"
          onClick={() => setMobileOpen(o => !o)}
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <button
          className="hidden lg:block text-muted-foreground hover:text-foreground"
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        <Link href="/dashboard" className="font-bold text-lg tracking-tight mr-2">
          Nav<span style={{ color: 'var(--palette-primary)' }}>Hub</span>
        </Link>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {groups.length > 0 && (
            <GroupSwitcher groups={groups} activeGroup={activeGroup} />
          )}

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
                  className="text-xs font-semibold"
                  style={{ backgroundColor: 'var(--palette-primary)', color: '#ffffff' }}
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

              {/* Create Group — super_admin only */}
              {isSuperAdmin && (
                <>
                  <DropdownMenuItem
                    onSelect={() => setShowCreateGrp(true)}
                    className="cursor-pointer text-foreground"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create Group
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}

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

      {/* Create Group Modal */}
      {showCreateGrp && (
        <CreateGroupModal onClose={() => setShowCreateGrp(false)} />
      )}

      {/* ── Body ── */}
      <div className="flex flex-1 pt-14">
        <Sidebar />

        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <Sidebar mobile />
          </>
        )}

        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
