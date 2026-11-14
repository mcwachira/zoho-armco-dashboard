import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Download,
  ExternalLink,
  FileCheck2,
  Filter,
  Gauge,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Unplug,
  X,
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import { Link, useLocation } from 'react-router-dom'
import type { GlobalDateRange } from '@/types/dashboard'
import { useAuth } from '@/lib/auth/AuthProvider'
import {
  useDashboardCapabilitiesQuery,
  useDashboardCreditNoteDetailQuery,
  useDashboardCreditNoteListQuery,
  useDashboardDeviceDiagnosticsQuery,
  useDashboardInvoiceDetailQuery,
  useDashboardInvoiceListQuery,
  useDashboardManualReviewQuery,
  useDashboardOverviewQuery,
  useDashboardReconciliationQuery,
  useDashboardServiceHealthQuery,
  useDashboardWritebacksQuery,
} from './queries'
import type {
  DashboardCreditNoteState,
  DashboardCreditNoteWritebackStatus,
  DashboardInvoiceReconciliationStatus,
  DashboardInvoiceTransmissionStatus,
  DashboardInvoiceWritebackFilter,
  DashboardInvoiceStatus,
  DashboardCreditNoteItem,
  DashboardInvoiceItem,
} from './schemas'
import './api-operational-pages.css'

type RecordKind = 'invoice' | 'credit_note'
type SelectedRecord = { kind: RecordKind; id: string }
const localMockApiEnabled = import.meta.env.DEV && import.meta.env.VITE_DATA_MODE === 'mock'

const rangeDuration: Record<GlobalDateRange, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

function dateRange(range: GlobalDateRange) {
  const end = new Date()
  const start = new Date(end.getTime() - rangeDuration[range])
  return { createdFrom: start.toISOString(), createdTo: end.toISOString() }
}

function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function Heading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="page-heading api-page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
      {localMockApiEnabled && (
        <div className="api-source-note api-demo-provenance" role="status">
          DEMO DATA · Local fictional fixtures only. This is not live or persisted middleware data.
        </div>
      )}
      {!localMockApiEnabled && (
        <div className="api-source-note" role="status">
          Data is read through the authenticated dashboard gateway. Features without a supported
          middleware resource are shown as unavailable.
        </div>
      )}
    </div>
  )
}

function Availability({
  title,
  description,
  kind = 'unavailable',
  action,
}: {
  title: string
  description: string
  kind?: 'unavailable' | 'error' | 'loading' | 'empty'
  action?: () => void
}) {
  const Icon = kind === 'error' ? AlertCircle : kind === 'empty' ? Search : Unplug
  return (
    <div className={`api-availability ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon size={20} />
      <strong>{title}</strong>
      <span>{description}</span>
      {action && (
        <button className="button secondary" type="button" onClick={action}>
          <RefreshCw size={13} /> Try again
        </button>
      )}
    </div>
  )
}

function DataState({
  isLoading,
  isError,
  hasData = false,
  error,
  refetch,
}: {
  isLoading: boolean
  isError: boolean
  hasData?: boolean
  error: unknown
  refetch: () => unknown
}) {
  if (isLoading)
    return (
      <Availability
        kind="loading"
        title={localMockApiEnabled ? 'Loading local demo fixtures' : 'Loading dashboard data'}
        description={
          localMockApiEnabled
            ? 'A local fixture response is being validated.'
            : 'The authenticated dashboard read request is in progress.'
        }
      />
    )
  if (isError && hasData)
    return (
      <div className="api-stale-alert" role="status">
        {localMockApiEnabled
          ? 'Fixture refresh failed. Showing the last validated local sample.'
          : 'Refresh failed. Showing the last successful dashboard API response. A manual refresh can retry this safe GET request.'}
      </div>
    )
  if (isError) {
    const message = error instanceof Error ? error.message : 'Dashboard data could not be loaded.'
    return (
      <Availability
        kind="error"
        title="Data unavailable"
        description={message}
        action={() => void refetch()}
      />
    )
  }
  return null
}

export function statusBadgeTone(
  value: string | null | undefined,
): 'good' | 'bad' | 'warn' | 'neutral' {
  const normalized = (value ?? 'unknown').toLowerCase()
  if (/unavailable|not[_ -]?available|fail|reject|error|conflict/.test(normalized)) return 'bad'
  if (/pending|progress|review|unknown|blocked|partial|not_configured|unverified/.test(normalized))
    return 'warn'
  if (/succeed|complete|confirm|fiscalized|available|reachable|ready|accepted/.test(normalized))
    return 'good'
  return 'neutral'
}

function StatusBadge({ value }: { value: string | null | undefined }) {
  const tone = statusBadgeTone(value)
  return (
    <span className={`badge ${tone}`}>
      <i />
      {(value ?? 'unknown').replaceAll('_', ' ')}
    </span>
  )
}

function Panel({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`panel api-panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function Metric({
  label,
  value,
  foot,
  icon: Icon,
}: {
  label: string
  value: string | number
  foot: string
  icon: typeof Gauge
}) {
  return (
    <div className="stat-card api-stat">
      <div className="stat-top">
        <span>{label}</span>
        <Icon size={15} />
      </div>
      <strong className="stat-value">{value}</strong>
      <small>{foot}</small>
    </div>
  )
}

function Freshness({ value }: { value: Date | null | undefined }) {
  return (
    <span className="api-freshness">
      {value ? `Updated ${value.toLocaleTimeString()}` : 'Awaiting first data refresh'}
    </span>
  )
}

function count(values: Record<string, number>, matcher: RegExp) {
  return Object.entries(values).reduce(
    (sum, [key, value]) => sum + (matcher.test(key.toLowerCase()) ? value : 0),
    0,
  )
}

function formatDuration(seconds: number) {
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', `${minutes}m`].filter(Boolean).join(' ')
}

export function ApiOverview({ range }: { range: GlobalDateRange }) {
  const queryRange = useMemo(() => dateRange(range), [range])
  const query = useDashboardOverviewQuery(queryRange)
  const manualReview = useDashboardManualReviewQuery({ page: 1, pageSize: 100 })
  const recentInvoices = useDashboardInvoiceListQuery({ page: 1, pageSize: 25, ...queryRange })
  const recentCreditNotes = useDashboardCreditNoteListQuery({
    page: 1,
    pageSize: 25,
    ...queryRange,
  })
  const health = useDashboardServiceHealthQuery()
  const overview = query.data
  const available = overview?.availability === 'available' ? overview : null
  const allRequests = available
    ? available.metrics.invoices.totalRequests + available.metrics.creditNotes.totalRequests
    : null
  const confirmed = available
    ? available.metrics.invoices.confirmedReceiptCount +
      available.metrics.creditNotes.confirmedReceiptCount
    : null
  const failed = available
    ? count(available.metrics.invoices.requestsByStatus, /failed|unknown/) +
      count(available.metrics.creditNotes.requestsByState, /failed|manual_review/)
    : null
  const writebackFailures = available
    ? count(available.metrics.invoices.writebackByStatus, /failed|unknown/) +
      count(available.metrics.creditNotes.writebackByStatus, /failed|unknown/)
    : null
  const pendingInProgress = available
    ? count(available.metrics.invoices.requestsByStatus, /pending|progress/i) +
      count(available.metrics.creditNotes.requestsByState, /pending|progress/i)
    : null
  const writebackSucceeded = available
    ? count(available.metrics.invoices.writebackByStatus, /^succeeded$/i) +
      count(available.metrics.creditNotes.writebackByStatus, /^succeeded$/i)
    : 0
  const writebackTerminal = available
    ? count(available.metrics.invoices.writebackByStatus, /^(succeeded|failed|outcome_unknown)$/i) +
      count(
        available.metrics.creditNotes.writebackByStatus,
        /^(succeeded|failed|outcome_unknown)$/i,
      )
    : 0
  const writebackSuccessRate =
    available && writebackTerminal > 0
      ? Math.round((writebackSucceeded / writebackTerminal) * 100)
      : null
  const manualReviewCount =
    manualReview.data?.availability === 'partial' ? manualReview.data.items.length : null
  const manualReviewLabel =
    manualReview.data?.availability === 'partial' && manualReview.data.hasMore
      ? `At least ${manualReviewCount}`
      : manualReviewCount === null
        ? 'Unavailable'
        : String(manualReviewCount)
  const recentRequests = [
    ...(recentInvoices.data?.items ?? []).map((item) => ({ ...item, kind: 'invoice' as const })),
    ...(recentCreditNotes.data?.items ?? []).map((item) => ({
      ...item,
      kind: 'credit_note' as const,
    })),
  ]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 6)
  const recentError = recentInvoices.error ?? recentCreditNotes.error
  const recentLoading = recentInvoices.isLoading || recentCreditNotes.isLoading
  const chartData = available
    ? [
        {
          name: 'Invoices',
          Confirmed: available.metrics.invoices.confirmedReceiptCount,
          Other: Math.max(
            0,
            available.metrics.invoices.totalRequests -
              available.metrics.invoices.confirmedReceiptCount,
          ),
        },
        {
          name: 'Credit notes',
          Confirmed: available.metrics.creditNotes.confirmedReceiptCount,
          Other: Math.max(
            0,
            available.metrics.creditNotes.totalRequests -
              available.metrics.creditNotes.confirmedReceiptCount,
          ),
        },
      ]
    : []
  const healthData = health.data

  return (
    <>
      <Heading
        eyebrow="Operational overview"
        title="Overview"
        description={
          localMockApiEnabled
            ? 'Illustrative local fixture aggregates and sample dependency diagnostics.'
            : 'Aggregated persisted fiscalization data and current dependency diagnostics.'
        }
        action={<Freshness value={query.lastUpdatedAt} />}
      />
      <DataState
        isLoading={query.isLoading}
        isError={query.isError}
        hasData={Boolean(query.data)}
        error={query.error}
        refetch={query.refetch}
      />
      <DataState
        isLoading={manualReview.isLoading}
        isError={manualReview.isError}
        hasData={Boolean(manualReview.data)}
        error={manualReview.error}
        refetch={manualReview.refetch}
      />
      {query.data?.availability === 'unavailable' && (
        <Availability title="Overview aggregation unavailable" description={query.data.reason} />
      )}
      {available && (
        <>
          <div className="api-source-note">
            <ShieldCheck size={15} />{' '}
            {localMockApiEnabled
              ? 'Counts are derived from fictional local invoice and credit-note fixtures. Receipt confirmation states are illustrative only. '
              : 'Counts are grouped from persisted invoice and credit-note requests. Receipt success uses confirmed evidence only. '}
            <span>
              {available.range.createdFrom.slice(0, 10)} – {available.range.createdTo.slice(0, 10)}
            </span>
          </div>
          <div className="stat-grid api-stat-grid">
            <Metric
              label="FISCALIZATION REQUESTS"
              value={allRequests ?? '—'}
              foot="Invoice + credit-note requests"
              icon={FileCheck2}
            />
            <Metric
              label="CONFIRMED RECEIPTS"
              value={confirmed ?? '—'}
              foot="Persisted receipt evidence"
              icon={CheckCircle2}
            />
            <Metric
              label="FAILED / UNKNOWN"
              value={failed ?? '—'}
              foot="Failed and uncertain states"
              icon={AlertTriangle}
            />
            <Metric
              label="WRITEBACK ISSUES"
              value={writebackFailures ?? '—'}
              foot={
                localMockApiEnabled
                  ? 'Demo fixture failures or unknown states'
                  : 'Persisted failed or unknown'
              }
              icon={RefreshCw}
            />
            <Metric
              label={localMockApiEnabled ? 'DEMO · PENDING / IN PROGRESS' : 'PENDING / IN PROGRESS'}
              value={pendingInProgress ?? '—'}
              foot="Invoice and credit-note requests with pending or progress states"
              icon={Clock3}
            />
            <Metric
              label={localMockApiEnabled ? 'DEMO · WRITEBACK SUCCESS' : 'WRITEBACK SUCCESS'}
              value={writebackSuccessRate === null ? '—' : `${writebackSuccessRate}%`}
              foot={`Terminal statuses: ${writebackSucceeded} succeeded / ${writebackTerminal} total (succeeded + failed + outcome unknown)`}
              icon={CheckCircle2}
            />
            <Metric
              label={localMockApiEnabled ? 'DEMO · MANUAL REVIEW' : 'MANUAL REVIEW'}
              value={manualReviewLabel}
              foot={
                manualReview.data?.availability === 'partial' && manualReview.data.hasMore
                  ? 'Lower bound from the first 100 unresolved review records'
                  : 'Unresolved review records in this bounded response; API total is unavailable'
              }
              icon={AlertTriangle}
            />
          </div>
          <Panel
            title={localMockApiEnabled ? 'Recent demo requests' : 'Recent requests'}
            subtitle={
              localMockApiEnabled
                ? 'Latest local fixture records by updated time; not a live event feed'
                : 'Latest invoice and credit-note request records by updated time; not a system event feed'
            }
            className="api-recent-activity"
          >
            <DataState
              isLoading={recentLoading && recentRequests.length === 0}
              isError={Boolean(recentError)}
              hasData={recentRequests.length > 0}
              error={recentError}
              refetch={() => {
                void recentInvoices.refetch()
                void recentCreditNotes.refetch()
              }}
            />
            {recentRequests.length > 0 ? (
              <div className="api-recent-list">
                {recentRequests.map((item) => (
                  <div className="api-recent-row" key={`${item.kind}-${item.requestId}`}>
                    <span className="api-recent-type">
                      {item.kind === 'invoice' ? 'Invoice' : 'Credit note'}
                    </span>
                    <span className="api-recent-document">
                      <strong>{item.documentNumber ?? item.requestId}</strong>
                      <small>{item.requestId}</small>
                    </span>
                    <StatusBadge value={item.fiscalizationStatus} />
                    <time dateTime={item.updatedAt}>
                      {new Date(item.updatedAt).toLocaleString()}
                    </time>
                    <Link
                      to="/fiscalization"
                      state={{ requestId: item.requestId, documentType: item.kind }}
                    >
                      View details
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              !recentLoading &&
              !recentError && (
                <Availability
                  kind="empty"
                  title="No recent requests in this range"
                  description="The selected time window has no invoice or credit-note request records."
                />
              )
            )}
          </Panel>
          <div className="api-dashboard-grid">
            <Panel
              title="Confirmed receipts by document type"
              subtitle={
                localMockApiEnabled
                  ? 'Grouped from local fixture requests in the selected range'
                  : 'Grouped from persisted requests in the selected range'
              }
            >
              <div className="api-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 16, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="#283039" vertical={false} />
                    <XAxis dataKey="name" stroke="#89939d" tickLine={false} axisLine={false} />
                    <YAxis
                      allowDecimals={false}
                      stroke="#89939d"
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#161c22',
                        border: '1px solid #303943',
                        borderRadius: 6,
                        color: '#e5e9ed',
                      }}
                    />
                    <Bar dataKey="Confirmed" stackId="a" fill="#56c992" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Other" stackId="a" fill="#39434e" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="api-chart-legend">
                <span>
                  <i className="is-confirmed" /> Confirmed receipt
                </span>
                <span>
                  <i />{' '}
                  {localMockApiEnabled ? 'Other demo fixture states' : 'Other persisted states'}
                </span>
              </div>
              <p className="api-note">
                {localMockApiEnabled
                  ? 'Fixture time-series, transaction value, processing duration, queue depth, events, and complete manual-review totals are intentionally not simulated.'
                  : 'Historical time-series, transaction value, processing duration, uptime, queue depth, events, and total manual-review aggregates are unavailable from current persisted read contracts.'}
              </p>
            </Panel>
            <Panel
              title="Current service diagnostics"
              subtitle="A point-in-time read; it does not represent historical uptime"
            >
              <DataState
                isLoading={health.isLoading}
                isError={health.isError}
                hasData={Boolean(health.data)}
                error={health.error}
                refetch={health.refetch}
              />
              {healthData && (
                <div className="api-health-list">
                  <HealthRow
                    label="Middleware API"
                    value={healthData.middlewareApi.status}
                    detail={`Process uptime ${formatDuration(healthData.middlewareApi.processUptimeSeconds)} · checked ${new Date(healthData.checkedAt).toLocaleString()}`}
                  />
                  <HealthRow
                    label="Gateway"
                    value={healthData.gateway.status}
                    detail={
                      healthData.gateway.lastSuccessfulCommunicationAt
                        ? `Last successful communication ${new Date(healthData.gateway.lastSuccessfulCommunicationAt).toLocaleString()}`
                        : 'Last successful communication unavailable'
                    }
                  />
                  <HealthRow label="Database" value={healthData.database.status} />
                  <HealthRow
                    label="ZFPLabServer endpoint"
                    value={healthData.zfplabserverEndpoint.status}
                  />
                  <HealthRow
                    label="G03 communication"
                    value={healthData.g03Communication.status}
                    detail="A version response is not proof of physical device health."
                  />
                  <HealthRow label="Zoho Books" value={healthData.zohoBooks.status} />
                  <HealthRow label="eTIMS" value={healthData.etims.status} />
                  <HealthRow label="Physical device" value={healthData.physicalDevice.status} />
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  )
}

function HealthRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="api-health-row">
      <span>
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </span>
      <StatusBadge value={value} />
    </div>
  )
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(','))
    .join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
  toast.success('Current authorized page exported as CSV')
}

function recordCsv(items: Array<DashboardInvoiceItem | DashboardCreditNoteItem>) {
  const header = [
    'Document type',
    'Document number',
    'Zoho document ID',
    'Request ID',
    'Amount',
    'Currency',
    'Fiscalization status',
    'Transmission status',
    'CU receipt number',
    'Writeback status',
    'Reconciliation status',
    'Created at',
  ]
  return [
    header,
    ...items.map((row) => [
      row.documentType,
      row.documentNumber ?? '',
      row.zohoDocumentId,
      row.requestId,
      row.amount ?? '',
      row.currency ?? '',
      row.fiscalizationStatus,
      row.transmissionStatus ?? '',
      row.receiptNumber ?? '',
      row.writebackStatus,
      row.reconciliationStatus ?? '',
      row.createdAt,
    ]),
  ]
}

export function ApiFiscalization({ range }: { range: GlobalDateRange }) {
  const location = useLocation()
  const [kind, setKind] = useState<RecordKind>('invoice')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search.trim())
  const [status, setStatus] = useState<'' | DashboardInvoiceStatus | DashboardCreditNoteState>('')
  const [transmission, setTransmission] = useState<'' | DashboardInvoiceTransmissionStatus>('')
  const [reconciliation, setReconciliation] = useState<
    '' | DashboardInvoiceReconciliationStatus | 'NOT_REQUIRED' | 'MANUAL_REVIEW_REQUIRED'
  >('')
  const [writeback, setWriteback] = useState<
    '' | DashboardInvoiceWritebackFilter | DashboardCreditNoteWritebackStatus
  >('')
  const [sort, setSort] = useState<'updated_desc' | 'updated_asc' | 'document_asc' | 'amount_desc'>(
    'updated_desc',
  )
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [selected, setSelected] = useState<SelectedRecord | null>(null)
  const [visibleColumns, setVisibleColumns] = useState({
    document: true,
    zoho: true,
    amount: true,
    fiscalization: true,
    transmission: true,
    receipt: true,
    attempts: true,
    updated: true,
  })
  const windowRange = useMemo(() => dateRange(range), [range])
  useEffect(
    () => setPage(1),
    [kind, debouncedSearch, status, transmission, reconciliation, writeback, range, pageSize],
  )
  const invoices = useDashboardInvoiceListQuery(
    {
      page,
      pageSize,
      search: debouncedSearch || undefined,
      status: status ? (status as DashboardInvoiceStatus) : undefined,
      transmissionStatus: transmission || undefined,
      reconciliationStatus:
        reconciliation && !['NOT_REQUIRED', 'MANUAL_REVIEW_REQUIRED'].includes(reconciliation)
          ? (reconciliation as DashboardInvoiceReconciliationStatus)
          : undefined,
      writebackStatus: writeback ? (writeback as DashboardInvoiceWritebackFilter) : undefined,
      ...windowRange,
    },
    kind === 'invoice',
  )
  const creditNotes = useDashboardCreditNoteListQuery(
    {
      page,
      pageSize,
      search: debouncedSearch || undefined,
      state: status ? (status as DashboardCreditNoteState) : undefined,
      reconciliationState: reconciliation ? reconciliation.toUpperCase() : undefined,
      writebackState: writeback
        ? writeback === 'not_attempted'
          ? 'NOT_STARTED'
          : writeback.toUpperCase()
        : undefined,
      ...windowRange,
    },
    kind === 'credit_note',
  )
  const sourceRows = kind === 'invoice' ? invoices.data?.items : creditNotes.data?.items
  const rows = sourceRows?.slice().sort((a, b) => {
    if (sort === 'updated_asc') return Date.parse(a.updatedAt) - Date.parse(b.updatedAt)
    if (sort === 'document_asc')
      return (a.documentNumber ?? '').localeCompare(b.documentNumber ?? '')
    if (sort === 'amount_desc') return Number(b.amount ?? 0) - Number(a.amount ?? 0)
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
  })
  const current = kind === 'invoice' ? invoices : creditNotes
  const total = kind === 'invoice' ? (invoices.data?.total ?? 0) : (creditNotes.data?.total ?? 0)
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const reconciliationOptions =
    kind === 'invoice'
      ? [
          'not_configured',
          'blocked',
          'pending',
          'in_progress',
          'accepted',
          'rejected',
          'outcome_unknown',
          'reconciliation_required',
          'reconciling',
        ]
      : [
          'NOT_REQUIRED',
          'PENDING',
          'CONFIRMED',
          'RECONCILIATION_REQUIRED',
          'RECONCILING',
          'CONFLICT',
          'MANUAL_REVIEW_REQUIRED',
        ]
  const writebackOptions =
    kind === 'invoice'
      ? ['not_attempted', 'in_progress', 'succeeded', 'failed', 'outcome_unknown']
      : ['not_attempted', 'pending', 'in_progress', 'succeeded', 'failed', 'outcome_unknown']

  useEffect(() => {
    const state = location.state as { requestId?: string; documentType?: RecordKind } | null
    if (state?.requestId)
      setSelected({ id: state.requestId, kind: state.documentType ?? 'invoice' })
  }, [location.state])

  const exportRows = rows ?? []
  return (
    <>
      <Heading
        eyebrow="Transaction operations"
        title="Fiscalization"
        description={
          localMockApiEnabled
            ? 'Illustrative invoice and credit-note requests with sample evidence and processing history.'
            : 'Invoice and credit-note requests, confirmation evidence, and persisted processing history.'
        }
        action={<Freshness value={current.lastUpdatedAt} />}
      />
      <div className="api-source-note">
        <ShieldCheck size={15} />{' '}
        {localMockApiEnabled
          ? 'Local fictional fixtures only. Sample accepted or processing states are not live receipts.'
          : 'Read-only data from the authenticated dashboard API. Accepted or processing states are never treated as confirmed receipts.'}
      </div>
      <Panel
        title="Fiscalization requests"
        subtitle={`${total.toLocaleString()} matching ${kind === 'invoice' ? 'invoice' : 'credit-note'} records`}
        className="api-table-panel"
      >
        <div className="api-toolbar">
          <div className="api-tabs" role="tablist" aria-label="Document type">
            <button
              role="tab"
              aria-selected={kind === 'invoice'}
              className={kind === 'invoice' ? 'selected' : ''}
              onClick={() => {
                setKind('invoice')
                setStatus('')
                setTransmission('')
                setReconciliation('')
                setWriteback('')
              }}
            >
              Invoices
            </button>
            <button
              role="tab"
              aria-selected={kind === 'credit_note'}
              className={kind === 'credit_note' ? 'selected' : ''}
              onClick={() => {
                setKind('credit_note')
                setStatus('')
                setTransmission('')
                setReconciliation('')
                setWriteback('')
              }}
            >
              Credit notes
            </button>
          </div>
          <label className="api-search">
            <Search size={15} />
            <input
              aria-label="Search records"
              placeholder="Document number, Zoho ID or request ID"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="api-filter">
            <Filter size={14} />
            <select
              aria-label="Fiscalization status"
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
            >
              <option value="">All statuses</option>
              {(kind === 'invoice'
                ? ['Pending', 'InProgress', 'Succeeded', 'Failed', 'OutcomeUnknown']
                : [
                    'PENDING',
                    'IN_PROGRESS',
                    'FISCALIZED',
                    'COMPLETED',
                    'FAILED',
                    'MANUAL_REVIEW_REQUIRED',
                    'RECONCILIATION_REQUIRED',
                    'WRITEBACK_PENDING',
                  ]
              ).map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          {kind === 'invoice' && (
            <label className="api-filter">
              <span>Transmission</span>
              <select
                aria-label="Transmission status"
                value={transmission}
                onChange={(event) => setTransmission(event.target.value as typeof transmission)}
              >
                <option value="">All</option>
                <option value="TRANSMISSION_PENDING">Pending</option>
                <option value="TRANSMISSION_CONFIRMED">Confirmed</option>
              </select>
            </label>
          )}
          <label className="api-filter">
            <span>Reconciliation</span>
            <select
              aria-label="Reconciliation status"
              value={reconciliation}
              onChange={(event) => setReconciliation(event.target.value as typeof reconciliation)}
            >
              <option value="">All</option>
              {reconciliationOptions.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="api-filter">
            <span>Writeback</span>
            <select
              aria-label="Writeback status"
              value={writeback}
              onChange={(event) => setWriteback(event.target.value as typeof writeback)}
            >
              <option value="">All</option>
              {writebackOptions.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="api-filter">
            <span>Rows</span>
            <select
              aria-label="Rows per page"
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <label className="api-filter">
            <span>Sort loaded page</span>
            <select
              aria-label="Sort current page"
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
            >
              <option value="updated_desc">Most recently updated</option>
              <option value="updated_asc">Least recently updated</option>
              <option value="document_asc">Document number</option>
              <option value="amount_desc">Amount (high to low)</option>
            </select>
          </label>
          <details className="api-column-menu">
            <summary>Columns</summary>
            <div role="group" aria-label="Visible fiscalization columns">
              {Object.entries({
                document: 'Document',
                zoho: 'Zoho ID / customer',
                amount: 'Amount',
                fiscalization: 'Fiscalization',
                transmission: 'Transmission',
                receipt: 'CU receipt',
                attempts: 'Attempts',
                updated: 'Updated',
              }).map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={visibleColumns[key as keyof typeof visibleColumns]}
                    onChange={(event) =>
                      setVisibleColumns((current) => ({ ...current, [key]: event.target.checked }))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </details>
          <button
            className="button secondary api-export"
            onClick={() => downloadCsv('zohoamarco-fiscalization-page.csv', recordCsv(exportRows))}
            disabled={!exportRows.length}
          >
            <Download size={14} /> Export page
          </button>
        </div>
        {kind === 'invoice' && transmission && (
          <p className="api-note" role="status">
            {localMockApiEnabled
              ? 'This demo filter matches sample invoice transmission fields.'
              : 'This filter matches the persisted invoice transmission status. Some legacy rows display a status derived from validated receipt evidence and may not match until the middleware exposes a normalized status filter.'}
          </p>
        )}
        {current.isLoading || (current.isError && !current.data) ? (
          <DataState
            isLoading={current.isLoading}
            isError={current.isError}
            error={current.error}
            refetch={current.refetch}
          />
        ) : (
          <>
            <DataState
              isLoading={false}
              isError={current.isError}
              hasData={Boolean(current.data)}
              error={current.error}
              refetch={current.refetch}
            />
            {rows?.length ? (
              <>
                <div className="table-wrap api-table-wrap">
                  <table className="data-table api-data-table">
                    <thead>
                      <tr>
                        {visibleColumns.document && <th>DOCUMENT</th>}
                        {visibleColumns.zoho && <th>ZOHO ID / CUSTOMER</th>}
                        {visibleColumns.amount && <th>AMOUNT</th>}
                        {visibleColumns.fiscalization && <th>FISCALIZATION</th>}
                        {visibleColumns.transmission && <th>TRANSMISSION</th>}
                        {visibleColumns.receipt && <th>CU RECEIPT</th>}
                        {visibleColumns.attempts && <th>ATTEMPTS</th>}
                        {visibleColumns.updated && <th>UPDATED</th>}
                        <th>DETAIL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr
                          key={row.requestId}
                          className="api-click-row"
                          onClick={() => setSelected({ kind, id: row.requestId })}
                          tabIndex={0}
                          onKeyDown={(event) =>
                            event.key === 'Enter' && setSelected({ kind, id: row.requestId })
                          }
                        >
                          {visibleColumns.document && (
                            <td>
                              <strong>{row.documentNumber ?? 'Number unavailable'}</strong>
                              <small>
                                {row.documentType.replace('_', ' ')} · {row.requestId}
                              </small>
                            </td>
                          )}
                          {visibleColumns.zoho && (
                            <td>
                              <strong>{row.zohoDocumentId}</strong>
                              <small>
                                {row.customerName ??
                                  (row.documentType === 'credit_note'
                                    ? 'Customer not persisted'
                                    : 'Customer unavailable')}
                                {row.documentType === 'credit_note' &&
                                row.originalInvoice.invoiceNumber
                                  ? ` · against ${row.originalInvoice.invoiceNumber}`
                                  : ''}
                              </small>
                            </td>
                          )}
                          {visibleColumns.amount && (
                            <td className="amount">{formatAmount(row.amount, row.currency)}</td>
                          )}
                          {visibleColumns.fiscalization && (
                            <td>
                              <StatusBadge value={row.fiscalizationStatus} />
                              <small>
                                {row.confirmedReceiptEvidence
                                  ? 'Receipt evidence persisted'
                                  : 'No confirmed receipt evidence'}
                              </small>
                            </td>
                          )}
                          {visibleColumns.transmission && (
                            <td>
                              <StatusBadge value={row.transmissionStatus} />
                            </td>
                          )}
                          {visibleColumns.receipt && (
                            <td>
                              {row.receiptNumber ?? (
                                <span className="api-muted">Not confirmed</span>
                              )}
                            </td>
                          )}
                          {visibleColumns.attempts && <td>{row.attemptCount}</td>}
                          {visibleColumns.updated && (
                            <td>{new Date(row.updatedAt).toLocaleString()}</td>
                          )}
                          <td>
                            <button
                              className="icon-button"
                              aria-label={`Open ${row.documentNumber ?? row.requestId}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                setSelected({ kind, id: row.requestId })
                              }}
                            >
                              <ExternalLink size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={page}
                  pages={pages}
                  pageSize={pageSize}
                  total={total}
                  onPage={setPage}
                />
              </>
            ) : (
              <Availability
                kind="empty"
                title="No matching requests"
                description={
                  localMockApiEnabled
                    ? 'No local demo fixtures match the selected date range and filters.'
                    : 'No persisted records match the selected date range and filters.'
                }
              />
            )}
          </>
        )}
      </Panel>
      <AnimatePresence>
        {selected && <RecordDrawer selected={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </>
  )
}

function formatAmount(amount: string | null, currency: string | null) {
  if (!amount) return '—'
  return `${currency ?? ''} ${amount}`.trim()
}

function Pagination({
  page,
  pages,
  pageSize,
  total,
  onPage,
}: {
  page: number
  pages: number
  pageSize: number
  total: number
  onPage: (page: number) => void
}) {
  return (
    <div className="api-pagination">
      <span>
        Showing {total ? ((page - 1) * pageSize + 1).toLocaleString() : 0}–
        {Math.min(page * pageSize, total).toLocaleString()} of {total.toLocaleString()}
      </span>
      <div>
        <button
          className="icon-button"
          aria-label="Previous page"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          <ChevronLeft size={16} />
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button
          className="icon-button"
          aria-label="Next page"
          onClick={() => onPage(Math.min(pages, page + 1))}
          disabled={page >= pages}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

function ManualReviewPagination({
  page,
  hasMore,
  itemCount,
  onPage,
}: {
  page: number
  hasMore: boolean
  itemCount: number
  onPage: (page: number) => void
}) {
  return (
    <div className="api-pagination">
      <span>
        Page {page} · {itemCount} cases shown · total unavailable
      </span>
      <div>
        <button
          className="icon-button"
          aria-label="Previous manual-review page"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          <ChevronLeft size={16} />
        </button>
        <span>Page {page}</span>
        <button
          className="icon-button"
          aria-label="Next manual-review page"
          onClick={() => onPage(page + 1)}
          disabled={!hasMore}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

function copy(value: string) {
  void navigator.clipboard
    .writeText(value)
    .then(() => toast.success('Copied to clipboard'))
    .catch(() => toast.error('Clipboard access is unavailable'))
}

function RecordDrawer({ selected, onClose }: { selected: SelectedRecord; onClose: () => void }) {
  const invoice = useDashboardInvoiceDetailQuery(selected.kind === 'invoice' ? selected.id : '')
  const credit = useDashboardCreditNoteDetailQuery(
    selected.kind === 'credit_note' ? selected.id : '',
  )
  const query = selected.kind === 'invoice' ? invoice : credit
  const request = query.data?.request
  const dialogRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
    focusable()[0]?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
      if (event.key === 'Tab') {
        const elements = focusable()
        if (elements.length === 0) return
        if (event.shiftKey && document.activeElement === elements[0]) {
          event.preventDefault()
          elements.at(-1)?.focus()
        } else if (!event.shiftKey && document.activeElement === elements.at(-1)) {
          event.preventDefault()
          elements[0]?.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [onClose])
  return (
    <motion.div
      className="drawer-backdrop"
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <motion.aside
        ref={dialogRef}
        className="detail-drawer api-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-record-title"
        initial={{ x: 40 }}
        animate={{ x: 0 }}
        exit={{ x: 40 }}
        transition={{ duration: 0.18 }}
      >
        <div className="drawer-head">
          <div>
            <span className="eyebrow">
              {localMockApiEnabled ? 'DEMO REQUEST DETAIL' : 'Persisted request detail'}
            </span>
            <h2 id="api-record-title">{request?.documentNumber ?? selected.id}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close details">
            <X size={17} />
          </button>
        </div>
        <div className="drawer-scroll">
          <DataState
            isLoading={query.isLoading}
            isError={query.isError}
            hasData={Boolean(query.data)}
            error={query.error}
            refetch={query.refetch}
          />
          {!query.isError && !query.isLoading && request && (
            <>
              <div className="api-detail-summary">
                <StatusBadge value={request.fiscalizationStatus} />
                <StatusBadge value={request.writebackStatus} />
                <div>
                  <span>Request ID</span>
                  <button onClick={() => copy(request.requestId)}>
                    <code>{request.requestId}</code>
                    <Clipboard size={13} />
                  </button>
                </div>
                <div>
                  <span>Zoho document</span>
                  <button onClick={() => copy(request.zohoDocumentId)}>
                    <code>{request.zohoDocumentId}</code>
                    <Clipboard size={13} />
                  </button>
                </div>
              </div>
              <DetailSection title="Document & processing">
                <DetailLine label="Type" value={selected.kind.replace('_', ' ')} />
                <DetailLine label="Amount" value={formatAmount(request.amount, request.currency)} />
                <DetailLine label="Created" value={new Date(request.createdAt).toLocaleString()} />
                <DetailLine label="Updated" value={new Date(request.updatedAt).toLocaleString()} />
                <DetailLine
                  label="Fiscalized at"
                  value={
                    request.fiscalizedAt
                      ? new Date(request.fiscalizedAt).toLocaleString()
                      : 'Not confirmed'
                  }
                />
                <DetailLine
                  label="Reconciliation"
                  value={request.reconciliationStatus ?? 'Unavailable'}
                />
                <DetailLine
                  label="Transmission"
                  value={request.transmissionStatus ?? 'Unavailable'}
                />
              </DetailSection>
              {selected.kind === 'invoice' ? (
                <InvoiceDetail request={request as NonNullable<typeof invoice.data>['request']} />
              ) : (
                <CreditNoteDetail request={request as NonNullable<typeof credit.data>['request']} />
              )}
              <DetailSection title="Validation evidence">
                <span className="api-muted">
                  The middleware contract does not expose a separate persisted validation-result
                  collection.
                </span>
              </DetailSection>
              <DetailSection title="Attempt history">
                {request.attempts.length ? (
                  request.attempts.map((attempt) => (
                    <article className="api-attempt-card" key={attempt.attemptNumber}>
                      <div className="api-review-top">
                        <strong>
                          Attempt {attempt.attemptNumber}
                          {'stage' in attempt && attempt.stage ? ` · ${attempt.stage}` : ''}
                        </strong>
                        <StatusBadge
                          value={'outcome' in attempt ? attempt.outcome : attempt.status}
                        />
                      </div>
                      <DetailLine
                        label="Started"
                        value={new Date(attempt.startedAt).toLocaleString()}
                      />
                      <DetailLine
                        label="Completed"
                        value={
                          attempt.completedAt
                            ? new Date(attempt.completedAt).toLocaleString()
                            : 'Not completed'
                        }
                      />
                      {'errorCode' in attempt ? (
                        <>
                          <DetailLine label="Error code" value={attempt.errorCode ?? 'None'} />
                          <DetailLine label="Error detail" value={attempt.errorMessage ?? 'None'} />
                          {attempt.receiptNumber && (
                            <DetailLine
                              label="Attempt receipt"
                              value={attempt.receiptNumber}
                              copyValue={attempt.receiptNumber}
                            />
                          )}
                        </>
                      ) : (
                        <>
                          <DetailLine
                            label="Error category"
                            value={attempt.errorCategory ?? 'None'}
                          />
                          <DetailLine label="Error detail" value={attempt.errorDetails ?? 'None'} />
                          {attempt.deviceEvidence.map((evidence, index) => (
                            <DetailLine
                              key={`${attempt.attemptNumber}-${index}`}
                              label={evidence.command ?? evidence.stage ?? 'G03 command'}
                              value={`${evidence.status ?? 'unknown'}${evidence.errorCategory ? ` · ${evidence.errorCategory}` : ''}`}
                            />
                          ))}
                        </>
                      )}
                    </article>
                  ))
                ) : (
                  <span className="api-muted">No persisted attempts.</span>
                )}
              </DetailSection>
              {request.lastError && (
                <div className="api-error-evidence">
                  <AlertCircle size={15} />
                  <div>
                    <strong>{request.lastError.code}</strong>
                    <p>{request.lastError.message}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </motion.aside>
    </motion.div>
  )
}

function InvoiceDetail({
  request,
}: {
  request: NonNullable<ReturnType<typeof useDashboardInvoiceDetailQuery>['data']>['request']
}) {
  return (
    <>
      <DetailSection title="Original invoice snapshot">
        {request.snapshot ? (
          <>
            <DetailLine
              label="Invoice number"
              value={request.snapshot.invoice.invoiceNumber ?? 'Unavailable'}
            />
            <DetailLine
              label="Invoice date"
              value={request.snapshot.invoice.date ?? 'Unavailable'}
            />
            <DetailLine label="Currency" value={request.snapshot.invoice.currency} />
            <DetailLine label="Subtotal" value={request.snapshot.invoice.subtotal} />
            <DetailLine label="Tax total" value={request.snapshot.invoice.taxTotal} />
            <DetailLine label="Total" value={request.snapshot.invoice.total} />
            <SnapshotLines
              lines={request.snapshot.invoice.lines.map((line) => ({
                name: line.description ?? line.itemName ?? 'Unnamed line',
                quantity: line.quantity,
                rate: line.unitPrice,
                total: line.lineTotal,
              }))}
            />
          </>
        ) : (
          <span className="api-muted">No invoice snapshot was persisted.</span>
        )}
      </DetailSection>
      <DetailSection title="Confirmed receipt evidence">
        {request.evidence ? (
          <>
            <DetailLine
              label="CU serial"
              value={request.evidence.cuSerialNumber}
              copyValue={request.evidence.cuSerialNumber}
            />
            <DetailLine label="CU invoice" value={request.evidence.cuInvoiceNumber} />
            <DetailLine
              label="CU receipt"
              value={request.evidence.cuReceiptNumber}
              copyValue={request.evidence.cuReceiptNumber}
            />
            <DetailLine
              label="Evidence time"
              value={new Date(request.evidence.fiscalizedAtUtc).toLocaleString()}
            />
            <DetailLine
              label="Evidence source"
              value="Tremol G03 persisted electronic journal + close receipt"
            />
            <a
              className="api-link"
              href={request.evidence.qrVerificationUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open persisted QR verification URL <ExternalLink size={13} />
            </a>
          </>
        ) : (
          <Availability
            title="No confirmed receipt evidence"
            description="A request status alone does not confirm a fiscal receipt."
          />
        )}
      </DetailSection>
      <DetailSection title="Zoho writeback">
        <DetailLine label="Status" value={request.writeback?.status ?? request.writebackStatus} />
        <DetailLine
          label="Written custom fields"
          value={
            request.writeback?.writtenCustomFieldIds.join(', ') ||
            'No successful field list persisted'
          }
        />
        <DetailLine
          label="Fields not written"
          value="No per-field failure list is exposed by the middleware contract."
        />
        <DetailLine label="Attempts" value={String(request.writeback?.retryCount ?? 0)} />
        <DetailLine
          label="Last update"
          value={
            request.writeback
              ? new Date(request.writeback.updatedAt).toLocaleString()
              : 'No writeback operation persisted'
          }
        />
        <DetailLine
          label="Error category"
          value={request.writeback?.errorCategory ?? 'None persisted'}
        />
      </DetailSection>
      <DetailSection title="eTIMS reconciliation">
        <DetailLine label="Status" value={request.etims?.status ?? 'Not available'} />
        <DetailLine
          label="Reconciliation required"
          value={request.etims ? String(request.etims.reconciliationRequired) : 'Unknown'}
        />
      </DetailSection>
      <DetailSection title="Manual review">
        {request.manualReview ? (
          <>
            <DetailLine label="Case" value={request.manualReview.caseId} />
            <DetailLine label="State" value={request.manualReview.status} />
            <DetailLine label="Reason" value={request.manualReview.reason} />
            {request.manualReview.decisions.map((decision) => (
              <div className="api-timeline-item" key={decision.sequence}>
                <time>{new Date(decision.recordedAt).toLocaleString()}</time>
                <strong>{decision.resolution}</strong>
                <span>{decision.reason}</span>
              </div>
            ))}
          </>
        ) : (
          <span className="api-muted">No manual-review case recorded.</span>
        )}
      </DetailSection>
      <DetailSection title="Request timeline">
        <Timeline
          items={request.timeline.map((event) => ({
            at: event.timestamp,
            title: event.event,
            detail: event.status,
            status: event.status,
          }))}
        />
      </DetailSection>
    </>
  )
}

function CreditNoteDetail({
  request,
}: {
  request: NonNullable<ReturnType<typeof useDashboardCreditNoteDetailQuery>['data']>['request']
}) {
  return (
    <>
      <DetailSection title="Credit-note request snapshot">
        <DetailLine
          label="Credit-note number"
          value={request.snapshot.documentNumber ?? 'Unavailable'}
        />
        <DetailLine label="Date" value={request.snapshot.date ?? 'Unavailable'} />
        <DetailLine label="Currency" value={request.snapshot.currency ?? 'Unavailable'} />
        <DetailLine label="Subtotal" value={request.snapshot.subtotal ?? 'Unavailable'} />
        <DetailLine label="Tax total" value={request.snapshot.taxTotal ?? 'Unavailable'} />
        <DetailLine label="Total" value={request.snapshot.amount ?? 'Unavailable'} />
        <SnapshotLines
          lines={request.snapshot.lines.map((line) => ({
            name: line.name ?? 'Unnamed line',
            quantity: line.quantity ?? '—',
            rate: line.rate ?? '—',
            total: line.lineAmount ?? '—',
          }))}
        />
      </DetailSection>
      <DetailSection title="Original invoice relationship">
        <DetailLine
          label="Invoice number"
          value={request.originalInvoice.invoiceNumber ?? 'Unavailable'}
        />
        <DetailLine
          label="Zoho invoice ID"
          value={request.originalInvoice.zohoInvoiceId ?? 'Unavailable'}
        />
        <DetailLine
          label="Original CU receipt"
          value={request.originalInvoice.cuReceiptNumber ?? 'Unavailable'}
        />
      </DetailSection>
      <DetailSection title="Confirmed credit-note receipt">
        {request.evidence ? (
          <>
            <DetailLine
              label="CU serial"
              value={request.evidence.cuSerialNumber ?? 'Unavailable'}
              copyValue={request.evidence.cuSerialNumber ?? undefined}
            />
            <DetailLine
              label="CU receipt"
              value={request.evidence.receiptNumber}
              copyValue={request.evidence.receiptNumber}
            />
            <DetailLine
              label="Confirmed at"
              value={new Date(request.evidence.fiscalizedAt).toLocaleString()}
            />
            <a className="api-link" href={request.evidence.qrCode} target="_blank" rel="noreferrer">
              Open persisted QR verification URL <ExternalLink size={13} />
            </a>
          </>
        ) : (
          <Availability
            title="No confirmed receipt evidence"
            description="Receipt number and QR are shown only when persisted evidence exists."
          />
        )}
      </DetailSection>
      <DetailSection title="Zoho writeback">
        <DetailLine label="Status" value={request.writeback?.status ?? request.writebackStatus} />
        <DetailLine
          label="Written custom fields"
          value={
            request.writeback?.writtenCustomFieldIds.join(', ') ||
            'No successful field list persisted'
          }
        />
        <DetailLine
          label="Fields not written"
          value="No per-field failure list is exposed by the middleware contract."
        />
        <DetailLine
          label="Last update"
          value={
            request.writeback
              ? new Date(request.writeback.updatedAt).toLocaleString()
              : 'No writeback operation persisted'
          }
        />
        <DetailLine
          label="Error category"
          value={request.writeback?.errorCategory ?? 'None persisted'}
        />
      </DetailSection>
      <DetailSection title="Persisted diagnostics">
        {request.diagnostics.length ? (
          request.diagnostics.map((entry, index) => (
            <div className="api-timeline-item" key={entry.id ?? index}>
              <time>
                {entry.collectedAt
                  ? new Date(entry.collectedAt).toLocaleString()
                  : 'Timestamp unavailable'}
              </time>
              <strong>{entry.kind ?? entry.classification ?? 'Diagnostic'}</strong>
              <span>
                {entry.hasPersistedEvidence
                  ? 'Persisted evidence available'
                  : 'No persisted command evidence'}
              </span>
            </div>
          ))
        ) : (
          <span className="api-muted">No diagnostic records persisted.</span>
        )}
      </DetailSection>
      <DetailSection title="Persisted request timeline">
        <Timeline
          items={[
            {
              at: request.createdAt,
              title: 'Request received',
              detail: 'Persisted credit-note request',
              status: 'persisted',
            },
            ...request.attempts.map((attempt) => ({
              at: attempt.startedAt,
              title: `Device attempt ${attempt.attemptNumber}${attempt.stage ? ` · ${attempt.stage}` : ''}`,
              detail: attempt.errorCategory ?? attempt.errorDetails ?? attempt.status,
              status: attempt.status,
            })),
            ...(request.evidence
              ? [
                  {
                    at: request.evidence.fiscalizedAt,
                    title: 'Receipt evidence confirmed',
                    detail: request.evidence.receiptNumber,
                    status: 'confirmed',
                  },
                ]
              : []),
            ...(request.writeback?.completedAt
              ? [
                  {
                    at: request.writeback.completedAt,
                    title: 'Zoho writeback completed',
                    detail: request.writeback.status,
                    status: request.writeback.status,
                  },
                ]
              : []),
          ]}
        />
      </DetailSection>
    </>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="api-detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function DetailLine({
  label,
  value,
  copyValue,
}: {
  label: string
  value: string
  copyValue?: string
}) {
  return (
    <div className="api-detail-line">
      <span>{label}</span>
      <strong>{value || 'Unavailable'}</strong>
      {copyValue && (
        <button onClick={() => copy(copyValue)} aria-label={`Copy ${label}`}>
          <Clipboard size={13} />
        </button>
      )}
    </div>
  )
}

function SnapshotLines({
  lines,
}: {
  lines: Array<{ name: string; quantity: string; rate: string; total: string }>
}) {
  return (
    <div className="api-snapshot-lines">
      <div>
        <strong>Line item</strong>
        <strong>Qty</strong>
        <strong>Rate</strong>
        <strong>Total</strong>
      </div>
      {lines.map((line, index) => (
        <div key={`${line.name}-${index}`}>
          <span title={line.name}>{line.name}</span>
          <span>{line.quantity}</span>
          <span>{line.rate}</span>
          <strong>{line.total}</strong>
        </div>
      ))}
    </div>
  )
}

function Timeline({
  items,
}: {
  items: Array<{ at: string; title: string; detail: string; status: string }>
}) {
  return items.length ? (
    <div className="api-timeline">
      {items
        .slice()
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
        .map((item, index) => (
          <div className="api-timeline-item" key={`${item.at}-${index}`}>
            <time>{new Date(item.at).toLocaleString()}</time>
            <strong>{item.title}</strong>
            <span>{item.detail}</span>
          </div>
        ))}
    </div>
  ) : (
    <span className="api-muted">No persisted timeline events.</span>
  )
}

export function ApiDevice() {
  const device = useDashboardDeviceDiagnosticsQuery()
  const services = useDashboardServiceHealthQuery()
  return (
    <>
      <Heading
        eyebrow="Infrastructure"
        title="G03 Device"
        description="Read-only endpoint diagnostics with device health and fiscal readiness kept explicitly separate."
      />
      <div className="api-source-note">
        <ShieldAlert size={15} /> Network reachability is not physical device health, KRA/eTIMS
        pairing, or fiscalization readiness.
      </div>
      <div className="api-dashboard-grid">
        <Panel title="Device diagnostics" subtitle="Current middleware diagnostic snapshot">
          <DataState
            isLoading={device.isLoading}
            isError={device.isError}
            error={device.error}
            refetch={device.refetch}
          />
          {device.data && (
            <div className="api-health-list">
              <HealthRow
                label="ZFPLabServer endpoint"
                value={device.data.endpointReachability.status}
                detail={
                  device.data.checkedAt
                    ? `Checked ${new Date(device.data.checkedAt).toLocaleString()}`
                    : 'No check timestamp'
                }
              />
              <HealthRow label="Physical device health" value={device.data.physicalHealth.status} />
              <HealthRow
                label="Fiscalization readiness"
                value={device.data.fiscalizationReadiness.status}
              />
              <HealthRow label="eTIMS pairing" value={device.data.etimsPairing.status} />
              <HealthRow
                label="Device identity / version"
                value={device.data.deviceIdentity.status}
                detail={device.data.deviceIdentity.reason}
              />
              <HealthRow label="Serial number" value={device.data.serialNumber ?? 'unavailable'} />
              <HealthRow
                label="Last communication"
                value={device.data.lastCommunication.status}
                detail={
                  device.data.lastCommunication.lastCommunicationAt
                    ? new Date(device.data.lastCommunication.lastCommunicationAt).toLocaleString()
                    : 'No communication timestamp is exposed'
                }
              />
              <HealthRow label="Health history" value={device.data.healthHistory.status} />
            </div>
          )}
        </Panel>
        <Panel
          title="Middleware dependencies"
          subtitle="Current database check and process-local metrics"
        >
          <DataState
            isLoading={services.isLoading}
            isError={services.isError}
            error={services.error}
            refetch={services.refetch}
          />
          {services.data && (
            <div className="api-health-list">
              <HealthRow
                label="Middleware API"
                value={services.data.middlewareApi.status}
                detail={`Current process uptime ${formatDuration(services.data.middlewareApi.processUptimeSeconds)}`}
              />
              <HealthRow label="Database" value={services.data.database.status} />
              <HealthRow
                label="ZFPLabServer endpoint"
                value={services.data.zfplabserverEndpoint.status}
                detail="Not probed by dashboard requests to avoid device commands."
              />
              <HealthRow
                label="G03 communication"
                value={services.data.g03Communication.status}
                detail="Not probed by dashboard requests."
              />
              <HealthRow label="Physical device" value={services.data.physicalDevice.status} />
              <HealthRow label="Zoho Books" value={services.data.zohoBooks.status} />
              <HealthRow label="eTIMS" value={services.data.etims.status} />
              <HealthRow label="Historical middleware uptime" value="unavailable" />
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}

type WritebackRow = { kind: RecordKind; row: DashboardInvoiceItem | DashboardCreditNoteItem }
export function ApiWriteback({ range }: { range: GlobalDateRange }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<
    '' | DashboardInvoiceWritebackFilter | DashboardCreditNoteWritebackStatus
  >('')
  const [kind, setKind] = useState<'all' | RecordKind>('all')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<SelectedRecord | null>(null)
  const searchValue = useDebounced(search.trim())
  const windowRange = useMemo(() => dateRange(range), [range])
  useEffect(() => setPage(1), [searchValue, status, kind, range])
  // A merged cross-type page needs a shared backend ordering contract. Until
  // that exists, the all-types view shows the first authorized page from each source;
  // choosing a document type enables truthful server pagination.
  const requestPage = kind === 'all' ? 1 : page
  const invoices = useDashboardInvoiceListQuery(
    {
      page: requestPage,
      pageSize: 25,
      search: searchValue || undefined,
      writebackStatus: status ? (status as DashboardInvoiceWritebackFilter) : undefined,
      ...windowRange,
    },
    kind !== 'credit_note',
  )
  const creditNotes = useDashboardCreditNoteListQuery(
    {
      page: requestPage,
      pageSize: 25,
      search: searchValue || undefined,
      writebackState: status
        ? status === 'not_attempted'
          ? 'NOT_STARTED'
          : status.toUpperCase()
        : undefined,
      ...windowRange,
    },
    kind !== 'invoice',
  )
  const records: WritebackRow[] = [
    ...(kind !== 'credit_note'
      ? (invoices.data?.items ?? []).map((row) => ({ kind: 'invoice' as const, row }))
      : []),
    ...(kind !== 'invoice'
      ? (creditNotes.data?.items ?? []).map((row) => ({ kind: 'credit_note' as const, row }))
      : []),
  ].sort((a, b) => Date.parse(b.row.updatedAt) - Date.parse(a.row.updatedAt))
  const loading =
    (kind !== 'credit_note' && invoices.isLoading) || (kind !== 'invoice' && creditNotes.isLoading)
  const invoiceError = kind !== 'credit_note' && invoices.isError
  const creditNoteError = kind !== 'invoice' && creditNotes.isError
  const writebackOptions =
    kind === 'credit_note'
      ? ['not_attempted', 'pending', 'in_progress', 'succeeded', 'failed', 'outcome_unknown']
      : ['not_attempted', 'in_progress', 'succeeded', 'failed', 'outcome_unknown']
  const listing = useDashboardWritebacksQuery()
  return (
    <>
      <Heading
        eyebrow="Zoho Books integration"
        title="Writeback"
        description={
          localMockApiEnabled
            ? 'Illustrative writeback states derived from local invoice and credit-note fixtures.'
            : 'Persisted invoice and credit-note writeback state derived from fiscalization records.'
        }
        action={<Freshness value={invoices.lastUpdatedAt ?? creditNotes.lastUpdatedAt} />}
      />
      <div className="api-source-note">
        <RefreshCw size={15} />{' '}
        {localMockApiEnabled
          ? 'DEMO ONLY: rows below are fictional local request fixtures; no writeback is performed.'
          : `Dedicated aggregate writeback listing is ${listing.data?.availability === 'unavailable' ? 'not available' : 'being checked'}. Rows below are request records from the authenticated fiscalization APIs; the view does not perform writeback.`}
      </div>
      <Panel
        title="Writeback outcomes"
        subtitle="Search is server-side; export and pagination cover loaded authorized records only"
        className="api-table-panel"
      >
        <div className="api-toolbar">
          <label className="api-search">
            <Search size={15} />
            <input
              aria-label="Search writebacks"
              placeholder="Document, Zoho ID or request ID"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="api-filter">
            <Filter size={14} />
            <select
              aria-label="Writeback status"
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
            >
              <option value="">All writeback states</option>
              {writebackOptions.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="api-filter">
            <span>Document</span>
            <select
              aria-label="Document type"
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as typeof kind)
                setStatus('')
                setPage(1)
              }}
            >
              <option value="all">All</option>
              <option value="invoice">Invoices</option>
              <option value="credit_note">Credit notes</option>
            </select>
          </label>
          <button
            className="button secondary api-export"
            onClick={() =>
              downloadCsv('zohoamarco-writeback-page.csv', recordCsv(records.map(({ row }) => row)))
            }
            disabled={!records.length}
          >
            <Download size={14} /> Export page
          </button>
        </div>
        {invoiceError && (
          <DataState
            isLoading={false}
            isError
            hasData={Boolean(invoices.data)}
            error={invoices.error}
            refetch={invoices.refetch}
          />
        )}
        {creditNoteError && (
          <DataState
            isLoading={false}
            isError
            hasData={Boolean(creditNotes.data)}
            error={creditNotes.error}
            refetch={creditNotes.refetch}
          />
        )}
        {loading && !records.length && (
          <DataState isLoading isError={false} error={null} refetch={() => undefined} />
        )}
        {records.length ? (
          <div className="table-wrap api-table-wrap">
            <table className="data-table api-data-table">
              <thead>
                <tr>
                  <th>DOCUMENT</th>
                  <th>TYPE</th>
                  <th>FISCALIZATION REQUEST</th>
                  <th>WRITEBACK</th>
                  <th>TRANSMISSION</th>
                  <th>RECEIPT EVIDENCE</th>
                  <th>UPDATED</th>
                </tr>
              </thead>
              <tbody>
                {records.map(({ kind: recordKind, row }) => (
                  <tr
                    key={row.requestId}
                    className="api-click-row"
                    tabIndex={0}
                    onClick={() => setSelected({ kind: recordKind, id: row.requestId })}
                    onKeyDown={(event) =>
                      event.key === 'Enter' && setSelected({ kind: recordKind, id: row.requestId })
                    }
                  >
                    <td>
                      <strong>{row.documentNumber ?? 'Number unavailable'}</strong>
                      <small>{row.zohoDocumentId}</small>
                    </td>
                    <td>{recordKind.replace('_', ' ')}</td>
                    <td>
                      <code>{row.requestId}</code>
                      <small>{row.attemptCount} attempts</small>
                    </td>
                    <td>
                      <StatusBadge value={row.writebackStatus} />
                    </td>
                    <td>
                      <StatusBadge value={row.transmissionStatus} />
                    </td>
                    <td>
                      {row.confirmedReceiptEvidence ? (
                        <StatusBadge value="confirmed evidence" />
                      ) : (
                        'No receipt evidence'
                      )}
                    </td>
                    <td>{new Date(row.updatedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !loading &&
          !invoiceError &&
          !creditNoteError && (
            <Availability
              kind="empty"
              title="No matching writeback records"
              description="The selected filters returned no persisted invoice or credit-note requests."
            />
          )
        )}
        {kind === 'all' && !loading && (
          <p className="api-note">
            All types shows the first 25 records from each source. Select Invoices or Credit notes
            for server-side pagination.
          </p>
        )}
        {!loading && kind === 'invoice' && invoices.data && (
          <Pagination
            page={page}
            pages={Math.max(1, Math.ceil(invoices.data.total / 25))}
            pageSize={25}
            total={invoices.data.total}
            onPage={setPage}
          />
        )}
        {!loading && kind === 'credit_note' && creditNotes.data && (
          <Pagination
            page={page}
            pages={Math.max(1, Math.ceil(creditNotes.data.total / 25))}
            pageSize={25}
            total={creditNotes.data.total}
            onPage={setPage}
          />
        )}
      </Panel>
      <AnimatePresence>
        {selected && <RecordDrawer selected={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </>
  )
}

export function ApiMonitoring() {
  const [page, setPage] = useState(1)
  const reviews = useDashboardManualReviewQuery({ page, pageSize: 25 })
  const reconciliation = useDashboardReconciliationQuery()
  const capabilities = useDashboardCapabilitiesQuery()
  const services = useDashboardServiceHealthQuery()
  const manual = reviews.data?.availability === 'partial' ? reviews.data : null
  const unavailableCaps = capabilities.data?.capabilities
  return (
    <>
      <Heading
        eyebrow="Operations control room"
        title="Monitoring"
        description={
          localMockApiEnabled
            ? 'Illustrative local review fixtures and explicit unavailable states for queue, event, and reconciliation feeds.'
            : 'Persisted manual-review cases and explicit availability for queue, event, and reconciliation feeds.'
        }
        action={<Freshness value={reviews.lastUpdatedAt} />}
      />
      <div className="api-dashboard-grid api-monitoring-grid">
        <Panel
          title="Manual review"
          subtitle={
            localMockApiEnabled
              ? 'Fictional local demo cases'
              : 'Open cases from persisted middleware review records'
          }
        >
          <DataState
            isLoading={reviews.isLoading}
            isError={reviews.isError}
            hasData={Boolean(reviews.data)}
            error={reviews.error}
            refetch={reviews.refetch}
          />
          {reviews.data?.availability === 'unavailable' && (
            <Availability
              title="Manual-review data unavailable"
              description={reviews.data.reason}
            />
          )}
          {manual &&
            (manual.items.length ? (
              <div className="api-review-list">
                {manual.items.map((item) => (
                  <article key={item.caseId} className="api-review-card">
                    <div className="api-review-top">
                      <div>
                        <strong>{item.reason}</strong>
                        <small>
                          Request <code>{item.requestId}</code>
                        </small>
                      </div>
                      <StatusBadge value={item.status} />
                    </div>
                    <p>
                      Observed state: {item.observedState} ·{' '}
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                    {item.decisions.map((decision) => (
                      <div className="api-timeline-item" key={decision.sequence}>
                        <time>{new Date(decision.recordedAt).toLocaleString()}</time>
                        <strong>{decision.resolution}</strong>
                        <span>{decision.reason}</span>
                      </div>
                    ))}
                  </article>
                ))}
                <ManualReviewPagination
                  page={page}
                  hasMore={manual.hasMore}
                  itemCount={manual.items.length}
                  onPage={setPage}
                />
                <p className="api-note">
                  Total count is intentionally omitted; the next-page control uses a bounded
                  look-ahead read.
                </p>
              </div>
            ) : (
              <Availability
                kind="empty"
                title="No unresolved review cases on this page"
                description="The authenticated manual-review read returned no unresolved cases."
              />
            ))}
        </Panel>
        <div className="api-monitoring-stack">
          <Panel
            title="Middleware telemetry"
            subtitle="In-process metrics; counters reset when the process restarts"
          >
            <DataState
              isLoading={services.isLoading}
              isError={services.isError}
              error={services.error}
              refetch={services.refetch}
            />
            {services.data && (
              <div className="api-health-list">
                <HealthRow
                  label="Middleware process uptime"
                  value={formatDuration(services.data.middlewareApi.processUptimeSeconds)}
                />
                <HealthRow
                  label="Gateway"
                  value={services.data.gateway.status}
                  detail={
                    services.data.gateway.lastSuccessfulCommunicationAt
                      ? `Last successful communication ${new Date(services.data.gateway.lastSuccessfulCommunicationAt).toLocaleString()}`
                      : 'Last successful communication unavailable'
                  }
                />
                <HealthRow
                  label="Mean HTTP response duration"
                  value={
                    services.data.observability?.httpDurationMs.count
                      ? `${Math.round(services.data.observability.httpDurationMs.sum / services.data.observability.httpDurationMs.count)} ms`
                      : 'No observations'
                  }
                  detail={`${services.data.observability?.httpDurationMs.count ?? 0} observations since process start`}
                />
                {services.data.observability ? (
                  Object.entries(services.data.observability.jobs).map(([name, job]) => (
                    <HealthRow
                      key={name}
                      label={name.replaceAll('_', ' ')}
                      value={job.running ? 'running' : 'not running'}
                      detail={`${job.runs} runs · ${job.failures} failures${job.lastSuccessAt ? ` · last success ${new Date(job.lastSuccessAt).toLocaleString()}` : ''}`}
                    />
                  ))
                ) : (
                  <p className="api-note">Operational metrics are not configured.</p>
                )}
              </div>
            )}
          </Panel>
          <Panel title="Queue depth" subtitle="Mutation-free queue telemetry">
            {' '}
            <CapabilityMessage
              status={unavailableCaps?.queueDepth?.status}
              reason={unavailableCaps?.queueDepth?.reason}
              title="Queue data not exposed"
            />
          </Panel>
          <Panel title="System events" subtitle="Persisted event stream">
            <CapabilityMessage
              status={unavailableCaps?.systemEvents?.status}
              reason={unavailableCaps?.systemEvents?.reason}
              title="Event feed not exposed"
            />
          </Panel>
          <Panel
            title="Reconciliation collection"
            subtitle="Request-level state is available in record detail"
          >
            <CapabilityMessage
              status={reconciliation.data?.availability ?? unavailableCaps?.reconciliation?.status}
              reason={reconciliation.data?.reason ?? unavailableCaps?.reconciliation?.reason}
              title="No complete reconciliation listing"
            />
          </Panel>
        </div>
      </div>
    </>
  )
}

function CapabilityMessage({
  status,
  reason,
  title,
}: {
  status?: string
  reason?: string | null
  title: string
}) {
  return (
    <div className="api-capability">
      <StatusBadge value={status ?? 'checking'} />
      <strong>{title}</strong>
      <p>
        {reason ?? 'The middleware does not expose a verified read contract for this collection.'}
      </p>
    </div>
  )
}

export function ApiSettings() {
  const auth = useAuth()
  const capabilities = useDashboardCapabilitiesQuery()
  const identity = auth.user
  return (
    <>
      <Heading
        eyebrow="Workspace configuration"
        title="Settings"
        description="Display-only connection, user session, and data refresh information."
      />
      <div className="settings-grid api-settings-grid">
        <Panel
          title="User session"
          subtitle="Identity and authorization are validated by the dashboard API"
        >
          <div className="api-settings-content">
            <DetailLine label="Name" value={identity?.name ?? 'No authenticated identity'} />
            <DetailLine label="Email" value={identity?.email ?? 'Unavailable'} />
            <DetailLine label="Role" value={identity?.role ?? 'Not supplied'} />
            <DetailLine label="Session state" value={auth.sessionState} />
            <DetailLine label="Auth adapter" value={auth.adapter} />
          </div>
        </Panel>
        <Panel title="API connection" subtitle="Public connection metadata only">
          <div className="api-settings-content">
            <DetailLine
              label="Data mode"
              value={
                localMockApiEnabled ? 'Local fixture API · DEMO' : 'Authenticated dashboard gateway'
              }
            />
            <DetailLine label="API base URL" value={apiOriginLabel()} />
            <DetailLine
              label="Dashboard API auth"
              value={
                auth.adapter === 'google-oidc'
                  ? 'Signed dashboard session cookie'
                  : 'Not configured'
              }
            />
            <DetailLine
              label="Refresh interval"
              value={`${Math.round(Number(import.meta.env.VITE_REFRESH_INTERVAL_MS || 30000) / 1000)} seconds`}
            />
            <DetailLine
              label="HTTPS"
              value={window.location.protocol === 'https:' ? 'Enabled' : 'Disabled for this origin'}
            />
          </div>
        </Panel>
        <Panel title="Read contract availability" subtitle="Server-reported capabilities">
          <DataState
            isLoading={capabilities.isLoading}
            isError={capabilities.isError}
            error={capabilities.error}
            refetch={capabilities.refetch}
          />
          {capabilities.data && (
            <div className="api-health-list">
              {Object.entries(capabilities.data.capabilities).map(([key, value]) => (
                <HealthRow
                  key={key}
                  label={key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}
                  value={value.status}
                  detail={value.reason ?? value.source}
                />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}

function apiOriginLabel() {
  return 'Same-origin /api gateway'
}

export function ApiNotifications() {
  const reviews = useDashboardManualReviewQuery({ page: 1, pageSize: 8 })
  const items = reviews.data?.availability === 'partial' ? reviews.data.items : []
  return (
    <div className="api-notification-content">
      {reviews.isLoading ? (
        <span>Checking persisted manual-review cases…</span>
      ) : reviews.isError ? (
        <span>Manual-review alerts could not be loaded.</span>
      ) : items.length ? (
        items.map((item) => (
          <div key={item.caseId}>
            <AlertTriangle size={14} />
            <span>
              <strong>Manual review required</strong>
              <small>
                {item.reason} · {new Date(item.updatedAt).toLocaleString()}
              </small>
            </span>
          </div>
        ))
      ) : (
        <span>
          {reviews.data?.availability === 'unavailable'
            ? 'Manual-review notification source unavailable.'
            : 'No unresolved manual-review cases.'}
        </span>
      )}
    </div>
  )
}
