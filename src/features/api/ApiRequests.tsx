import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiMode } from '@/lib/api/client'
import { useDashboardInvoiceListQuery, useDashboardCreditNoteListQuery } from './queries'
import { RecordDrawer, statusBadgeTone } from './ApiOperationalPages'
import {
  creditNoteFiscalizationStateSchema,
  invoiceFiscalizationStatusSchema,
  invoiceReconciliationStatusSchema,
  dashboardInvoiceWritebackFilterSchema,
  type DashboardInvoiceStatus,
  type DashboardInvoiceReconciliationStatus,
  type DashboardInvoiceTransmissionStatus,
  type DashboardInvoiceWritebackFilter,
  type DashboardCreditNoteState,
} from './schemas'
import './api-operational-pages.css'
import './documents.css'

function dateBoundary(value: string, end = false) {
  if (!value) return undefined
  const date = new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z`)
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
}
function positiveInteger(value: string | null, fallback: number) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : fallback
}
function Status({ value }: { value: string | null }) {
  return (
    <span className={`badge ${statusBadgeTone(value ?? 'unknown')}`}>{value ?? 'Unavailable'}</span>
  )
}

/** Persisted workflow history uses dashboard DTOs, independently of live Zoho registers. */
export function ApiRequests() {
  const [params, setParams] = useSearchParams()
  const kind = params.get('kind') === 'credit_note' ? 'credit_note' : 'invoice'
  const page = positiveInteger(params.get('page'), 1)
  const pageSize = positiveInteger(params.get('pageSize'), 25)
  const id = params.get('id')?.trim() ?? ''
  const [lookup, setLookup] = useState('')
  const search = params.get('search') ?? ''
  const [draftSearch, setDraftSearch] = useState(search)
  useEffect(() => setDraftSearch(search), [search])
  const status = params.get('status') ?? ''
  const reconciliation = params.get('reconciliationStatus') ?? ''
  const writeback = params.get('writebackStatus') ?? ''
  const transmission = params.get('transmissionStatus') ?? ''
  const dates = {
    createdFrom: dateBoundary(params.get('from') ?? ''),
    createdTo: dateBoundary(params.get('to') ?? '', true),
  }
  const common = { page, pageSize, search: search || undefined, ...dates }
  const invoices = useDashboardInvoiceListQuery(
    {
      ...common,
      status: status ? (status as DashboardInvoiceStatus) : undefined,
      reconciliationStatus: reconciliation
        ? (reconciliation as DashboardInvoiceReconciliationStatus)
        : undefined,
      writebackStatus: writeback ? (writeback as DashboardInvoiceWritebackFilter) : undefined,
      transmissionStatus: transmission
        ? (transmission as DashboardInvoiceTransmissionStatus)
        : undefined,
    },
    kind === 'invoice',
  )
  const creditNotes = useDashboardCreditNoteListQuery(
    {
      ...common,
      state: status ? (status as DashboardCreditNoteState) : undefined,
      reconciliationState: reconciliation || undefined,
      writebackState: writeback || undefined,
    },
    kind === 'credit_note',
  )
  const query = kind === 'invoice' ? invoices : creditNotes
  const rows = query.data?.items

  function update(values: Record<string, string | undefined>, resetPage = true) {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (resetPage) next.delete('page')
      for (const [name, value] of Object.entries(values)) {
        if (value?.trim()) next.set(name, value.trim())
        else next.delete(name)
      }
      return next
    })
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">OPERATIONS</span>
          <h1>Fiscalization requests</h1>
          <p>
            Persisted invoice and credit-note execution history, confirmation evidence and
            independent Zoho writeback.
          </p>
        </div>
        <button
          className="button secondary"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Refresh requests
        </button>
      </div>
      <div className="api-source-note">
        This register contains requests submitted to middleware. Never-submitted documents belong in
        the <Link to="/invoices">invoice</Link> and <Link to="/credit-notes">credit-note</Link>{' '}
        registers. A submitted request or historical attempt does not confirm a fiscal receipt.
      </div>
      {apiMode !== 'api' && (
        <p className="api-source-note" role="status">
          Live middleware access is unavailable in demo mode. Any displayed fixtures are
          illustrative local records.
        </p>
      )}
      <section className="panel document-controls" aria-label="Request filters">
        <form
          className="document-filter-form"
          onSubmit={(event) => {
            event.preventDefault()
            update({ search: draftSearch })
          }}
        >
          <label className="document-search">
            Search requests
            <input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} />
          </label>
          <button className="button secondary">Search</button>
        </form>
        <div className="document-filter-grid">
          <label>
            Document type
            <select
              value={kind}
              onChange={(event) =>
                update({
                  kind: event.target.value,
                  status: undefined,
                  reconciliationStatus: undefined,
                  writebackStatus: undefined,
                  transmissionStatus: undefined,
                  id: undefined,
                })
              }
            >
              <option value="invoice">Invoice</option>
              <option value="credit_note">Credit note</option>
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(event) => update({ status: event.target.value })}>
              <option value="">All statuses</option>
              {(kind === 'invoice'
                ? invoiceFiscalizationStatusSchema.options
                : creditNoteFiscalizationStateSchema.options
              ).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          {kind === 'invoice' && (
            <label>
              Transmission status
              <select
                value={transmission}
                onChange={(event) => update({ transmissionStatus: event.target.value })}
              >
                <option value="">All transmission states</option>
                <option value="TRANSMISSION_PENDING">TRANSMISSION_PENDING</option>
                <option value="TRANSMISSION_CONFIRMED">TRANSMISSION_CONFIRMED</option>
              </select>
            </label>
          )}
          <label>
            Reconciliation status
            {kind === 'invoice' ? (
              <select
                value={reconciliation}
                onChange={(event) => update({ reconciliationStatus: event.target.value })}
              >
                <option value="">All reconciliation states</option>
                {invoiceReconciliationStatusSchema.options.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            ) : (
              <input
                value={reconciliation}
                onChange={(event) => update({ reconciliationStatus: event.target.value })}
              />
            )}
          </label>
          <label>
            Writeback status
            {kind === 'invoice' ? (
              <select
                value={writeback}
                onChange={(event) => update({ writebackStatus: event.target.value })}
              >
                <option value="">All writeback states</option>
                {dashboardInvoiceWritebackFilterSchema.options.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            ) : (
              <input
                value={writeback}
                onChange={(event) => update({ writebackStatus: event.target.value })}
              />
            )}
          </label>
          <label>
            Created from (UTC)
            <input
              type="date"
              value={params.get('from') ?? ''}
              max={params.get('to') || undefined}
              onChange={(event) => update({ from: event.target.value })}
            />
          </label>
          <label>
            Created to (UTC)
            <input
              type="date"
              value={params.get('to') ?? ''}
              min={params.get('from') || undefined}
              onChange={(event) => update({ to: event.target.value })}
            />
          </label>
          <label>
            Rows per page
            <select value={pageSize} onChange={(event) => update({ pageSize: event.target.value })}>
              {[25, 50, 100].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="api-note">
          Filters apply to the full persisted history through middleware. Credit-note reconciliation
          and writeback states retain their middleware values. History order is supplied by
          middleware.
        </p>
        <button
          className="button secondary"
          onClick={() => setParams(id ? { kind, id } : { kind })}
        >
          Clear filters
        </button>
      </section>
      <form
        className="panel document-lookup"
        onSubmit={(event) => {
          event.preventDefault()
          if (lookup.trim()) update({ id: lookup.trim() }, false)
        }}
      >
        <label>
          Request ID
          <input required value={lookup} onChange={(event) => setLookup(event.target.value)} />
        </label>
        <button className="button secondary">Open request</button>
      </form>
      {query.isLoading && <p role="status">Loading persisted middleware requests...</p>}
      {query.isError && (
        <p role="alert">
          Request data unavailable:{' '}
          {query.error instanceof Error
            ? query.error.message
            : 'The middleware response could not be retrieved.'}{' '}
          {query.data ? 'The previous response is stale.' : ''}
        </p>
      )}
      {query.data && !query.isError && (
        <>
          <div className="table-scroll">
            <table className="data-table api-data-table">
              <caption>
                {kind === 'invoice' ? 'Invoice' : 'Credit-note'} fiscalization requests
              </caption>
              <thead>
                <tr>
                  {[
                    'Request',
                    'Document',
                    'Customer',
                    'Submitted',
                    'Execution status',
                    'Transmission',
                    'Reconciliation',
                    'Zoho writeback',
                    'Attempts',
                    'Latest update',
                    'Latest error',
                  ].map((label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows?.map((row) => (
                  <tr key={row.requestId}>
                    <td>
                      <button
                        className="button secondary"
                        onClick={() => update({ id: row.requestId }, false)}
                      >
                        {row.requestId}
                      </button>
                    </td>
                    <td>
                      <Link
                        to={`${kind === 'invoice' ? '/invoices' : '/credit-notes'}?id=${encodeURIComponent(row.zohoDocumentId)}`}
                      >
                        {row.documentNumber ?? row.zohoDocumentId}
                      </Link>
                    </td>
                    <td>{row.customerName ?? 'Unavailable'}</td>
                    <td>
                      <time dateTime={row.createdAt}>
                        {new Date(row.createdAt).toLocaleString()}
                      </time>
                    </td>
                    <td>
                      <Status value={row.fiscalizationStatus} />
                    </td>
                    <td>
                      <Status value={row.transmissionStatus} />
                    </td>
                    <td>
                      <Status value={row.reconciliationStatus} />
                    </td>
                    <td>
                      <Status value={row.writebackStatus} />
                    </td>
                    <td>{row.attemptCount}</td>
                    <td>
                      <time dateTime={row.updatedAt}>
                        {new Date(row.updatedAt).toLocaleString()}
                      </time>
                    </td>
                    <td>
                      {row.lastError
                        ? `${row.lastError.code}: ${row.lastError.message}`
                        : 'None returned'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows?.length === 0 && <p role="status">No requests match these filters.</p>}
          <div className="api-pagination">
            <span>
              {query.data.total} matching requests - Page {query.data.page}
            </span>
            <div>
              <button
                disabled={page <= 1 || query.isFetching}
                onClick={() => update({ page: String(page - 1) }, false)}
              >
                Previous page
              </button>
              <button
                disabled={
                  query.data.page * query.data.pageSize >= query.data.total || query.isFetching
                }
                onClick={() => update({ page: String(page + 1) }, false)}
              >
                Next page
              </button>
            </div>
          </div>
        </>
      )}
      <div className="api-source-note">
        Fiscalization retry and Retry Zoho Writeback require a middleware operator session. The
        dashboard read bearer cannot authorize either action. The supplied contract does not define
        how this dashboard establishes that session or the complete action response schemas;
        operational actions remain unavailable until those integration details are supplied. Retry
        eligibility stays with middleware.
      </div>
      {id && (
        <RecordDrawer selected={{ kind, id }} onClose={() => update({ id: undefined }, false)} />
      )}
    </>
  )
}
