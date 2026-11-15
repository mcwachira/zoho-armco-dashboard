import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { apiMode, getJson } from '@/lib/api/client'
import { toQueryString } from './queries'
import { writebackOperationsPageSchema } from './operation-contracts'
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

/** Full DTOs for these new families are missing from the supplied contract.
 * The server fails closed; never accept and display arbitrary operational JSON.
 */
export function ApiOperationCollection({ family }: { family: OperationFamily }) {
  const info = descriptions[family]
  const [params, setParams] = useSearchParams()
  const caseId = family === 'manual-review' ? params.get('caseId') : null
  const [status, setStatus] = useState(params.get('status') ?? '')
  const [documentType, setDocumentType] = useState(params.get('documentType') ?? '')
  const [from, setFrom] = useState(params.get('from') ?? '')
  const [to, setTo] = useState(params.get('to') ?? '')
  const supportsDates = family !== 'operations'
  const supportsStatus = family === 'manual-review' || family === 'reconciliation'
  const supportsType = family !== 'manual-review'
  const requestedPage = Number(params.get('page') ?? 1)
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 100
      ? requestedPage
      : 1
  const path = caseId
    ? `/api/dashboard/manual-review-case${toQueryString({ id: caseId })}`
    : `/api/dashboard/${family}${toQueryString({
        page,
        pageSize: 25,
        status: supportsStatus ? params.get('status') || undefined : undefined,
        documentType: supportsType ? params.get('documentType') || undefined : undefined,
        createdFrom:
          supportsDates && params.get('from') ? `${params.get('from')}T00:00:00.000Z` : undefined,
        createdTo:
          supportsDates && params.get('to') ? `${params.get('to')}T23:59:59.999Z` : undefined,
      })}`
  const query = useQuery({
    queryKey: ['middleware', 'operation-family', family, path],
    queryFn: ({ signal }) => getJson(path, z.never(), signal),
    enabled: apiMode === 'api',
    retry: false,
  })
  const [lookup, setLookup] = useState(caseId ?? '')
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
      {family === 'manual-review' && (
        <form
          className="api-source-note api-request-controls"
          onSubmit={(event) => {
            event.preventDefault()
            setParams(lookup.trim() ? { caseId: lookup.trim() } : {})
          }}
        >
          <label>
            Case ID{' '}
            <input
              maxLength={100}
              value={lookup}
              onChange={(event) => setLookup(event.target.value)}
            />
          </label>
          <button className="button secondary">Open case</button>
        </form>
      )}
      {!caseId && (
        <form
          className="api-source-note api-request-controls"
          onSubmit={(event) => {
            event.preventDefault()
            setParams({
              ...(supportsStatus && status.trim() ? { status: status.trim() } : {}),
              ...(supportsType && documentType.trim() ? { documentType: documentType.trim() } : {}),
              ...(supportsDates && from ? { from } : {}),
              ...(supportsDates && to ? { to } : {}),
            })
          }}
        >
          {supportsStatus &&
            (family === 'manual-review' ? (
              <label>
                Review status{' '}
                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="">All statuses</option>
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                </select>
              </label>
            ) : (
              <label>
                Reconciliation status{' '}
                <input
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  placeholder="Exact middleware status"
                  maxLength={128}
                />
              </label>
            ))}
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
      )}
      <section className="panel api-panel">
        <div className="panel-body">
          {caseId && (
            <p>
              Invoice review case <code>{caseId}</code>{' '}
              <button className="button secondary" onClick={() => setParams({})}>
                Back to cases
              </button>
            </p>
          )}
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
          <p>
            The local contract documents this endpoint, but omits its exact record response schema.
            This view cannot safely render its records until that schema is supplied.
          </p>
          <p>
            <Link to="/requests">Inspect persisted request details and execution evidence</Link>
          </p>
          {family === 'manual-review' && (
            <p>
              <Link to="/requests?kind=credit_note&status=MANUAL_REVIEW_REQUIRED">
                Credit-note requests requiring manual review
              </Link>
            </p>
          )}
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
                  {data.items.map((row) => (
                    <tr key={row.writebackId}>
                      <td>
                        <strong>{row.documentId}</strong>
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
                  ))}
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

export function ApiOperationsHome() {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">OPERATIONS CONTROL ROOM</span>
          <h1>Monitoring</h1>
          <p>Inspect durable evidence and the current scope of middleware observations.</p>
        </div>
      </div>
      <div className="api-dashboard-grid">
        {Object.entries(descriptions).map(([path, info]) => (
          <section className="panel api-panel" key={path}>
            <div className="panel-body">
              <h2>
                <Link to={`/${path}`}>{info.title}</Link>
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
