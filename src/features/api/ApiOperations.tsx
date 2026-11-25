import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { apiMode, getJson } from '@/lib/api/client'
import {
  toQueryString,
  useDashboardManualReviewCaseQuery,
  useDashboardManualReviewQuery,
} from './queries'
import type { ManualReviewCase, ManualReviewSummaryItem } from './schemas'
import { dashboardEventsPageSchema, writebackOperationsPageSchema } from './operation-contracts'
import { ApiReceiptReconciliation } from './ApiDocuments'
import './api-operational-pages.css'

export type OperationFamily = 'manual-review' | 'reconciliation' | 'events' | 'operations'
const descriptions: Record<
  OperationFamily,
  { title: string; description: string; limitation: string }
> = {
  'manual-review': {
    title: 'Manual review',
    description: 'Invoice review cases and credit-note request review states.',
    limitation:
      'Credit-note review is represented in request state and reconciliation, rather than separate case records. The contract exposes no dashboard resolution action.',
  },
  reconciliation: {
    title: 'Reconciliation',
    description: 'Persisted invoice reconciliation operations and credit-note diagnostic states.',
    limitation:
      'Uncertain device outcomes remain distinct from ordinary failures. Reconciliation decisions belong to middleware services.',
  },
  events: {
    title: 'Derived operational events',
    description:
      'Chronological evidence from persisted attempts, decisions and writeback operations.',
    limitation:
      'This derived read model is not a generic persisted audit log and does not include every process log or intermediate change. Event type, severity, document and request filters are not documented.',
  },
  operations: {
    title: 'Pending operations',
    description:
      'Persisted pending, processing, failed, reconciliation and writeback workflow states.',
    limitation:
      'These records do not form a unified queue. Queue depth is unavailable. A retryable candidate still requires the middleware eligibility check.',
  },
}

function ErrorState({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="api-error-evidence" role="alert">
      <div>
        <strong>Data unavailable</strong>
        <p>
          {error instanceof Error ? error.message : 'No verified middleware response is available.'}
        </p>
        <button className="button secondary" onClick={retry}>
          Try again
        </button>
      </div>
    </div>
  )
}

function PageControl({
  page,
  loading,
  hasMore,
  onPage,
}: {
  page: number
  loading: boolean
  hasMore: boolean
  onPage: (page: number) => void
}) {
  return (
    <div className="api-pagination">
      <span>Page {page}</span>
      <div>
        <button
          className="button secondary"
          disabled={page <= 1 || loading}
          onClick={() => onPage(page - 1)}
        >
          Previous page
        </button>
        <button
          className="button secondary"
          disabled={!hasMore || loading}
          onClick={() => onPage(page + 1)}
        >
          Next page
        </button>
      </div>
    </div>
  )
}

export function ApiOperationCollection({ family }: { family: OperationFamily }) {
  if (family === 'manual-review') return <ApiManualReviewCollection />
  return <ApiGenericOperationCollection family={family} />
}

const manualReviewPageSize = 25

function ApiManualReviewCollection() {
  const [params, setParams] = useSearchParams()
  const caseId = params.get('caseId')?.trim() || null
  const rawPage = Number(params.get('page') ?? 1)
  const page = Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= 100 ? rawPage : 1
  const statusParam = params.get('status')
  const status = statusParam === 'open' || statusParam === 'resolved' ? statusParam : ''
  const [lookup, setLookup] = useState(caseId ?? '')
  const cases = useDashboardManualReviewQuery(
    { page, pageSize: manualReviewPageSize, status: status || undefined },
    !caseId,
  )
  const detail = useDashboardManualReviewCaseQuery(caseId ?? '', Boolean(caseId))
  const activeQuery = caseId ? detail : cases

  function openCase(id: string) {
    setLookup(id)
    setParams({ caseId: id })
  }

  function showList(nextPage = 1, nextStatus = status) {
    setLookup('')
    setParams({
      ...(nextPage > 1 ? { page: String(nextPage) } : {}),
      ...(nextStatus ? { status: nextStatus } : {}),
    })
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">OPERATIONS</span>
          <h1>Manual review</h1>
          <p>Persisted invoice review cases, related attempts and recorded decisions.</p>
        </div>
        <button
          className="button secondary"
          disabled={activeQuery.isFetching || apiMode !== 'api'}
          onClick={() => void activeQuery.refetch()}
        >
          Refresh manual review
        </button>
      </div>
      <div className="api-source-note">
        Review records are read-only here. Resolution decisions remain in the middleware workflow.
        Credit-note review state remains on its request and reconciliation records.
      </div>
      {caseId ? (
        <ManualReviewCaseDetail
          caseId={caseId}
          reviewCase={detail.data}
          isLoading={detail.isLoading}
          error={detail.error}
          retry={() => void detail.refetch()}
          onBack={() => showList()}
        />
      ) : (
        <section className="panel api-panel">
          <form
            className="api-source-note api-request-controls"
            onSubmit={(event) => {
              event.preventDefault()
              if (lookup.trim()) openCase(lookup.trim())
            }}
          >
            <label>
              Case ID{' '}
              <input
                maxLength={128}
                value={lookup}
                onChange={(event) => setLookup(event.target.value)}
              />
            </label>
            <button className="button secondary" disabled={!lookup.trim()}>
              Open case
            </button>
            <label>
              Review status{' '}
              <select value={status} onChange={(event) => showList(1, event.target.value)}>
                <option value="">All statuses</option>
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
              </select>
            </label>
          </form>
          {cases.isLoading ? (
            <p role="status">Loading persisted manual-review cases…</p>
          ) : cases.isError ? (
            <ErrorState error={cases.error} retry={() => void cases.refetch()} />
          ) : cases.data?.items.length ? (
            <>
              <div className="api-review-list">
                {cases.data.items.map((item) => (
                  <ManualReviewCard key={item.id} item={item} onOpen={openCase} />
                ))}
              </div>
              <PageControl
                page={cases.data.page}
                loading={cases.isFetching}
                hasMore={cases.data.page * cases.data.pageSize < cases.data.total}
                onPage={(nextPage) => showList(nextPage)}
              />
              <p className="api-note">
                {cases.data.total} persisted {cases.data.total === 1 ? 'case' : 'cases'}.
              </p>
            </>
          ) : cases.data ? (
            <div className="api-empty-state" role="status">
              <strong>No manual-review cases match these filters.</strong>
              <p>The middleware returned an empty page with a total of {cases.data.total}.</p>
            </div>
          ) : null}
        </section>
      )}
    </>
  )
}

function ManualReviewCard({
  item,
  onOpen,
}: {
  item: ManualReviewSummaryItem
  onOpen: (caseId: string) => void
}) {
  return (
    <article className="api-review-card">
      <div className="api-review-top">
        <div>
          <strong>{item.reason ?? 'No reason recorded.'}</strong>
          <small>
            Request <code>{item.requestId}</code>
          </small>
        </div>
        <strong>{item.status}</strong>
      </div>
      <p>
        Observed state: {item.observedState} · {new Date(item.createdAt).toLocaleString()}
      </p>
      <p>
        Case <code>{item.id}</code> · {item.relatedAttemptIds.length} related attempt
        {item.relatedAttemptIds.length === 1 ? '' : 's'}
      </p>
      <button className="button secondary" onClick={() => onOpen(item.id)}>
        Open case details
      </button>
    </article>
  )
}

function ManualReviewCaseDetail({
  caseId,
  reviewCase,
  isLoading,
  error,
  retry,
  onBack,
}: {
  caseId: string
  reviewCase?: ManualReviewCase
  isLoading: boolean
  error: unknown
  retry: () => void
  onBack: () => void
}) {
  return (
    <section className="panel api-panel">
      <div className="api-source-note">
        <button className="button secondary" onClick={onBack}>
          Back to cases
        </button>
        <p>
          Manual-review case <code>{caseId}</code>
        </p>
      </div>
      {isLoading ? (
        <p role="status">Loading manual-review case…</p>
      ) : error ? (
        <ErrorState error={error} retry={retry} />
      ) : reviewCase ? (
        <>
          <div className="api-review-card">
            <div className="api-review-top">
              <div>
                <strong>{reviewCase.reason ?? 'No reason recorded.'}</strong>
                <small>
                  Request <code>{reviewCase.requestId}</code>
                </small>
              </div>
              <strong>{reviewCase.status}</strong>
            </div>
            <p>Observed state: {reviewCase.observedState}</p>
            <p>Operation: {reviewCase.operationId}</p>
            <h3>Supporting attempts</h3>
            {reviewCase.supportingAttempts.length ? (
              reviewCase.supportingAttempts.map((attempt) => (
                <article className="api-attempt-card" key={attempt.attemptNumber}>
                  <h4>Attempt {attempt.attemptNumber}</h4>
                  <p>Outcome: {attempt.outcome ?? 'Unknown'}</p>
                  <p>Started: {new Date(attempt.startedAt).toLocaleString()}</p>
                  <p>
                    Completed:{' '}
                    {attempt.completedAt
                      ? new Date(attempt.completedAt).toLocaleString()
                      : 'Not completed'}
                  </p>
                  <p>Error code: {attempt.errorCode ?? 'None recorded'}</p>
                  <p>Error: {attempt.errorMessage ?? 'None recorded'}</p>
                </article>
              ))
            ) : (
              <p>No supporting attempts were returned.</p>
            )}
            <p>Created: {new Date(reviewCase.createdAt).toLocaleString()}</p>
            <p>Updated: {new Date(reviewCase.updatedAt).toLocaleString()}</p>
            {reviewCase.resolvedAt && (
              <p>Resolved: {new Date(reviewCase.resolvedAt).toLocaleString()}</p>
            )}
          </div>
          <h2>Recorded decisions</h2>
          {reviewCase.decisions.length ? (
            reviewCase.decisions.map((decision) => (
              <div className="api-timeline-item" key={decision.id}>
                <time>{new Date(decision.recordedAt).toLocaleString()}</time>
                <strong>{decision.resolution}</strong>
                <span>{decision.reason ?? 'No reason recorded.'}</span>
                <small>Requested outcome: {decision.requestedOutcome}</small>
              </div>
            ))
          ) : (
            <p>No decisions have been recorded for this case.</p>
          )}
        </>
      ) : null}
    </section>
  )
}

function ApiGenericOperationCollection({
  family,
}: {
  family: Exclude<OperationFamily, 'manual-review'>
}) {
  const info = descriptions[family]
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState(params.get('status') ?? '')
  const [documentType, setDocumentType] = useState(params.get('documentType') ?? '')
  const [from, setFrom] = useState(params.get('from') ?? '')
  const [to, setTo] = useState(params.get('to') ?? '')
  const supportsDates = family === 'reconciliation' || family === 'events'
  const supportsStatus = family === 'reconciliation'
  const supportsType = true
  const requestedPage = Number(params.get('page') ?? 1)
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 100
      ? requestedPage
      : 1
  const path = `/api/dashboard/${family}${toQueryString({
    page,
    pageSize: 25,
    status: supportsStatus ? params.get('status') || undefined : undefined,
    documentType: supportsType ? params.get('documentType') || undefined : undefined,
    createdFrom:
      supportsDates && params.get('from') ? `${params.get('from')}T00:00:00.000Z` : undefined,
    createdTo: supportsDates && params.get('to') ? `${params.get('to')}T23:59:59.999Z` : undefined,
  })}`
  const query = useQuery({
    queryKey: ['middleware', 'operation-family', family, path],
    queryFn: ({ signal }) =>
      getJson(path, family === 'events' ? dashboardEventsPageSchema : z.never(), signal),
    enabled: apiMode === 'api',
    retry: false,
  })
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">OPERATIONS</span>
          <h1>{info.title}</h1>
          <p>{info.description}</p>
        </div>
      </div>
      <div className="api-source-note">{info.limitation}</div>
      {
        <form
          className="api-source-note api-request-controls"
          onSubmit={(event) => {
            event.preventDefault()
            setParams({
              ...(family === 'reconciliation' ? { view: 'operations' } : {}),
              ...(supportsStatus && status.trim() ? { status: status.trim() } : {}),
              ...(supportsType && documentType.trim() ? { documentType: documentType.trim() } : {}),
              ...(supportsDates && from ? { from } : {}),
              ...(supportsDates && to ? { to } : {}),
            })
          }}
        >
          {supportsStatus && (
            <label>
              Reconciliation status{' '}
              <input
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                placeholder="Exact middleware status"
                maxLength={128}
              />
            </label>
          )}
          {supportsType && (
            <label>
              Document type{' '}
              <input
                value={documentType}
                onChange={(event) => setDocumentType(event.target.value)}
                placeholder="Exact middleware type"
                maxLength={128}
              />
            </label>
          )}
          {supportsDates && (
            <>
              <label>
                Created from (UTC){' '}
                <input
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </label>
              <label>
                Created to (UTC){' '}
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>
            </>
          )}
          <button className="button secondary">Apply filters</button>
        </form>
      }
      <section className="panel api-panel">
        <div className="panel-body">
          {apiMode !== 'api' ? (
            <p role="status">
              Live operational data requires an authenticated API session. No demo records are
              substituted.
            </p>
          ) : query.isLoading ? (
            <p role="status">Loading middleware data…</p>
          ) : query.isError ? (
            <ErrorState error={query.error} retry={() => void query.refetch()} />
          ) : null}
          {family === 'events' && query.data && (
            <div className="api-event-list" aria-label="Persisted operational events">
              {(query.data as ReturnType<typeof dashboardEventsPageSchema.parse>).items.map(
                (event) => (
                  <article className="api-timeline-item" key={event.eventId}>
                    <time dateTime={event.timestamp}>
                      {new Date(event.timestamp).toLocaleString()}
                    </time>
                    <strong>{event.eventType}</strong>
                    <span>{event.message}</span>
                    <small>
                      {event.documentType ?? 'Unknown document type'} ·{' '}
                      {event.documentId ?? 'No document ID'} · {event.requestId ?? 'No request ID'}
                    </small>
                  </article>
                ),
              )}
              {!query.data.items.length && <p>No persisted events match these filters.</p>}
            </div>
          )}
          {family !== 'events' && (
            <p>
              The local contract documents this endpoint, but omits its exact record response
              schema. This view cannot safely render its records until that schema is supplied.
            </p>
          )}
          <p>
            <Link to="/requests">Inspect persisted request details and execution evidence</Link>
          </p>
          {family === 'reconciliation' && (
            <p>
              <Link to="/requests?status=OutcomeUnknown">
                Invoice requests with uncertain outcomes
              </Link>
            </p>
          )}
        </div>
      </section>
    </>
  )
}

function writebackDocumentPath(documentType: string, documentId: string) {
  const normalized = documentType
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  const segment =
    normalized === 'invoice' ? 'invoices' : normalized === 'credit_note' ? 'credit-notes' : null
  return segment ? `/${segment}?id=${encodeURIComponent(documentId)}` : null
}

export function ApiWritebackOperations() {
  const [params, setParams] = useSearchParams()
  const requestedPage = Number(params.get('page') ?? 1)
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const [status, setStatus] = useState(params.get('status') ?? '')
  const [documentType, setDocumentType] = useState(params.get('documentType') ?? '')
  const [from, setFrom] = useState(params.get('from') ?? '')
  const [to, setTo] = useState(params.get('to') ?? '')
  const path = `/api/dashboard/writebacks${toQueryString({
    page,
    pageSize: 25,
    status: params.get('status') || undefined,
    documentType: params.get('documentType') || undefined,
    createdFrom: params.get('from') ? `${params.get('from')}T00:00:00.000Z` : undefined,
    createdTo: params.get('to') ? `${params.get('to')}T23:59:59.999Z` : undefined,
  })}`
  const query = useQuery({
    queryKey: ['middleware', 'writeback-operations', path],
    queryFn: ({ signal }) => getJson(path, writebackOperationsPageSchema, signal),
    enabled: apiMode === 'api',
    retry: false,
  })
  const data = query.data
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ZOHO BOOKS</span>
          <h1>Zoho writeback operations</h1>
          <p>Durable writeback results, independent of fiscal receipt issuance.</p>
        </div>
        <button
          className="button secondary"
          disabled={query.isFetching || apiMode !== 'api'}
          onClick={() => void query.refetch()}
        >
          Refresh writebacks
        </button>
      </div>
      <div className="api-source-note">
        Invoice retry counts and credit-note provider exchange counts use different persistence
        models. A successful writeback is separate from a successful fiscalization. Provider
        payloads are never displayed.
      </div>
      <form
        className="api-source-note api-request-controls"
        onSubmit={(event) => {
          event.preventDefault()
          setParams({
            ...(status.trim() ? { status: status.trim() } : {}),
            ...(documentType.trim() ? { documentType: documentType.trim() } : {}),
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
          })
        }}
      >
        <label>
          Writeback status{' '}
          <input
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            maxLength={128}
            placeholder="Exact middleware status"
          />
        </label>
        <label>
          Document type{' '}
          <input
            value={documentType}
            onChange={(event) => setDocumentType(event.target.value)}
            maxLength={128}
            placeholder="Exact middleware type"
          />
        </label>
        <label>
          Created from (UTC){' '}
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          Created to (UTC){' '}
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <button className="button secondary">Apply filters</button>
      </form>
      <section className="panel api-panel">
        {apiMode !== 'api' && (
          <p className="panel-body" role="status">
            Live writeback data is unavailable in demo mode. No sample operations are substituted.
          </p>
        )}
        {query.isLoading && <p role="status">Loading writeback operations…</p>}
        {query.isError && <ErrorState error={query.error} retry={() => void query.refetch()} />}
        {data && (
          <>
            <div className="table-scroll">
              <table className="data-table api-data-table">
                <caption>Persisted Zoho writeback operations</caption>
                <thead>
                  <tr>
                    {[
                      'Document',
                      'Request',
                      'Status',
                      'Error',
                      'Retries',
                      'Provider exchanges',
                      'Created',
                      'Updated',
                      'Completed',
                      'Next retry',
                    ].map((value) => (
                      <th key={value} scope="col">
                        {value}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => {
                    const documentPath = writebackDocumentPath(row.documentType, row.documentId)
                    const isCreditNote =
                      row.documentType
                        .trim()
                        .toLowerCase()
                        .replace(/[\s-]+/g, '_') === 'credit_note'
                    return (
                      <tr key={row.writebackId}>
                        <td>
                          {documentPath ? (
                            <Link
                              className="document-number"
                              to={documentPath}
                              state={{ writebackOperation: row }}
                              aria-label={`Open ${isCreditNote ? 'credit note' : 'invoice'} details for ${row.documentId}`}
                            >
                              {row.documentId}
                            </Link>
                          ) : (
                            <strong>{row.documentId}</strong>
                          )}
                          <small>{row.documentType}</small>
                        </td>
                        <td>
                          {row.requestId ? (
                            <Link
                              to={`/requests?${toQueryString({ id: row.requestId, ...(row.documentType.toUpperCase() === 'CREDIT_NOTE' ? { kind: 'credit_note' } : {}) }).slice(1)}`}
                            >
                              {row.requestId}
                            </Link>
                          ) : (
                            'Unavailable'
                          )}
                        </td>
                        <td>{row.status}</td>
                        <td>{row.errorCategory ?? 'None returned'}</td>
                        <td>{row.retryCount}</td>
                        <td>{row.providerExchangeCount}</td>
                        <td>
                          <time dateTime={row.createdAt}>
                            {new Date(row.createdAt).toLocaleString()}
                          </time>
                        </td>
                        <td>
                          <time dateTime={row.updatedAt}>
                            {new Date(row.updatedAt).toLocaleString()}
                          </time>
                        </td>
                        <td>
                          {row.completedAt
                            ? new Date(row.completedAt).toLocaleString()
                            : 'Not completed'}
                        </td>
                        <td>
                          {row.nextRetryAt
                            ? new Date(row.nextRetryAt).toLocaleString()
                            : 'Not scheduled'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {data.items.length === 0 && (
              <p className="panel-body" role="status">
                No writeback operations match these filters.
              </p>
            )}
            <p className="api-note">
              {data.total} matching operations
              {query.isError ? ' · Last successful response; data is stale.' : ''}
            </p>
            <PageControl
              page={page}
              loading={query.isFetching}
              hasMore={page * data.pageSize < data.total}
              onPage={(next) =>
                setParams((current) => {
                  const updated = new URLSearchParams(current)
                  updated.set('page', String(next))
                  return updated
                })
              }
            />
          </>
        )}
      </section>
    </>
  )
}

export function ApiReconciliation() {
  const [params] = useSearchParams()
  const operations = params.get('view') === 'operations'
  return (
    <>
      <nav className="api-source-note api-metric-links" aria-label="Reconciliation views">
        <Link to="/reconciliation" aria-current={!operations ? 'page' : undefined}>
          CU/KRA receipt comparison
        </Link>
        <Link to="/reconciliation?view=operations" aria-current={operations ? 'page' : undefined}>
          Persisted reconciliation operations
        </Link>
      </nav>
      {operations ? (
        <ApiOperationCollection family="reconciliation" />
      ) : (
        <ApiReceiptReconciliation />
      )}
    </>
  )
}

export function ApiOperationsHome({ children }: { children?: React.ReactNode }) {
  return (
    <>
      {children}
      <div className="api-dashboard-grid">
        {Object.entries(descriptions).map(([path, info]) => (
          <section className="panel api-panel" key={path}>
            <div className="panel-body">
              <h2>
                <Link
                  to={path === 'reconciliation' ? '/reconciliation?view=operations' : `/${path}`}
                >
                  {info.title}
                </Link>
              </h2>
              <p>{info.description}</p>
              <p>{info.limitation}</p>
            </div>
          </section>
        ))}
        <section className="panel api-panel">
          <div className="panel-body">
            <h2>
              <Link to="/health">System health and telemetry</Link>
            </h2>
            <p>
              Process uptime, database observations and dependency states from the documented
              services endpoint.
            </p>
          </div>
        </section>
      </div>
    </>
  )
}
