import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { toast, Toaster } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Download,
  FileCheck2,
  FileClock,
  FileText,
  Filter,
  Gauge,
  LayoutDashboard,
  ListFilter,
  LogOut,
  Menu,
  MonitorCog,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Wifi,
  X,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { LucideIcon } from 'lucide-react'
import type { ServiceHealth, Status, Submission, SubmissionStatus } from '@/types/domain'
import { apiMode } from '@/lib/api/client'
import { useDeviceHealthQuery } from '@/features/api/queries'
import { refreshIntervalMs } from '@/lib/config'
import { useAuth } from '@/lib/auth/AuthProvider'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { NotificationCenter } from '@/components/layout/NotificationCenter'
import { DemoDataProvider, useDemoData, type DemoData } from '@/mocks/demo-data-context'
import type { GlobalDateRange } from '@/types/dashboard'
import {
  ApiDevice,
  ApiFiscalization,
  ApiMonitoring,
  ApiOverview,
  ApiSettings,
  ApiWriteback,
} from '@/features/api/ApiOperationalPages'

const nav: { label: string; path: string; icon: LucideIcon }[] = [
  { label: 'Overview', path: '/overview', icon: LayoutDashboard },
  { label: 'Fiscalization', path: '/fiscalization', icon: FileCheck2 },
  { label: 'G03 Device', path: '/device', icon: MonitorCog },
  { label: 'Writeback', path: '/writeback', icon: RefreshCw },
  { label: 'Monitoring', path: '/monitoring', icon: Activity },
]
const routeNames: Record<string, string> = {
  '/overview': 'Overview',
  '/fiscalization': 'Fiscalization',
  '/device': 'G03 Device',
  '/writeback': 'Zoho writeback',
  '/monitoring': 'Monitoring',
  '/settings': 'Settings',
}
const todayLabel = new Intl.DateTimeFormat('en-KE', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})
  .format(new Date())
  .toUpperCase()
const DashboardRangeContext = createContext<GlobalDateRange>('24h')
function useDashboardRange() {
  return useContext(DashboardRangeContext)
}
function inGlobalRange(value: string, range: GlobalDateRange) {
  const age = Date.now() - new Date(value).getTime()
  return (
    age >= 0 && age <= (range === '24h' ? 86_400_000 : range === '7d' ? 604_800_000 : 2_592_000_000)
  )
}
const shortDate = (value: string) =>
  new Intl.DateTimeFormat('en-KE', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
const money = (value: number, currency: string) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency, maximumFractionDigits: 0 }).format(
    value,
  )
const relative = (value: string) => {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000))
  return mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`
}
function exportSubmissions(rows: Submission[]) {
  const columns: (keyof Submission)[] = [
    'documentNumber',
    'documentId',
    'customer',
    'amount',
    'currency',
    'type',
    'status',
    'attempts',
    'cuReceiptNumber',
    'etimsReceiptNumber',
    'writeback',
    'error',
    'writebackError',
    'createdAt',
    'updatedAt',
  ]
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = [
    columns.join(','),
    ...rows.map((row) => columns.map((key) => escape(row[key])).join(',')),
  ].join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `zoho-amarco-demo-${new Date().toISOString().slice(0, 10)}.csv`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
const statusCopy: Record<SubmissionStatus, string> = {
  fiscalized: 'Fiscalized',
  pending: 'Pending',
  processing: 'Processing',
  failed: 'Failed',
  manual_review: 'Manual review',
  outcome_unknown: 'Outcome unknown',
}
function Badge({
  status,
  children,
}: {
  status: Status | SubmissionStatus | 'complete' | 'failed' | 'pending' | 'unknown' | 'not_required'
  children?: ReactNode
}) {
  const tone =
    status === 'healthy' || status === 'fiscalized' || status === 'complete'
      ? 'good'
      : status === 'warning' || status === 'manual_review' || status === 'outcome_unknown'
        ? 'warn'
        : status === 'error' || status === 'failed'
          ? 'bad'
          : status === 'processing'
            ? 'info'
            : 'neutral'
  const title =
    children ??
    (status in statusCopy ? statusCopy[status as SubmissionStatus] : status.replaceAll('_', ' '))
  return (
    <span className={`badge ${tone}`}>
      <i />
      {title}
    </span>
  )
}

function Shell() {
  const loc = useLocation()
  const navigate = useNavigate()
  const auth = useAuth()
  const demoData = useDemoData()
  const queryClient = useQueryClient()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [refreshed, setRefreshed] = useState(new Date())
  const [globalRange, setGlobalRange] = useState<GlobalDateRange>('24h')
  const avatarLabel =
    auth.user?.name
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join('') ?? 'OP'
  const title = routeNames[loc.pathname] ?? 'Overview'
  const refresh = () => {
    if (apiMode === 'mock') {
      toast.info('Demo snapshot is local and static; no live API request was made.')
      return
    }
    void queryClient.invalidateQueries({ refetchType: 'active' }).then(() => {
      const hasActiveError = queryClient
        .getQueryCache()
        .getAll()
        .some((query) => query.isActive() && query.state.status === 'error')
      if (hasActiveError) {
        toast.error('Middleware health refresh failed')
        return
      }
      setRefreshed(new Date())
      toast.success('Active verified middleware reads refreshed')
    })
  }
  const sidebarClass = `sidebar ${collapsed ? 'collapsed' : ''} ${mobileNav ? 'mobile-open' : ''}`
  return (
    <div className="app-frame">
      <aside className={sidebarClass}>
        <div className="brand">
          <div className="brand-mark">
            <Activity size={19} />
          </div>
          {!collapsed && (
            <div>
              <strong>
                zoho<span>amarco</span>
              </strong>
              <small>OPERATIONS</small>
            </div>
          )}
          <button
            className="icon-button collapse-button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label="Collapse sidebar"
          >
            <ChevronLeft size={16} />
          </button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {nav.map((item) => (
            <NavLink
              onClick={() => setMobileNav(false)}
              title={item.label}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              to={item.path}
              key={item.path}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.path === '/monitoring' && apiMode === 'mock' && (
                <span className="nav-count">2</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="support-card">
            <div className="support-icon">
              <CircleHelp size={16} />
            </div>
            {!collapsed && (
              <div>
                <strong>Operator guide</strong>
                <small>Not available in this workspace</small>
              </div>
            )}
          </div>
          <NavLink
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            to="/settings"
          >
            <SettingsIcon size={18} />
            <span>Settings</span>
          </NavLink>
          <div className="side-user">
            <div className="avatar">{avatarLabel}</div>
            {!collapsed && (
              <div className="user-info">
                <strong>{auth.user?.name ?? 'Guest operator'}</strong>
                <small>{auth.user?.role ?? 'Development session'}</small>
              </div>
            )}
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="mobile-scrim"
          onClick={() => setMobileNav(false)}
          aria-label="Close navigation"
        />
      )}
      <div className="main-column">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobileNav(true)}
              aria-label="Open navigation"
            >
              <Menu size={19} />
            </button>
            <div className="crumb">
              <span>Workspace</span>
              <ChevronRight size={13} />
              <strong>{title}</strong>
            </div>
          </div>
          <div className="topbar-right">
            <CommandPalette
              allowDemoRecords={apiMode === 'mock'}
              allowApiRecords={apiMode === 'api' && auth.sessionState === 'active'}
            />
            <label className="global-range-control">
              <span>Range</span>
              <select
                className="select compact"
                value={globalRange}
                onChange={(event) => setGlobalRange(event.target.value as GlobalDateRange)}
                aria-label="Global dashboard date range"
              >
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
              </select>
            </label>
            <span className="environment">
              <i />
              {apiMode === 'mock' ? 'DEMO ENVIRONMENT' : 'API MODE'}
            </span>
            <span
              className={apiMode === 'api' ? 'api-indicator is-live' : 'api-indicator'}
              title={
                apiMode === 'api'
                  ? 'API mode; each module reports its verified data availability.'
                  : 'Middleware reads are disabled in mock mode.'
              }
            >
              <span className="api-dot" />
              {apiMode === 'mock'
                ? 'Mock data'
                : auth.sessionState === 'active'
                  ? 'Authenticated API'
                  : auth.sessionState === 'loading'
                    ? 'Checking session'
                    : 'API data unavailable'}
            </span>
            <button
              className="refresh-button"
              onClick={refresh}
              aria-label="Refresh active middleware reads"
            >
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>
            <span className="last-refresh">
              {apiMode === 'mock' ? 'Demo snapshot loaded' : 'Awaiting verified data'}{' '}
              {new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(
                refreshed,
              )}
            </span>
            <NotificationCenter
              alerts={apiMode === 'mock' ? (demoData?.alerts ?? []) : []}
              isDemo={apiMode === 'mock'}
              allowApiRead={apiMode === 'api' && auth.sessionState === 'active'}
            />
            <div className="popover-wrap">
              <button
                className="user-trigger"
                aria-label="Open user menu"
                aria-expanded={userOpen}
                onClick={() => setUserOpen(!userOpen)}
              >
                <span className="avatar">{avatarLabel}</span>
                <ChevronDown size={14} />
              </button>
              {userOpen && (
                <div className="popover user-pop">
                  <strong>{auth.user?.name ?? 'Guest operator'}</strong>
                  <small>{auth.user?.email ?? 'No active session'}</small>
                  <hr />
                  <button
                    onClick={() => {
                      setUserOpen(false)
                      void auth
                        .logout()
                        .then(() => {
                          queryClient.clear()
                          navigate('/login')
                        })
                        .catch(() =>
                          toast.error('Sign out failed. Refresh the session and try again.'),
                        )
                    }}
                  >
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="page-wrap">
          <DashboardRangeContext.Provider value={globalRange}>
            <Routes>
              <Route path="/" element={<Navigate to="/overview" replace />} />
              <Route path="/login" element={<Login />} />
              <Route
                path="/overview"
                element={
                  <Protected>
                    <ApiOverview range={globalRange} />
                  </Protected>
                }
              />
              <Route
                path="/fiscalization"
                element={
                  <Protected>
                    <ApiFiscalization range={globalRange} />
                  </Protected>
                }
              />
              <Route
                path="/device"
                element={
                  <Protected>
                    <ApiDevice />
                  </Protected>
                }
              />
              <Route
                path="/writeback"
                element={
                  <Protected>
                    <ApiWriteback range={globalRange} />
                  </Protected>
                }
              />
              <Route
                path="/monitoring"
                element={
                  <Protected>
                    <ApiMonitoring />
                  </Protected>
                }
              />
              <Route
                path="/settings"
                element={
                  <Protected>
                    <ApiSettings />
                  </Protected>
                }
              />
              <Route path="*" element={<Navigate to="/overview" replace />} />
            </Routes>
          </DashboardRangeContext.Provider>
          <footer className="footer">
            <span>
              ZohoAmarco Operations <b>·</b> Dashboard v0.1.0
            </span>
            <span>Middleware remains the source of truth</span>
          </footer>
        </main>
      </div>
      <Toaster theme="dark" position="bottom-right" richColors />
    </div>
  )
}

function PageHeading({
  eyebrow,
  title,
  sub,
  action,
}: {
  eyebrow: string
  title: string
  sub: string
  action?: ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      {action && <div className="heading-action">{action}</div>}
    </div>
  )
}
function Protected({ children }: { children: ReactNode }) {
  const { user, sessionState } = useAuth()
  if (sessionState === 'loading')
    return (
      <div className="empty-state" role="status">
        <Activity size={20} />
        <strong>Checking dashboard session</strong>
        <span>Verifying your session with the authentication service.</span>
      </div>
    )
  if (user && sessionState === 'active') return children
  const reason =
    sessionState === 'expired'
      ? 'expired'
      : sessionState === 'unauthorized'
        ? 'unauthorized'
        : undefined
  return <Navigate to={reason ? `/login?reason=${reason}` : '/login'} replace />
}
function useDrawerA11y(onClose: () => void) {
  const dialogRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = () =>
      dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []
    focusable()[0]?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
      if (event.key === 'Tab') {
        const elements = focusable()
        const first = elements[0]
        const last = elements[elements.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [onClose])
  return dialogRef
}
function Stat({
  label,
  value,
  delta,
  icon: Icon,
  tone = 'default',
  foot,
}: {
  label: string
  value: string | number
  delta?: string
  icon: LucideIcon
  tone?: string
  foot?: string
}) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${tone}`}>
          <Icon size={17} />
        </span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">
        {delta && (
          <span className={tone === 'danger' ? 'delta danger' : 'delta'}>
            {tone === 'danger' ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}
            {delta}
          </span>
        )}
        <span>{foot}</span>
      </div>
    </article>
  )
}
function Panel({
  title,
  sub,
  action,
  children,
  className = '',
}: {
  title: string
  sub?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
function StatusDot({ status }: { status: Status }) {
  return <span className={`status-dot ${status}`} />
}
function ServiceList({ rows }: { rows?: ServiceHealth[] }) {
  const serviceRows = rows ?? useDemoData()?.services ?? []
  return (
    <div className="service-list">
      {serviceRows.map((row) => (
        <div className="service-row" key={row.name}>
          <div className="service-icon">
            <StatusDot status={row.status} />
          </div>
          <div className="service-copy">
            <strong>{row.name}</strong>
            <small>{row.detail}</small>
          </div>
          <div className="service-meta">
            {row.latency && <span>{row.latency}</span>}
            <Badge status={row.status}>{row.status}</Badge>
          </div>
        </div>
      ))}
    </div>
  )
}
function bucketStart(value: string, range: GlobalDateRange) {
  const date = new Date(value)
  if (range === '24h') date.setMinutes(0, 0, 0)
  else date.setHours(0, 0, 0, 0)
  return date.getTime()
}
function bucketLabel(timestamp: number, range: GlobalDateRange) {
  return new Intl.DateTimeFormat(
    'en-KE',
    range === '24h' ? { hour: '2-digit' } : { month: 'short', day: 'numeric' },
  ).format(timestamp)
}
function aggregateVolume(items: Submission[], range: GlobalDateRange) {
  const count = range === '24h' ? 24 : range === '7d' ? 7 : 30
  const unit = range === '24h' ? 3_600_000 : 86_400_000
  const now = new Date()
  if (range !== '24h') now.setHours(0, 0, 0, 0)
  const last = Math.floor(now.getTime() / unit) * unit
  const grouped = new Map<number, { success: number; failed: number }>()
  for (const item of items) {
    if (!inGlobalRange(item.createdAt, range)) continue
    const key = bucketStart(item.createdAt, range)
    const totals = grouped.get(key) ?? { success: 0, failed: 0 }
    if (item.status === 'fiscalized') totals.success += 1
    if (item.status === 'failed') totals.failed += 1
    grouped.set(key, totals)
  }
  return Array.from({ length: count }, (_, index) => {
    const timestamp = last - (count - 1 - index) * unit
    const totals = grouped.get(timestamp) ?? { success: 0, failed: 0 }
    return { label: bucketLabel(timestamp, range), ...totals }
  })
}
function percentile(values: number[], fraction: number) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] / 1_000
}
function aggregateProcessing(items: Submission[], range: GlobalDateRange) {
  const buckets = new Map<number, number[]>()
  for (const item of items) {
    if (!inGlobalRange(item.createdAt, range)) continue
    if (item.durationMs === undefined) continue
    const key = bucketStart(item.createdAt, range)
    buckets.set(key, [...(buckets.get(key) ?? []), item.durationMs])
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([timestamp, values]) => ({
      label: bucketLabel(timestamp, range),
      p50: percentile(values, 0.5),
      p95: percentile(values, 0.95),
    }))
}

function Overview() {
  const period = useDashboardRange()
  const demoData = useDemoData()
  const submissions = demoData?.submissions ?? []
  const services = demoData?.services ?? []
  const alerts = demoData?.alerts ?? []
  const rangeSubmissions = useMemo(
    () => submissions.filter((item) => inGlobalRange(item.createdAt, period)),
    [period],
  )
  const successful = rangeSubmissions.filter((item) => item.status === 'fiscalized')
  const failed = rangeSubmissions.filter((item) => item.status === 'failed')
  const pending = rangeSubmissions.filter(
    (item) => item.status === 'pending' || item.status === 'processing',
  )
  const review = rangeSubmissions.filter(
    (item) => item.status === 'manual_review' || item.status === 'outcome_unknown',
  )
  const fiscalizedValue = successful.reduce((total, item) => total + item.amount, 0)
  const writebackRecords = rangeSubmissions.filter((item) => item.writeback !== 'not_required')
  const writebackComplete = writebackRecords.filter((item) => item.writeback === 'complete').length
  const successRate = rangeSubmissions.length
    ? Math.round((successful.length / rangeSubmissions.length) * 100)
    : 0
  const failureRate = rangeSubmissions.length
    ? Math.round((failed.length / rangeSubmissions.length) * 100)
    : 0
  const writebackRate = writebackRecords.length
    ? Math.round((writebackComplete / writebackRecords.length) * 100)
    : 0
  const volumeData = useMemo(() => aggregateVolume(submissions, period), [period])
  const processingData = useMemo(() => aggregateProcessing(submissions, period), [period])
  const invoiceCount = rangeSubmissions.filter((item) => item.type === 'Invoice').length
  const creditNoteCount = rangeSubmissions.filter((item) => item.type === 'Credit note').length
  const totalDocuments = invoiceCount + creditNoteCount
  const invoiceShare = totalDocuments ? Math.round((invoiceCount / totalDocuments) * 100) : 0
  const statusDistribution = [
    { label: 'Fiscalized', count: successful.length, tone: 'good' },
    {
      label: 'Pending',
      count: rangeSubmissions.filter((item) => item.status === 'pending').length,
      tone: 'warn',
    },
    {
      label: 'Processing',
      count: rangeSubmissions.filter((item) => item.status === 'processing').length,
      tone: 'info',
    },
    { label: 'Failed', count: failed.length, tone: 'bad' },
    {
      label: 'Manual review',
      count: rangeSubmissions.filter((item) => item.status === 'manual_review').length,
      tone: 'warn',
    },
    {
      label: 'Outcome unknown',
      count: rangeSubmissions.filter((item) => item.status === 'outcome_unknown').length,
      tone: 'neutral',
    },
  ]
  const writebackDistribution = [
    {
      label: 'Complete',
      count: writebackRecords.filter((item) => item.writeback === 'complete').length,
      tone: 'good',
    },
    {
      label: 'Pending',
      count: writebackRecords.filter((item) => item.writeback === 'pending').length,
      tone: 'warn',
    },
    {
      label: 'Failed',
      count: writebackRecords.filter((item) => item.writeback === 'failed').length,
      tone: 'bad',
    },
  ]
  const periodLabel =
    period === '24h' ? 'last 24 hours' : period === '7d' ? 'last 7 days' : 'last 30 days'
  return (
    <>
      <PageHeading
        eyebrow={todayLabel}
        title="Operations overview"
        sub={`Sample fiscalization activity for the ${periodLabel}.`}
        action={
          <button
            className="button secondary"
            aria-label="Export report"
            onClick={() => {
              exportSubmissions(rangeSubmissions)
              toast.success('Demo snapshot exported as CSV')
            }}
          >
            <Download size={15} /> Export report
          </button>
        }
      />
      <div className="demo-banner">
        <div className="banner-icon">
          <CircleHelp size={16} />
        </div>
        <div>
          <strong>DEMO MODE</strong>
          <span>
            Metrics and charts are derived from the sample transaction set. No live operations are
            being performed.
          </span>
        </div>
        <Link to="/settings">
          Configure API <ArrowRight size={13} />
        </Link>
      </div>
      <div className="stat-grid">
        <Stat
          label="Total requests"
          value={rangeSubmissions.length}
          icon={FileText}
          foot={periodLabel}
        />
        <Stat
          label="Successful fiscalizations"
          value={successful.length}
          delta={`${successRate}%`}
          icon={CheckCircle2}
          tone="success"
          foot="of sample requests"
        />
        <Stat
          label="Success rate"
          value={`${successRate}%`}
          icon={Gauge}
          tone="success"
          foot="Derived from sample records"
        />
        <Stat
          label="Pending"
          value={pending.length}
          icon={Clock3}
          tone="warning"
          foot="Across all document types"
        />
        <Stat
          label="Failed"
          value={failed.length}
          delta={`${failureRate}%`}
          icon={AlertCircle}
          tone="danger"
          foot="failure rate"
        />
        <Stat
          label="Manual review"
          value={review.length}
          icon={ListFilter}
          tone="warning"
          foot="review or uncertain outcome"
        />
        <Stat
          label="Fiscalized value"
          value={money(fiscalizedValue, 'KES')}
          icon={RefreshCw}
          tone="success"
          foot="confirmed sample receipts"
        />
        <Stat
          label="Writeback success"
          value={`${writebackRate}%`}
          icon={CheckCircle2}
          tone={writebackRate === 100 ? 'success' : 'warning'}
          foot={`${writebackComplete} of ${writebackRecords.length} sample records`}
        />
      </div>
      <div className="overview-grid">
        <Panel
          title="Fiscalization volume"
          sub={`Submission activity · ${periodLabel}`}
          action={<span className="quiet-label">{rangeSubmissions.length} records</span>}
        >
          <div className="chart-legend">
            <span>
              <i className="legend-green" />
              Successful
            </span>
            <span>
              <i className="legend-red" />
              Failed
            </span>
          </div>
          <div className="chart-area">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={volumeData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillSuccess" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34c88a" stopOpacity={0.23} />
                    <stop offset="95%" stopColor="#34c88a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#242a32" vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#7e8894', fontSize: 10 }}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#7e8894', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    background: '#14191f',
                    border: '1px solid #303842',
                    borderRadius: 8,
                    color: '#eef1f5',
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="success"
                  name="Successful"
                  stroke="#40cf92"
                  strokeWidth={2}
                  fill="url(#fillSuccess)"
                />
                <Area
                  type="monotone"
                  dataKey="failed"
                  name="Failed"
                  stroke="#ef6d72"
                  strokeWidth={2}
                  fill="none"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel
          title="Service health"
          sub="Demonstration snapshot · no live checks"
          action={
            <Link className="panel-link" to="/device">
              View all <ArrowRight size={13} />
            </Link>
          }
        >
          <ServiceList rows={services.slice(0, 5)} />
        </Panel>
        <Panel
          title="Processing time"
          sub="Median and 95th percentile · seconds"
          action={<span className="quiet-label">{processingData.length} intervals</span>}
        >
          <div className="chart-legend">
            <span>
              <i className="legend-blue" />
              P50
            </span>
            <span>
              <i className="legend-purple" />
              P95
            </span>
          </div>
          <div className="chart-area short">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={processingData} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#242a32" vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#7e8894', fontSize: 10 }}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#7e8894', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    background: '#14191f',
                    border: '1px solid #303842',
                    borderRadius: 8,
                    color: '#eef1f5',
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="p50"
                  name="P50"
                  stroke="#55a9e8"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="p95"
                  name="P95"
                  stroke="#a887f2"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Document mix" sub={`Request mix · ${periodLabel}`}>
          <div className="mix-wrap">
            <div className="mix-chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Invoices', value: invoiceCount, fill: '#45c78d' },
                      { name: 'Credit notes', value: creditNoteCount, fill: '#5b9bcb' },
                    ]}
                    dataKey="value"
                    innerRadius="67%"
                    outerRadius="86%"
                    paddingAngle={3}
                    stroke="none"
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mix-total">
                <b>{totalDocuments.toLocaleString()}</b>
                <small>total</small>
              </div>
            </div>
            <div className="mix-values">
              <div>
                <i className="legend-green" />
                <span>Invoices</span>
                <b>
                  {invoiceCount.toLocaleString()} <small>{invoiceShare}%</small>
                </b>
              </div>
              <div>
                <i className="legend-blue" />
                <span>Credit notes</span>
                <b>
                  {creditNoteCount.toLocaleString()} <small>{100 - invoiceShare}%</small>
                </b>
              </div>
            </div>
          </div>
        </Panel>
        <Panel title="Fiscalization status" sub={`Request distribution · ${periodLabel}`}>
          <DistributionList rows={statusDistribution} total={rangeSubmissions.length} />
        </Panel>
        <Panel title="Writeback outcomes" sub={`Sample records · ${periodLabel}`}>
          <DistributionList rows={writebackDistribution} total={writebackRecords.length} />
          <p className="distribution-note">
            The middleware does not expose a verified writeback history endpoint.
          </p>
        </Panel>
      </div>
      <div className="bottom-grid">
        <Panel
          title="Recent submissions"
          sub="Latest processing activity"
          action={
            <Link className="panel-link" to="/fiscalization">
              View all <ArrowRight size={13} />
            </Link>
          }
        >
          <SubmissionTable rows={rangeSubmissions.slice(0, 5)} compact />
        </Panel>
        <Panel
          title="System alerts"
          sub="Items that may need attention"
          action={
            <Link className="panel-link" to="/monitoring">
              View logs <ArrowRight size={13} />
            </Link>
          }
        >
          <AlertList rows={alerts.filter((item) => inGlobalRange(item.at, period))} />
        </Panel>
      </div>
    </>
  )
}

function DistributionList({
  rows,
  total,
}: {
  rows: { label: string; count: number; tone: string }[]
  total: number
}) {
  return (
    <div className="distribution-list">
      {rows.map((row) => (
        <div className="distribution-row" key={row.label}>
          <div className="distribution-label">
            <span className={`distribution-mark ${row.tone}`} />
            {row.label}
            <b>{row.count}</b>
          </div>
          <div className="distribution-track">
            <i
              className={row.tone}
              style={{ width: `${total ? Math.round((row.count / total) * 100) : 0}%` }}
            />
          </div>
        </div>
      ))}
      {total === 0 && (
        <span className="distribution-empty">No requests in the selected range.</span>
      )}
    </div>
  )
}

function SubmissionTable({
  rows,
  compact = false,
  onSelect,
  visibleColumns,
}: {
  rows: Submission[]
  compact?: boolean
  onSelect?: (s: Submission) => void
  visibleColumns?: Set<string>
}) {
  const showColumn = (column: string) => compact || !visibleColumns || visibleColumns.has(column)
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Document</th>
            {showColumn('customer') && <th>Customer</th>}
            {showColumn('amount') && <th>Amount</th>}
            {showColumn('status') && <th>Status</th>}
            {!compact && (
              <>
                {showColumn('attempts') && <th>Attempts</th>}
                {showColumn('cuReceipt') && <th>CU receipt</th>}
                {showColumn('etims') && <th>KRA / eTIMS</th>}
                {showColumn('writeback') && <th>Writeback</th>}
              </>
            )}
            {showColumn('updated') && <th>Updated</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr
              key={s.id}
              onClick={() => onSelect?.(s)}
              onKeyDown={(event) => {
                if (onSelect && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault()
                  onSelect(s)
                }
              }}
              tabIndex={onSelect ? 0 : undefined}
              aria-label={onSelect ? `Open submission details for ${s.documentNumber}` : undefined}
              className={onSelect ? 'clickable-row' : ''}
            >
              <td>
                <div className="doc-cell">
                  <span className={`doc-icon ${s.type === 'Credit note' ? 'credit' : ''}`}>
                    <FileText size={14} />
                  </span>
                  <div>
                    <strong>{s.documentNumber}</strong>
                    <small>
                      {s.type} · {s.id}
                    </small>
                  </div>
                </div>
              </td>
              {showColumn('customer') && <td>{s.customer}</td>}
              {showColumn('amount') && <td className="amount">{money(s.amount, s.currency)}</td>}
              {showColumn('status') && (
                <td>
                  <Badge status={s.status}>{statusCopy[s.status]}</Badge>
                </td>
              )}
              {!compact && (
                <>
                  {showColumn('attempts') && <td>{s.attempts}</td>}
                  {showColumn('cuReceipt') && (
                    <td>
                      {s.cuReceiptNumber ? (
                        <span className="mono">{s.cuReceiptNumber}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  )}
                  {showColumn('etims') && (
                    <td>
                      {s.etimsReceiptNumber ? (
                        <span className="mono">{s.etimsReceiptNumber}</span>
                      ) : (
                        <Badge
                          status={
                            s.etimsStatus === 'confirmed'
                              ? 'healthy'
                              : s.etimsStatus === 'failed'
                                ? 'error'
                                : (s.etimsStatus ?? 'unknown')
                          }
                        >
                          {s.etimsReceiptNumber ? 'Receipt confirmed' : 'Not reported'}
                        </Badge>
                      )}
                    </td>
                  )}
                  {showColumn('writeback') && (
                    <td>
                      <Badge status={s.writeback}>
                        {s.writeback === 'complete'
                          ? 'Complete'
                          : s.writeback === 'not_required'
                            ? 'N/A'
                            : s.writeback}
                      </Badge>
                    </td>
                  )}
                </>
              )}
              {showColumn('updated') && <td className="muted">{relative(s.updatedAt)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="empty-state">
          <FileText size={23} />
          <strong>No records match</strong>
          <span>Adjust filters or clear your search.</span>
        </div>
      )}
    </div>
  )
}

function Fiscalization() {
  return <MockFiscalization />
}

function MockFiscalization() {
  const globalRange = useDashboardRange()
  const submissions = useDemoData()?.submissions ?? []
  const location = useLocation()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [kind, setKind] = useState('all')
  const [sort, setSort] = useState('updated')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(8)
  const [selected, setSelected] = useState<Submission | null>(null)
  const [visibleColumns, setVisibleColumns] = useState(
    () =>
      new Set([
        'customer',
        'amount',
        'status',
        'attempts',
        'cuReceipt',
        'etims',
        'writeback',
        'updated',
      ]),
  )
  useEffect(() => setPage(1), [globalRange])
  const filtered = useMemo(
    () =>
      submissions
        .filter(
          (s) =>
            (status === 'all' ||
              s.status === status ||
              (status === 'writeback_pending' && s.writeback === 'pending')) &&
            (kind === 'all' || s.type === kind) &&
            inGlobalRange(s.createdAt, globalRange) &&
            `${s.documentNumber} ${s.documentId} ${s.customer} ${s.id} ${s.cuReceiptNumber ?? ''} ${s.etimsReceiptNumber ?? ''}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort((a, b) =>
          sort === 'amount'
            ? b.amount - a.amount
            : sort === 'document'
              ? a.documentNumber.localeCompare(b.documentNumber)
              : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
    [search, status, kind, globalRange, sort],
  )
  useEffect(() => {
    const state = location.state as { paletteSubmissionId?: string } | null
    if (!state?.paletteSubmissionId) return
    const row = submissions.find((item) => item.id === state.paletteSubmissionId)
    if (row) setSelected(row)
    navigate(location.pathname, { replace: true, state: null })
  }, [location, navigate])
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const data = filtered.slice((page - 1) * pageSize, page * pageSize)
  return (
    <>
      <PageHeading
        eyebrow="TRANSACTION CONTROL"
        title="Fiscalization"
        sub="Track invoice and credit-note submissions from intake through confirmed receipt and writeback."
        action={
          <button
            className="button secondary"
            onClick={() => {
              exportSubmissions(filtered)
              toast.success(`${filtered.length} filtered records exported as CSV`)
            }}
          >
            <Download size={15} /> Export
          </button>
        }
      />
      <div className="summary-strip">
        <div>
          <span>All submissions</span>
          <b>{submissions.length}</b>
        </div>
        <div>
          <span>Fiscalized</span>
          <b className="text-green">
            {submissions.filter((s) => s.status === 'fiscalized').length}
          </b>
        </div>
        <div>
          <span>Needs attention</span>
          <b className="text-amber">
            {
              submissions.filter((s) =>
                ['manual_review', 'outcome_unknown', 'failed'].includes(s.status),
              ).length
            }
          </b>
        </div>
        <div>
          <span>Writeback pending</span>
          <b>
            {
              submissions.filter((s) => s.writeback === 'pending' || s.writeback === 'failed')
                .length
            }
          </b>
        </div>
      </div>
      <Panel
        title="Submission records"
        sub={`${filtered.length} records · ${apiMode === 'mock' ? 'DEMO DATA' : 'API adapter pending mapping'}`}
        className="table-panel"
      >
        <div className="filters">
          <label className="search-field">
            <Search size={15} />
            <input
              aria-label="Search fiscalization submissions"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search document, customer or ID"
            />
          </label>
          <select
            className="select"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value)
              setPage(1)
            }}
            aria-label="Document type"
          >
            <option value="all">All document types</option>
            <option>Invoice</option>
            <option>Credit note</option>
          </select>
          <select
            className="select"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
            aria-label="Submission status"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="fiscalized">Fiscalized</option>
            <option value="failed">Failed</option>
            <option value="manual_review">Manual review</option>
            <option value="outcome_unknown">Outcome unknown</option>
            <option value="writeback_pending">Writeback pending</option>
          </select>
          <span className="quiet-label">Global range: {globalRange}</span>
          <select
            className="select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort records"
          >
            <option value="updated">Recently updated</option>
            <option value="amount">Amount</option>
            <option value="document">Document number</option>
          </select>
          <label className="select-label">
            <span className="sr-only">Rows per page</span>
            <select
              className="select"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value))
                setPage(1)
              }}
              aria-label="Rows per page"
            >
              <option value={8}>8 / page</option>
              <option value={16}>16 / page</option>
              <option value={32}>32 / page</option>
            </select>
          </label>
          <details className="column-menu">
            <summary className="button secondary">Columns</summary>
            <div className="column-menu-panel">
              {[
                ['customer', 'Customer'],
                ['amount', 'Amount'],
                ['status', 'Status'],
                ['attempts', 'Attempts'],
                ['cuReceipt', 'CU receipt'],
                ['etims', 'KRA / eTIMS'],
                ['writeback', 'Writeback'],
                ['updated', 'Updated'],
              ].map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={visibleColumns.has(key)}
                    onChange={(event) =>
                      setVisibleColumns((current) => {
                        const next = new Set(current)
                        if (event.target.checked) next.add(key)
                        else next.delete(key)
                        return next
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </details>
          <button
            className="button secondary filter-button"
            onClick={() => {
              setStatus('all')
              setKind('all')
              setSort('updated')
              setSearch('')
              setPage(1)
            }}
          >
            <Filter size={14} /> Clear
          </button>
        </div>
        <SubmissionTable rows={data} onSelect={setSelected} visibleColumns={visibleColumns} />
        <div className="table-footer">
          <span>
            Showing{' '}
            <b>
              {filtered.length ? (page - 1) * pageSize + 1 : 0}–
              {Math.min(page * pageSize, filtered.length)}
            </b>{' '}
            of <b>{filtered.length}</b>
          </span>
          <div className="pagination">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft size={15} />
            </button>
            {Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                className={page === i + 1 ? 'current' : ''}
                onClick={() => setPage(i + 1)}
              >
                {i + 1}
              </button>
            ))}
            <button
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
              aria-label="Next page"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </Panel>
      <AnimatePresence>
        {selected && <DetailDrawer item={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </>
  )
}

function DetailDrawer({ item, onClose }: { item: Submission; onClose: () => void }) {
  const dialogRef = useDrawerA11y(onClose)
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copied`)
    } catch {
      toast.error('Clipboard unavailable')
    }
  }
  return (
    <motion.div
      className="drawer-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <motion.aside
        ref={dialogRef}
        className="detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Submission details for ${item.documentNumber}`}
        initial={{ x: 450 }}
        animate={{ x: 0 }}
        exit={{ x: 450 }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
      >
        <div className="drawer-head">
          <div>
            <span className="eyebrow">SUBMISSION DETAIL</span>
            <h2>{item.documentNumber}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close detail">
            <X size={18} />
          </button>
        </div>
        <div className="drawer-scroll">
          <div className="detail-status">
            <Badge status={item.status}>{statusCopy[item.status]}</Badge>
            <span>Updated {relative(item.updatedAt)}</span>
          </div>
          <div className="detail-money">
            <small>{item.type} total</small>
            <b>{money(item.amount, item.currency)}</b>
            <span>{item.customer}</span>
          </div>
          <div className="detail-section">
            <h3>Document identifiers</h3>
            <CopyField label="Zoho document ID" value={item.documentId} onCopy={copy} />
            <CopyField label="Middleware request ID" value={item.id} onCopy={copy} />
            {item.cuReceiptNumber && (
              <CopyField label="CU receipt number" value={item.cuReceiptNumber} onCopy={copy} />
            )}
            {item.etimsReceiptNumber && (
              <CopyField
                label="KRA / eTIMS receipt reference"
                value={item.etimsReceiptNumber}
                onCopy={copy}
              />
            )}
          </div>
          <div className="detail-section">
            <h3>Processing summary</h3>
            <div className="detail-pairs">
              <span>Document type</span>
              <b>{item.type}</b>
              <span>Attempts</span>
              <b>{item.attempts}</b>
              <span>Fiscalization</span>
              <b>{statusCopy[item.status]}</b>
              <span>Zoho writeback</span>
              <b>{item.writeback}</b>
              <span>Receipt evidence</span>
              <b>{item.cuReceiptNumber ? 'Confirmed' : 'Not available'}</b>
              <span>KRA / eTIMS receipt</span>
              <b>{item.etimsReceiptNumber ?? 'Not reported by the verified API adapter'}</b>
              <span>Processing time</span>
              <b>{item.durationMs ? `${(item.durationMs / 1000).toFixed(2)} s` : '—'}</b>
            </div>
          </div>
          {item.error && (
            <div className="error-box">
              <AlertTriangle size={16} />
              <div>
                <strong>Latest error</strong>
                <p>{item.error}</p>
              </div>
            </div>
          )}
          {item.reviewReason && (
            <div className="review-box">
              <CircleHelp size={16} />
              <div>
                <strong>Manual review reason</strong>
                <p>{item.reviewReason}</p>
              </div>
            </div>
          )}
          <div className="detail-section">
            <h3>Attempt and status history</h3>
            <div className="timeline">
              {item.history.map((h, i) => (
                <div className="timeline-item" key={`${h.at}-${i}`}>
                  <StatusDot status={h.status} />
                  <div>
                    <strong>{h.title}</strong>
                    <p>{h.detail}</p>
                    <time>{shortDate(h.at)}</time>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="drawer-foot">
          <button
            className="button secondary"
            onClick={() =>
              toast.info('Read only', {
                description: 'Recovery actions are handled by middleware operators.',
              })
            }
          >
            <ShieldCheck size={15} /> Read-only record
          </button>
        </div>
      </motion.aside>
    </motion.div>
  )
}
function CopyField({
  label,
  value,
  onCopy,
}: {
  label: string
  value: string
  onCopy: (s: string, label: string) => void
}) {
  return (
    <div className="copy-field">
      <span>{label}</span>
      <div>
        <code>{value}</code>
        <button
          className="icon-button"
          onClick={() => onCopy(value, label)}
          aria-label={`Copy ${label}`}
        >
          <Copy size={14} />
        </button>
      </div>
    </div>
  )
}

function AlertList({ rows }: { rows?: DemoData['alerts'] }) {
  const alertRows = rows ?? useDemoData()?.alerts ?? []
  return (
    <div className="alert-list">
      {alertRows.map((a) => (
        <div className={`alert-row ${a.level}`} key={a.id}>
          <span className="alert-icon">
            {a.level === 'critical' ? <AlertCircle size={16} /> : <AlertTriangle size={16} />}
          </span>
          <div>
            <strong>{a.title}</strong>
            <p>{a.detail}</p>
            <small>{relative(a.at)}</small>
          </div>
          <ChevronRight size={15} />
        </div>
      ))}
    </div>
  )
}

function Device() {
  const demoData = useDemoData()
  const device = demoData?.device
  const events = demoData?.events ?? []
  const deviceHealth = useDeviceHealthQuery()
  const isDemo = apiMode === 'mock'
  const observedStatus: Status =
    isDemo && device
      ? device.status
      : deviceHealth.isError
        ? 'unknown'
        : deviceHealth.data?.endpointReachability.status === 'reachable'
          ? 'healthy'
          : deviceHealth.data?.endpointReachability.status === 'unavailable'
            ? 'offline'
            : 'unknown'
  const endpointLabel =
    isDemo && device
      ? device.endpointReachable
        ? 'Endpoint reachable · DEMO'
        : 'Endpoint unavailable · DEMO'
      : deviceHealth.isFetching && !deviceHealth.data
        ? 'Checking endpoint'
        : deviceHealth.isError
          ? 'Endpoint state unknown'
          : deviceHealth.data?.endpointReachability.status === 'reachable'
            ? 'Endpoint reachable'
            : deviceHealth.data?.endpointReachability.status === 'unavailable'
              ? 'Endpoint unavailable'
              : 'Endpoint state unknown'
  return (
    <>
      <PageHeading
        eyebrow="FISCAL DEVICE"
        title="Tremol G03"
        sub="Device identity, connectivity and readiness signals reported by middleware."
        action={
          <button
            className="button secondary"
            onClick={() =>
              toast.info('Demo diagnostics only', {
                description:
                  'The displayed endpoint status is sample data; no G03 request was sent.',
              })
            }
          >
            <CircleHelp size={14} /> Demo diagnostics
          </button>
        }
      />
      <div className="device-alert">
        <div>
          <StatusDot status={observedStatus} />
          <strong>{endpointLabel} · device readiness unverified</strong>
        </div>
        <p>
          {deviceHealth.isError && !isDemo
            ? 'The verified middleware health check did not return a usable device endpoint status.'
            : 'Endpoint reachability alone does not confirm the physical device is healthy or ready to fiscalize.'}
        </p>
      </div>
      <div className="device-grid">
        <Panel
          title="Device connectivity"
          sub={
            isDemo
              ? 'Endpoint reachability · demo snapshot'
              : 'Verified middleware device health response'
          }
          className="device-main"
        >
          <div className="connectivity-visual">
            <div className="device-ring">
              <div className="device-ring-inner">
                <MonitorCog size={32} />
                <span>G03</span>
              </div>
              <i className="pulse-dot" />
            </div>
            <div className="connectivity-label">
              <Badge status={observedStatus}>{endpointLabel}</Badge>
              <strong>Physical health not verified</strong>
              <span>
                Last successful communication ·{' '}
                {isDemo && device?.lastCommunication
                  ? relative(device.lastCommunication)
                  : 'Not reported by this API contract'}
              </span>
            </div>
          </div>
          <div className="device-facts">
            <div>
              <small>Configured endpoint</small>
              <b>
                {isDemo ? (device?.endpoint ?? 'Not reported') : 'Not returned by health contract'}
              </b>
            </div>
            <div>
              <small>Last health check</small>
              <b>
                {isDemo && device?.lastCommunication
                  ? shortDate(device.lastCommunication)
                  : !isDemo && deviceHealth.dataUpdatedAt > 0
                    ? shortDate(new Date(deviceHealth.dataUpdatedAt).toISOString())
                    : 'Not reported'}
              </b>
            </div>
            <div>
              <small>Response time</small>
              <b>
                {isDemo ? (
                  <>
                    91 ms <em>· demo</em>
                  </>
                ) : (
                  'Not reported'
                )}
              </b>
            </div>
            <div>
              <small>Operating mode</small>
              <b>{isDemo ? (device?.mode ?? 'Not reported') : 'Not returned by health contract'}</b>
            </div>
          </div>
        </Panel>
        <Panel
          title="Device identity"
          sub="Physical identity details are not exposed by verified API"
        >
          <div className="identity-list">
            <IdentityRow label="Configured serial" value="Not reported" />
            <IdentityRow label="CU serial" value="Not reported" />
            <IdentityRow label="Software version" value="Not reported" />
          </div>
          <div className="callout">
            <CircleHelp size={15} />
            <span>Device identity is unavailable from the current dashboard API contract.</span>
          </div>
        </Panel>
        <Panel title="Readiness and registration" sub="Independent operational states">
          <div className="readiness-list">
            <ReadinessRow
              title="Endpoint connectivity"
              description="Middleware can reach the configured endpoint"
              status={observedStatus}
              label={endpointLabel}
            />
            <ReadinessRow
              title="Device health"
              description="Physical operating state from device evidence"
              status="unknown"
              label="Unknown"
            />
            <ReadinessRow
              title="Fiscalization readiness"
              description="Device can accept fiscal transactions"
              status="unknown"
              label="Unknown"
            />
            <ReadinessRow
              title="KRA / eTIMS pairing"
              description="Registration or pairing state"
              status="unknown"
              label="Unknown"
            />
          </div>
        </Panel>
        <Panel
          title="Recent device events"
          sub={
            isDemo ? 'Safe demo summaries' : 'System event stream is not exposed by a verified API'
          }
          action={
            <Link className="panel-link" to="/monitoring">
              View logs <ArrowRight size={13} />
            </Link>
          }
        >
          <div className="event-list">
            {(isDemo ? events.filter((e) => /device|g03/i.test(e.component + e.event)) : []).slice(
              0,
              3,
            ).length === 0 ? (
              <div className="empty-inline">
                <Wifi size={18} />
                <span>No device operation events are available in the demo sample.</span>
              </div>
            ) : (
              (isDemo ? events.filter((e) => /device|g03/i.test(e.component + e.event)) : [])
                .slice(0, 3)
                .map((e) => <EventRow item={e} key={e.id} />)
            )}
          </div>
        </Panel>
      </div>
    </>
  )
}
function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="identity-row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}
function ReadinessRow({
  title,
  description,
  status,
  label,
}: {
  title: string
  description: string
  status: Status
  label: string
}) {
  return (
    <div className="readiness-row">
      <div>
        <strong>{title}</strong>
        <small>{description}</small>
      </div>
      <Badge status={status}>{label}</Badge>
    </div>
  )
}

function Writeback() {
  const globalRange = useDashboardRange()
  const submissions = useDemoData()?.submissions ?? []
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Submission | null>(null)
  const rows = submissions
    .filter((s) => s.writeback !== 'not_required')
    .filter((s) => inGlobalRange(s.createdAt, globalRange))
    .filter((s) => filter === 'all' || s.writeback === filter)
    .filter((s) =>
      `${s.documentNumber} ${s.documentId} ${s.customer}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
  return (
    <>
      <PageHeading
        eyebrow="ZOHO BOOKS INTEGRATION"
        title="Writeback"
        sub="Track confirmed fiscal evidence returned to Zoho Books custom fields."
      />
      <div className="rule-banner">
        <ShieldCheck size={17} />
        <div>
          <strong>Evidence-first writeback</strong>
          <span>
            Transmission status is only PUSHED after confirmed successful writeback. Receipt number
            and QR are populated from confirmed evidence.
          </span>
        </div>
      </div>
      <div className="stat-grid three">
        <Stat
          label="Awaiting writeback"
          value={rows.filter((s) => s.writeback === 'pending').length}
          icon={FileClock}
          tone="warning"
          foot="Confirmed fiscalization evidence"
        />
        <Stat
          label="Writeback complete"
          value={rows.filter((s) => s.writeback === 'complete').length}
          icon={CheckCircle2}
          tone="success"
          foot="Fields updated in Zoho Books"
        />
        <Stat
          label="Writeback failed"
          value={rows.filter((s) => s.writeback === 'failed').length}
          icon={AlertCircle}
          tone="danger"
          foot="Needs middleware investigation"
        />
      </div>
      <Panel
        title="Writeback activity"
        sub="Invoice and credit-note field update status"
        className="table-panel"
      >
        <div className="filters">
          <label className="search-field">
            <Search size={15} />
            <input
              aria-label="Search Zoho writeback records"
              value={search}
              placeholder="Search document or customer"
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            className="select"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Writeback status"
          >
            <option value="all">All writeback states</option>
            <option value="complete">Complete</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
          <span className="filter-spacer" />
          <span className="quiet-label">Read only</span>
        </div>
        <WritebackTable rows={rows} onSelect={setSelected} />
        {rows.length === 0 && (
          <div className="empty-state">
            <Search size={22} />
            <strong>No writeback records found</strong>
            <span>Try a different query or state.</span>
          </div>
        )}
      </Panel>
      <Panel title="Custom fields included" sub="Middleware confirmed evidence summary">
        <div className="field-chips">
          <span>
            <Check size={13} /> Transmission Status
          </span>
          <span>
            <Check size={13} /> Fiscalized At
          </span>
          <span>
            <Check size={13} /> CU Receipt Number
          </span>
          <span>
            <Check size={13} /> Receipt QR
          </span>
        </div>
        <p className="help-text">
          Fiscalized At reflects middleware completion time. No value is marked complete while Zoho
          confirmation is outstanding.
        </p>
      </Panel>
      <AnimatePresence>
        {selected && <WritebackDrawer item={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </>
  )
}
function WritebackTable({
  rows,
  onSelect,
}: {
  rows: Submission[]
  onSelect: (s: Submission) => void
}) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Document</th>
            <th>Customer</th>
            <th>Evidence</th>
            <th>Writeback</th>
            <th>Last updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr
              className="clickable-row"
              key={s.id}
              onClick={() => onSelect(s)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(s)
                }
              }}
              tabIndex={0}
              aria-label={`Open writeback details for ${s.documentNumber}`}
            >
              <td>
                <div className="doc-cell">
                  <span className="doc-icon">
                    <FileText size={14} />
                  </span>
                  <div>
                    <strong>{s.documentNumber}</strong>
                    <small>{s.type}</small>
                  </div>
                </div>
              </td>
              <td>{s.customer}</td>
              <td>
                {s.cuReceiptNumber ? (
                  <span className="evidence-ok">
                    <CheckCircle2 size={14} /> {s.cuReceiptNumber}
                  </span>
                ) : (
                  <span className="muted">Awaiting confirmed evidence</span>
                )}
              </td>
              <td>
                <Badge status={s.writeback}>{s.writeback}</Badge>
              </td>
              <td className="muted">{relative(s.updatedAt)}</td>
              <td>
                <ChevronRight size={15} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="empty-state">
          <RefreshCw size={22} />
          <strong>No writeback records</strong>
          <span>No records match this state.</span>
        </div>
      )}
    </div>
  )
}
function WritebackDrawer({ item, onClose }: { item: Submission; onClose: () => void }) {
  const dialogRef = useDrawerA11y(onClose)
  return (
    <motion.div
      className="drawer-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.aside
        ref={dialogRef}
        className="detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Writeback details for ${item.documentNumber}`}
        initial={{ x: 450 }}
        animate={{ x: 0 }}
        exit={{ x: 450 }}
      >
        <div className="drawer-head">
          <div>
            <span className="eyebrow">WRITEBACK DETAIL</span>
            <h2>{item.documentNumber}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="drawer-scroll">
          <div className="detail-status">
            <Badge status={item.writeback}>{item.writeback}</Badge>
            <span>
              {item.type} · {item.customer}
            </span>
          </div>
          {item.writebackError && (
            <div className="error-box">
              <AlertTriangle size={16} />
              <div>
                <strong>Latest writeback error</strong>
                <p>{item.writebackError}</p>
              </div>
            </div>
          )}
          <div className="detail-section">
            <h3>Original submission</h3>
            <div className="detail-pairs">
              <span>Zoho document ID</span>
              <b className="mono">{item.documentId}</b>
              <span>Fiscalization status</span>
              <b>{statusCopy[item.status]}</b>
              <span>Completion timestamp</span>
              <b>{item.cuReceiptNumber ? shortDate(item.updatedAt) : 'Not confirmed'}</b>
            </div>
          </div>
          <div className="detail-section">
            <h3>Confirmed fiscal evidence</h3>
            {item.cuReceiptNumber ? (
              <div className="confirmed-evidence">
                <CheckCircle2 size={18} />
                <div>
                  <strong>{item.cuReceiptNumber}</strong>
                  <span>Receipt confirmed by middleware evidence</span>
                </div>
              </div>
            ) : (
              <div className="callout">
                <CircleHelp size={15} />
                <span>
                  No receipt evidence is currently available. The dashboard does not infer or create
                  receipt data.
                </span>
              </div>
            )}
          </div>
          <div className="detail-section">
            <h3>Writeback fields</h3>
            <div className="field-checklist">
              {['Transmission Status', 'Fiscalized At', 'CU Receipt Number', 'Receipt QR'].map(
                (name, i) => (
                  <div key={name}>
                    <span>{name}</span>
                    {item.writeback === 'complete' ? (
                      <Badge status="complete">Updated</Badge>
                    ) : (
                      <Badge status="pending">
                        {i > 1 && !item.cuReceiptNumber ? 'Awaiting evidence' : 'Pending'}
                      </Badge>
                    )}
                  </div>
                ),
              )}
            </div>
          </div>
          <div className="detail-section">
            <h3>Attempt history</h3>
            <div className="timeline">
              {item.history.filter((h) => /writeback/i.test(h.title)).length ? (
                item.history
                  .filter((h) => /writeback/i.test(h.title))
                  .map((h, i) => (
                    <div className="timeline-item" key={i}>
                      <StatusDot status={h.status} />
                      <div>
                        <strong>{h.title}</strong>
                        <p>{h.detail}</p>
                        <time>{shortDate(h.at)}</time>
                      </div>
                    </div>
                  ))
              ) : (
                <div className="empty-inline">
                  <Clock3 size={16} /> No writeback attempt recorded in the demo sample.
                </div>
              )}
            </div>
          </div>
          <p className="help-text">
            Writeback attempts are performed by middleware only. This dashboard provides monitoring
            and detail views.
          </p>
        </div>
      </motion.aside>
    </motion.div>
  )
}

function Monitoring() {
  const globalRange = useDashboardRange()
  const demoData = useDemoData()
  const events = demoData?.events ?? []
  const submissions = demoData?.submissions ?? []
  const [severity, setSeverity] = useState('all')
  const [component, setComponent] = useState('all')
  const [query, setQuery] = useState('')
  const [show, setShow] = useState(8)
  const timeEvents = events.filter((event) => inGlobalRange(event.at, globalRange))
  const rangeSubmissions = submissions.filter((item) => inGlobalRange(item.createdAt, globalRange))
  const waitingCount = rangeSubmissions.filter((item) => item.status === 'pending').length
  const processingCount = rangeSubmissions.filter((item) => item.status === 'processing').length
  const completedCount = rangeSubmissions.filter((item) => item.status === 'fiscalized').length
  const failedCount = rangeSubmissions.filter((item) => item.status === 'failed').length
  const reviewCount = rangeSubmissions.filter(
    (item) => item.status === 'manual_review' || item.status === 'outcome_unknown',
  ).length
  const successPct = rangeSubmissions.length
    ? Math.round((completedCount / rangeSubmissions.length) * 100)
    : 0
  const oldestPending = rangeSubmissions
    .filter((item) => item.status === 'pending')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]
  const oldestAge = oldestPending
    ? Math.max(0, Math.round((Date.now() - new Date(oldestPending.createdAt).getTime()) / 60_000))
    : null
  const filtered = timeEvents.filter(
    (e) =>
      (severity === 'all' || e.severity === severity) &&
      (component === 'all' || e.component === component) &&
      `${e.component} ${e.event} ${e.detail} ${e.related ?? ''}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  )
  return (
    <>
      <PageHeading
        eyebrow="OPERATIONS CENTER"
        title="Monitoring"
        sub="Queue activity, recovery cases and safe middleware event summaries."
      />
      <div className="queue-grid">
        <QueueCard
          title="Waiting"
          count={String(waitingCount)}
          detail={`Oldest · ${oldestAge === null ? '—' : `${oldestAge} min`}`}
          tone="warn"
          icon={Clock3}
        />
        <QueueCard
          title="Processing"
          count={String(processingCount)}
          detail={`${rangeSubmissions.length} sample records`}
          tone="info"
          icon={Activity}
        />
        <QueueCard
          title="Completed in range"
          count={completedCount.toLocaleString()}
          detail={`${successPct}% success rate`}
          tone="good"
          icon={CheckCircle2}
        />
        <QueueCard
          title="Failed / review"
          count={String(failedCount + reviewCount)}
          detail={`${reviewCount} manual review or unknown`}
          tone="bad"
          icon={AlertTriangle}
        />
      </div>
      <div className="monitor-grid">
        <Panel title="Queue snapshot" sub="Sample records · selected time range">
          <div className="queue-summary">
            <div>
              <span>Queue depth</span>
              <b>{waitingCount + processingCount}</b>
              <small>
                {waitingCount} waiting · {processingCount} processing
              </small>
            </div>
            <div>
              <span>Oldest pending</span>
              <b>{oldestAge === null ? '—' : `${oldestAge} min`}</b>
              <small>{oldestPending?.documentNumber ?? 'No pending request'}</small>
            </div>
            <div>
              <span>Manual review</span>
              <b>{reviewCount + failedCount}</b>
              <small>
                {reviewCount} manual review or unknown · {failedCount} failed
              </small>
            </div>
          </div>
          <div className="queue-progress">
            <div>
              <span>Successful processing</span>
              <b>{successPct}%</b>
            </div>
            <div className="progress-track">
              <i style={{ width: `${successPct}%` }} />
            </div>
          </div>
        </Panel>
        <Panel title="Recovery watch" sub="Read-only issue summary">
          <div className="recovery-list">
            <RecoveryRow
              title="Uncertain outcome"
              subtitle="Receipt evidence is not confirmed"
              tag={`${rangeSubmissions.filter((item) => item.status === 'outcome_unknown').length} cases`}
              tone="warn"
            />
            <RecoveryRow
              title="Manual review"
              subtitle="Open review and failed records in the sample"
              tag={`${reviewCount + failedCount} cases`}
              tone="bad"
            />
            <RecoveryRow
              title="Duplicate submissions"
              subtitle="Duplicate detection is not exposed by an audited API"
              tag="Unavailable"
              tone="neutral"
            />
            <RecoveryRow
              title="Reconciliation conflicts"
              subtitle="Conflict state is not exposed by an audited API"
              tag="Unavailable"
              tone="neutral"
            />
          </div>
        </Panel>
      </div>
      <Panel
        title="System activity"
        sub={`${filtered.length} safe log summaries · no credentials or raw headers`}
        className="table-panel"
      >
        <div className="filters">
          <label className="search-field">
            <Search size={15} />
            <input
              aria-label="Search monitoring events"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search events, documents or details"
            />
          </label>
          <select className="select" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="all">All severity</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
          <select
            className="select"
            value={component}
            onChange={(e) => setComponent(e.target.value)}
          >
            <option value="all">All components</option>
            {Array.from(new Set(events.map((e) => e.component))).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <button
            className="button secondary filter-button"
            onClick={() => {
              setQuery('')
              setSeverity('all')
              setComponent('all')
            }}
          >
            <Filter size={14} /> Clear
          </button>
        </div>
        <div className="log-list">
          {filtered.slice(0, show).map((item) => (
            <EventRow item={item} key={item.id} />
          ))}
          {filtered.length === 0 && (
            <div className="empty-state">
              <Search size={22} />
              <strong>No events found</strong>
              <span>Try a different search or filter.</span>
            </div>
          )}
        </div>
        {filtered.length > show && (
          <div className="load-more">
            <button className="button secondary" onClick={() => setShow(show + 8)}>
              Load more events
            </button>
          </div>
        )}
      </Panel>
    </>
  )
}
function QueueCard({
  title,
  count,
  detail,
  tone,
  icon: Icon,
}: {
  title: string
  count: string
  detail: string
  tone: string
  icon: LucideIcon
}) {
  return (
    <article className="queue-card">
      <div className={`queue-icon ${tone}`}>
        <Icon size={17} />
      </div>
      <span>{title}</span>
      <b>{count}</b>
      <small>{detail}</small>
    </article>
  )
}
function RecoveryRow({
  title,
  subtitle,
  tag,
  tone,
}: {
  title: string
  subtitle: string
  tag: string
  tone: string
}) {
  return (
    <div className="recovery-row">
      <div>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>
      <span className={`recovery-tag ${tone}`}>{tag}</span>
    </div>
  )
}
function EventRow({ item }: { item: DemoData['events'][number] }) {
  return (
    <div className="event-row">
      <span className={`severity-mark ${item.severity}`} />
      <time>{shortDate(item.at)}</time>
      <span className="event-component">{item.component}</span>
      <div>
        <strong>{item.event}</strong>
        <small>{item.detail}</small>
      </div>
      {item.related && <span className="event-related">{item.related}</span>}
    </div>
  )
}

function SettingsPage() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const refreshIntervalSeconds = Math.round(refreshIntervalMs / 1_000)
  return (
    <>
      <PageHeading
        eyebrow="PREFERENCES & CONNECTION"
        title="Settings"
        sub="Application display, API connection state and current user session."
      />
      <div className="settings-grid">
        <Panel title="Connection" sub="Dashboard gateway adapter state">
          <SettingRow
            label="Data provider"
            value={apiMode === 'mock' ? 'Development mock' : 'API adapter'}
            badge={apiMode === 'mock' ? 'DEMO' : 'API'}
          />
          <SettingRow label="API base URL" value="Same-origin /api gateway" />
          <SettingRow
            label="API connection"
            value={
              apiMode === 'mock'
                ? 'Not contacted in mock mode'
                : auth.sessionState === 'active'
                  ? 'Dashboard session active; module data status is shown on each page'
                  : 'Dashboard session unavailable'
            }
          />
          <SettingRow
            label="API coverage"
            value={
              apiMode === 'mock'
                ? 'Mock demonstration only'
                : 'Authenticated read-only dashboard API; unavailable capabilities are reported per module'
            }
          />
          <SettingRow
            label="Environment"
            value={apiMode === 'mock' ? 'DEMO - sample data' : 'API mode - no demo fallback'}
          />
          <div className="callout">
            <CircleHelp size={15} />
            <span>
              API mode never falls back to sample data. Unavailable backend capabilities are shown
              explicitly. Production access requires the dashboard Google OIDC settings and a
              separately verified testing API; this gateway does not connect to production
              middleware.
            </span>
          </div>
        </Panel>
        <Panel title="Display preferences" sub="Current frontend display settings">
          <SettingRow label="Refresh interval" value={`${refreshIntervalSeconds} seconds`} />
          <SettingRow label="Theme" value="Dark" />
          <p className="help-text">
            Refresh values apply to the configured data provider. Demo mode uses local fixtures and
            makes no API request.
          </p>
        </Panel>
        <Panel title="Current session" sub="Authentication adapter status">
          <div className="session-card">
            <div className="avatar large">AM</div>
            <div>
              <strong>{auth.user?.name ?? 'No user signed in'}</strong>
              <span>{auth.user?.email ?? '—'}</span>
              <Badge status={auth.adapter === 'development-mock' ? 'warning' : 'unknown'}>
                {auth.adapter === 'development-mock'
                  ? 'Development mock session'
                  : auth.adapter === 'google-oidc'
                    ? 'Google OIDC session'
                    : 'Authentication unconfigured'}
              </Badge>
            </div>
          </div>
          <SettingRow label="Role" value={auth.user?.role ?? 'Not supplied'} />
          <SettingRow label="Session source" value={auth.adapter} />
          <button
            className="button secondary"
            onClick={() => {
              void auth
                .logout()
                .then(() => {
                  queryClient.clear()
                  window.location.href = '/login'
                })
                .catch(() => toast.error('Sign out failed. Refresh the session and try again.'))
            }}
          >
            Sign out <LogOut size={14} />
          </button>
          {auth.adapter === 'development-mock' && (
            <div className="session-sim-controls">
              <small>Development-only session states</small>
              <button
                className="button secondary"
                onClick={() => {
                  auth.expireSession()
                  window.location.href = '/login?reason=expired'
                }}
              >
                Simulate session expiry
              </button>
              <button
                className="button secondary"
                onClick={() => {
                  auth.markUnauthorized()
                  window.location.href = '/login?reason=unauthorized'
                }}
              >
                Simulate unauthorized state
              </button>
            </div>
          )}
          <div className="callout amber">
            <ShieldCheck size={15} />
            <span>
              Development mock identity is not authentication and is disabled in production builds.
            </span>
          </div>
        </Panel>
        <Panel title="Version & runtime" sub="Local frontend build">
          <SettingRow label="Application version" value="0.1.0" />
          <SettingRow label="Frontend runtime" value="React 19 · Vite 8" />
          <SettingRow label="Middleware authority" value="External API · read only" />
          <SettingRow label="Last refreshed" value={new Date().toLocaleString()} />
        </Panel>
      </div>
    </>
  )
}
function SettingRow({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      <b>{value}</b>
      {badge && <span className="tiny-badge">{badge}</span>}
    </div>
  )
}

function Login() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const reason = searchParams.get('reason')
  const sessionMessage =
    reason === 'expired'
      ? 'Your session expired. Sign in again when an authentication provider is configured.'
      : reason === 'unauthorized'
        ? 'This session is not authorized to view the requested page.'
        : auth.adapter === 'development-mock'
          ? 'Development-only mock session is active. This is not production authentication.'
          : auth.adapter === 'google-oidc'
            ? (auth.error ?? 'Sign in with your approved Google account to continue.')
            : (auth.error ?? 'Production authentication adapter is not configured.')
  const [signInError, setSignInError] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  return (
    <div className="login-layout">
      <div className="login-art">
        <div className="login-brand">
          <div className="brand-mark">
            <Activity size={19} />
          </div>
          <strong>
            zoho<span>amarco</span>
          </strong>
        </div>
        <div className="login-copy">
          <span className="eyebrow">FISCAL OPERATIONS</span>
          <h1>
            Every transaction.
            <br />
            In clear view.
          </h1>
          <p>
            Monitor fiscalization activity, service health and receipt writeback from one
            operational workspace.
          </p>
          <div className="login-assurance">
            <span>
              <ShieldCheck size={15} /> Read-only operations view
            </span>
            <span>
              <Activity size={15} /> Middleware remains authoritative
            </span>
          </div>
        </div>
        <div className="login-footer">
          ZOHOAMARCO OPERATIONS ·{' '}
          {auth.adapter === 'development-mock' ? 'DEMO WORKSPACE' : 'SECURE WORKSPACE'}
        </div>
      </div>
      <div className="login-form-area">
        <div className="login-form">
          <div className="login-icon">
            <ShieldCheck size={21} />
          </div>
          <span className="eyebrow">WELCOME BACK</span>
          <h2>Sign in to your workspace</h2>
          <p>Dashboard sign-in uses its own Google OIDC session.</p>
          <div className="auth-note">
            <CircleHelp size={15} />
            <span>{sessionMessage}</span>
          </div>
          {signInError && (
            <p className="form-error" role="alert">
              {signInError}
            </p>
          )}
          <button
            className="button primary full"
            disabled={
              signingIn || auth.adapter === 'unconfigured' || auth.sessionState === 'unavailable'
            }
            onClick={async () => {
              setSignInError(null)
              setSigningIn(true)
              try {
                await auth.login()
                if (auth.adapter === 'development-mock') navigate('/overview')
              } catch {
                setSignInError(
                  'Google sign-in could not be started. Check the authentication service and try again.',
                )
              } finally {
                setSigningIn(false)
              }
            }}
          >
            {signingIn
              ? 'Connecting to Google…'
              : auth.adapter === 'development-mock'
                ? 'Continue with development session'
                : auth.adapter === 'google-oidc'
                  ? 'Continue with Google'
                  : 'Authentication is not configured'}{' '}
            <ArrowRight size={16} />
          </button>
          <span className="login-safe">
            <ShieldCheck size={13} /> No password is stored or checked in the browser.
          </span>
          <Link to="/overview" className="back-link">
            Back to dashboard <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [demoData, setDemoData] = useState<DemoData | null>(null)
  const [demoError, setDemoError] = useState(false)

  useEffect(() => {
    if (!import.meta.env.DEV || apiMode !== 'mock') return
    let current = true
    void import('@/mocks/data').then(
      (data) => current && setDemoData(data),
      () => current && setDemoError(true),
    )
    return () => {
      current = false
    }
  }, [])

  if (import.meta.env.DEV && apiMode === 'mock' && !demoData) {
    return (
      <div className="empty-state" role={demoError ? 'alert' : 'status'}>
        <Activity size={20} />
        <strong>{demoError ? 'Demo data could not be loaded' : 'Preparing demo workspace'}</strong>
        <span>
          {demoError ? 'Reload the development app to try again.' : 'Loading local sample data.'}
        </span>
      </div>
    )
  }

  return (
    <DemoDataProvider value={demoData}>
      <Shell />
    </DemoDataProvider>
  )
}

// Retained for compatibility with consumers that embed individual legacy views.
export { Overview, Fiscalization, Device, Writeback, Monitoring, SettingsPage }

// Keep the original demo views available to future migration work while the
// fixture-backed API views become the single rendered implementation.
