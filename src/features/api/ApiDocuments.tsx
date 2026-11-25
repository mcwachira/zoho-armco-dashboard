import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileText,
  RefreshCw,
  Search,
} from 'lucide-react'
import { apiMode, getJson } from '@/lib/api/client'
import {
  documentDetailPath,
  documentListPath,
  documentQuerySchema,
  documentPageSchema,
  documentDetailSchema,
  type DocumentKind,
  type DocumentQuery,
} from './document-contracts'
import {
  documentAmount,
  documentDate,
  documentNumber,
  zohoId,
  type ProvisionalFiscalization,
} from './document-provisional'
import { DocumentDetailView, DocumentStatus, RelatedInvoice } from './DocumentDetailView'
import { writebackOperationSchema } from './operation-contracts'
import { ReceiptReconciliation, ReconciliationBadge } from './ReceiptReconciliation'
import {
  receiptReconciliationStatuses,
  resolveReceiptReconciliation,
  safeVerificationUrl,
} from './reconciliation-contracts'
import './api-operational-pages.css'
import './documents.css'

function dateBoundary(value: string, end = false) {
  if (!value) return undefined
  const date = new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? date.toISOString()
    : 'invalid'
}
function pageNumber(value: string | null, fallback: number) {
  return value === null ? fallback : /^\d+$/.test(value) ? Number(value) : NaN
}

export function ApiDocuments({
  kind,
  reconciliation = false,
}: {
  kind: DocumentKind
  reconciliation?: boolean
}) {
  const [search, setSearch] = useSearchParams()
  const location = useLocation()
  const title = kind === 'invoice' ? 'Invoice' : 'Credit-note'
  const pluralPath = reconciliation
    ? '/reconciliation'
    : kind === 'invoice'
      ? '/invoices'
      : '/credit-notes'
  const id = search.get('id')?.trim() ?? ''
  const [lookup, setLookup] = useState('')
  const [draftSearch, setDraftSearch] = useState(search.get('search') ?? '')
  const appliedSearch = search.get('search') ?? ''
  useEffect(() => setDraftSearch(appliedSearch), [appliedSearch])
  const registerParams = new URLSearchParams(search)
  registerParams.delete('id')
  const registerPath = `${pluralPath}${registerParams.size ? `?${registerParams}` : ''}`
  const page = pageNumber(search.get('page'), 1)
  const pageSize = pageNumber(search.get('pageSize'), 25)
  const params: DocumentQuery = {
    page,
    pageSize,
    ...(search.get('search') ? { search: search.get('search')! } : {}),
    ...(search.get('status') ? { status: search.get('status')! } : {}),
    ...(search.get('reconciliationStatus')
      ? {
          reconciliationStatus: search.get('reconciliationStatus') as NonNullable<
            DocumentQuery['reconciliationStatus']
          >,
        }
      : {}),
    ...(search.get('customerId') ? { customerId: search.get('customerId')! } : {}),
    ...(search.get('sortBy') ? { sortBy: search.get('sortBy')! } : {}),
    ...(search.get('sortOrder') ? { sortOrder: search.get('sortOrder') as 'A' | 'D' } : {}),
    dateFrom: dateBoundary(search.get('from') ?? ''),
    dateTo: dateBoundary(search.get('to') ?? '', true),
  }
  const validation = documentQuerySchema.safeParse(params)
  const validId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)
  const writebackCandidate =
    location.state && typeof location.state === 'object'
      ? writebackOperationSchema.safeParse(
          (location.state as { writebackOperation?: unknown }).writebackOperation,
        )
      : null
  const expectedWritebackType = kind === 'credit_note' ? 'CREDIT_NOTE' : 'INVOICE'
  const relatedWriteback =
    writebackCandidate?.success &&
    writebackCandidate.data.documentId === id &&
    writebackCandidate.data.documentType.toUpperCase() === expectedWritebackType
      ? writebackCandidate.data
      : undefined
  const path = validation.success ? documentListPath(kind, validation.data) : null
  const list = useQuery({
    queryKey: ['dashboard-documents', kind, path],
    queryFn: async ({ signal }) => {
      const data = await getJson(path!, documentPageSchema, signal)
      if (
        data.page !== page ||
        data.pageSize !== pageSize ||
        data.items.length > pageSize ||
        (data.total !== null && data.items.length > data.total)
      )
        throw new Error('The document pagination does not match the requested page.')
      return data
    },
    enabled: apiMode === 'api' && !id && path !== null,
    retry: false,
    refetchInterval: false,
  })
  const detail = useQuery({
    queryKey: ['dashboard-document-detail', kind, id],
    queryFn: async ({ signal }) => {
      const data = await getJson(documentDetailPath(kind, id), documentDetailSchema, signal)
      if (data.documentType !== kind)
        throw new Error('The returned document type does not match the selected register.')
      const sourceId = kind === 'invoice' ? data.document.invoice_id : data.document.creditnote_id
      if (data.zohoDocumentId !== id || (sourceId != null && sourceId !== id))
        throw new Error('The returned document ID does not match the selected document.')
      return data
    },
    enabled: apiMode === 'api' && !!id && validId,
    retry: false,
    refetchInterval: false,
  })
  const query = id ? detail : list
  const invalid = id ? !validId : !validation.success
  const comparisonFilter = params.reconciliationStatus
  const rows = (list.data?.items ?? [])
    .map((document) => ({ document, comparison: resolveReceiptReconciliation(document) }))
    .filter(({ comparison }) => !comparisonFilter || comparison.status === comparisonFilter)

  function update(values: Record<string, string>, resetPage = true) {
    setSearch((current) => {
      const next = new URLSearchParams(current)
      if (resetPage) next.delete('page')
      for (const [key, value] of Object.entries(values)) {
        if (value.trim()) next.set(key, value.trim())
        else next.delete(key)
      }
      return next
    })
  }

  return (
    <>
      <div className="page-heading api-page-heading">
        <div>
          <span className="eyebrow">ZOHO BOOKS DOCUMENTS</span>
          <h1>
            {reconciliation ? 'CU/KRA Reconciliation' : `${title} ${id ? 'detail' : 'register'}`}
          </h1>
          <p>
            {id
              ? 'Source document, line items and persisted fiscalization information.'
              : 'Review customer documents and their independent fiscalization records.'}
          </p>
        </div>
        {id ? (
          <Link className="button secondary" to={registerPath}>
            <ArrowLeft size={14} /> Back to register
          </Link>
        ) : (
          <Link className="button secondary" to="/fiscalization">
            View fiscalization history
          </Link>
        )}
      </div>
      <div className="api-source-note document-scope-note">
        <FileText size={16} />
        <p>
          {id ? `Zoho document ID: ${id}. ` : ''}Zoho status and middleware fiscalization are
          independent. Missing information is shown as unavailable; a Zoho status does not confirm a
          fiscal receipt.
        </p>
      </div>
      {!id && (
        <section
          className="panel api-panel document-controls"
          aria-label={`${title} register filters`}
        >
          <form
            className="document-filter-form"
            onSubmit={(event) => {
              event.preventDefault()
              update({ search: draftSearch })
            }}
          >
            {reconciliation && (
              <label>
                Document type
                <select value={kind} onChange={(event) => update({ kind: event.target.value })}>
                  <option value="invoice">Invoices</option>
                  <option value="credit_note">Credit notes</option>
                </select>
              </label>
            )}
            <label className="document-search">
              Document number or customer search
              <input
                type="search"
                placeholder="Search by number or customer"
                maxLength={128}
                value={draftSearch}
                onChange={(event) => setDraftSearch(event.target.value)}
              />
            </label>
            <label>
              Zoho status
              <input
                placeholder="Any status"
                maxLength={128}
                value={search.get('status') ?? ''}
                onChange={(event) => update({ status: event.target.value })}
              />
            </label>
            <label>
              CU/KRA reconciliation (current page)
              <select
                value={search.get('reconciliationStatus') ?? ''}
                onChange={(event) => update({ reconciliationStatus: event.target.value }, false)}
              >
                <option value="">All reconciliation statuses</option>
                {receiptReconciliationStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <button className="button secondary" type="submit">
              <Search size={14} /> Search
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => setSearch(reconciliation ? { kind } : {})}
            >
              Clear filters
            </button>
          </form>
          <p className="api-note">
            CU/KRA reconciliation filters only the loaded page. Search, source filters and page
            navigation continue to use the complete document register; totals are source totals.
          </p>
          <details className="document-advanced">
            <summary>Dates, customer and sorting</summary>
            <div className="document-filter-grid">
              <label>
                Customer ID
                <input
                  maxLength={128}
                  value={search.get('customerId') ?? ''}
                  onChange={(event) => update({ customerId: event.target.value })}
                />
              </label>
              <label>
                Document date from (UTC)
                <input
                  type="date"
                  value={search.get('from') ?? ''}
                  max={search.get('to') || undefined}
                  onChange={(event) => update({ from: event.target.value })}
                />
              </label>
              <label>
                Document date to (UTC)
                <input
                  type="date"
                  value={search.get('to') ?? ''}
                  min={search.get('from') || undefined}
                  onChange={(event) => update({ to: event.target.value })}
                />
              </label>
              <label>
                Zoho sort field
                <input
                  maxLength={128}
                  value={search.get('sortBy') ?? ''}
                  onChange={(event) => update({ sortBy: event.target.value })}
                />
              </label>
              <label>
                Sort order
                <select
                  value={search.get('sortOrder') ?? ''}
                  onChange={(event) => update({ sortOrder: event.target.value })}
                >
                  <option value="">Source default</option>
                  <option value="A">Ascending</option>
                  <option value="D">Descending</option>
                </select>
              </label>
            </div>
            <p className="api-note">
              Status and sort values are validated by the source. Fiscalization filters are
              available in fiscalization history.
            </p>
          </details>
        </section>
      )}

      <section
        className="panel api-panel document-results"
        aria-label={`${title} ${id ? 'detail data' : 'register data'}`}
        aria-busy={query.isFetching}
      >
        {invalid || apiMode !== 'api' || query.isPending || query.isError ? (
          <div className="api-availability" role={query.isError || invalid ? 'alert' : 'status'}>
            <AlertCircle size={22} />
            <strong>
              {query.isFetching ? 'Loading document information' : 'Document data unavailable'}
            </strong>
            <span>
              {invalid
                ? 'Check the document ID, date range, page size and filters.'
                : apiMode !== 'api'
                  ? 'Live documents require the authenticated dashboard connection. Sample documents are not substituted.'
                  : query.error instanceof Error
                    ? query.error.message
                    : 'Retrieving document information…'}
            </span>
            {!query.isFetching && !invalid && apiMode === 'api' && (
              <button
                className="button secondary"
                type="button"
                onClick={() => void query.refetch()}
              >
                <RefreshCw size={14} /> Try again
              </button>
            )}
          </div>
        ) : id && detail.data ? (
          <DocumentDetailView
            data={detail.data}
            kind={kind}
            writebackOperation={relatedWriteback}
          />
        ) : !id && list.data ? (
          <>
            <div className="document-register-toolbar">
              <strong>
                {comparisonFilter
                  ? `${rows.length} of ${list.data.items.length} documents on this page match the reconciliation filter`
                  : `${list.data.items.length} documents on this page`}
              </strong>
              <button
                className="button secondary"
                disabled={list.isFetching}
                onClick={() => void list.refetch()}
              >
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
            {rows.length === 0 ? (
              <div className="api-availability" role="status">
                <FileText size={24} />
                <strong>
                  {list.data.items.length > 0
                    ? 'No documents on this page match the reconciliation filter'
                    : 'No documents found'}
                </strong>
                <span>
                  {list.data.items.length > 0
                    ? 'Choose another reconciliation status or navigate to another source page.'
                    : page > 1
                      ? 'There are no documents on this page. Return to the previous page or adjust your filters.'
                      : 'Try another number, customer, status or date range.'}
                </span>
              </div>
            ) : (
              <div
                className="document-table-scroll"
                tabIndex={0}
                role="region"
                aria-label={`${title} table`}
              >
                <table className="document-table">
                  <caption className="sr-only">
                    {title} register. Amounts use the source currency. Unavailable fields appear as
                    a dash.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">{title} number</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Date</th>
                      {kind === 'invoice' && <th scope="col">Due date</th>}
                      <th scope="col">Currency</th>
                      <th scope="col" className="document-numeric">
                        Total
                      </th>
                      {kind === 'invoice' && (
                        <th scope="col" className="document-numeric">
                          Balance
                        </th>
                      )}
                      <th scope="col">Zoho status</th>
                      {kind === 'credit_note' && <th scope="col">Related invoice</th>}
                      <th scope="col">Fiscalization</th>
                      <th scope="col">CU receipt</th>
                      <th scope="col">CU/KRA reconciliation</th>
                      {reconciliation && <th scope="col">KRA invoice number</th>}
                      {reconciliation && <th scope="col">Verification URL</th>}
                      {reconciliation && <th scope="col">Fiscalization evidence</th>}
                      <th scope="col">Fiscalized at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ document: row, comparison }, index) => {
                      const rowId = zohoId(row, kind)
                      const target = new URLSearchParams(search)
                      if (rowId) target.set('id', rowId)
                      return (
                        <tr key={`${rowId ?? 'missing'}-${index}`}>
                          <td>
                            {rowId ? (
                              <Link className="document-number" to={`${pluralPath}?${target}`}>
                                {documentNumber(row, kind) || rowId}
                              </Link>
                            ) : (
                              <span title="The source did not provide a supported document ID">
                                {documentNumber(row, kind) || 'Unavailable'}
                              </span>
                            )}
                          </td>
                          <td>{row.customer_name || '—'}</td>
                          <td>{documentDate(row.date)}</td>
                          {kind === 'invoice' && <td>{documentDate(row.due_date)}</td>}
                          <td>{row.currency_code || '—'}</td>
                          <td className="document-numeric">{documentAmount(row.total)}</td>
                          {kind === 'invoice' && (
                            <td className="document-numeric">{documentAmount(row.balance)}</td>
                          )}
                          <td>
                            <DocumentStatus value={row.status} source="zoho" />
                          </td>
                          {kind === 'credit_note' && (
                            <td>
                              <RelatedInvoice document={row} />
                            </td>
                          )}
                          <td>
                            <FiscalizationStatus summary={row.fiscalizationRequest} />
                          </td>
                          <td className="document-mono">{comparison.cuReceiptNumber ?? '—'}</td>
                          <td>
                            <details className="document-reconciliation">
                              <summary>
                                <ReconciliationBadge value={comparison} />
                                <span className="document-line-description">View comparison</span>
                              </summary>
                              <ReceiptReconciliation value={comparison} compact />
                            </details>
                          </td>
                          {reconciliation && (
                            <td className="document-mono">
                              {comparison.invoiceNo ?? 'Unavailable'}
                            </td>
                          )}
                          {reconciliation && (
                            <td>
                              {safeVerificationUrl(comparison.kraUrl) ? (
                                <a
                                  className="document-number"
                                  href={safeVerificationUrl(comparison.kraUrl)!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  referrerPolicy="no-referrer"
                                >
                                  Open KRA verification
                                </a>
                              ) : (
                                'Unavailable'
                              )}
                            </td>
                          )}
                          {reconciliation && (
                            <td>
                              <FiscalizationEvidence
                                kind={kind}
                                zohoDocumentId={rowId}
                                summary={row.fiscalizationRequest}
                              />
                            </td>
                          )}
                          <td>
                            {documentDate(
                              row.fiscalizationRequest?.deviceValues?.fiscalizedAt ??
                                row.fiscalizationRequest?.fiscalizedAt,
                              true,
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="document-pagination">
              <span>
                {list.data.total === null
                  ? 'Total unavailable from Zoho Books'
                  : `${list.data.total.toLocaleString('en-KE')} documents`}{' '}
                · Page {list.data.page}
              </span>
              <label>
                Rows per page
                <select
                  value={pageSize}
                  onChange={(event) => update({ pageSize: event.target.value })}
                >
                  {[...new Set([25, 50, 100, 200, pageSize])]
                    .sort((a, b) => a - b)
                    .map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                </select>
              </label>
              <div className="document-page-buttons">
                <button
                  className="button secondary"
                  aria-label="Previous page"
                  disabled={page <= 1 || list.isFetching}
                  onClick={() => update({ page: String(page - 1) }, false)}
                >
                  <ChevronLeft size={14} /> Previous
                </button>
                <button
                  className="button secondary"
                  aria-label="Next page"
                  disabled={!list.data.hasMore || list.isFetching}
                  onClick={() => update({ page: String(page + 1) }, false)}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        ) : null}
      </section>
      {!id && (
        <form
          className="panel document-lookup"
          onSubmit={(event) => {
            event.preventDefault()
            if (lookup.trim()) update({ id: lookup }, false)
          }}
        >
          <label>
            Open by Zoho document ID
            <input
              required
              maxLength={128}
              value={lookup}
              onChange={(event) => setLookup(event.target.value)}
            />
          </label>
          <button className="button secondary" type="submit">
            Open document
          </button>
        </form>
      )}
    </>
  )
}

export function ApiReceiptReconciliation() {
  const [search] = useSearchParams()
  return (
    <ApiDocuments
      kind={search.get('kind') === 'credit_note' ? 'credit_note' : 'invoice'}
      reconciliation
    />
  )
}

export function FiscalizationStatus({
  summary,
}: {
  summary: ProvisionalFiscalization | null | undefined
}) {
  return summary === null ? (
    <span className="badge neutral">Not processed</span>
  ) : (
    <DocumentStatus value={summary?.status} source="fiscal" />
  )
}

function FiscalizationEvidence({
  kind,
  zohoDocumentId,
  summary,
}: {
  kind: DocumentKind
  zohoDocumentId: string | undefined
  summary: ProvisionalFiscalization | null | undefined
}) {
  if (!summary) return <span className="document-unavailable">Unavailable</span>

  const requestId = summary.requestId
  const validRequestId =
    typeof requestId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(requestId)
  const requestHref = validRequestId
    ? `/requests?${new URLSearchParams({
        kind,
        id: requestId,
      })}`
    : null
  const values = summary.deviceValues

  return (
    <details className="document-reconciliation">
      <summary>View fiscalization evidence</summary>
      <dl className="document-fields">
        <div>
          <dt>Zoho document ID</dt>
          <dd>{zohoDocumentId ?? 'Unavailable'}</dd>
        </div>
        <div>
          <dt>Fiscalization request ID</dt>
          <dd>
            {requestHref ? (
              <Link className="document-number" to={requestHref}>
                {requestId}
              </Link>
            ) : (
              'Unavailable'
            )}
          </dd>
        </div>
        <div>
          <dt>Execution status</dt>
          <dd>{summary.executionStatus ?? summary.status ?? 'Unavailable'}</dd>
        </div>
        <div>
          <dt>Transmission status</dt>
          <dd>{summary.kraTransmissionStatus ?? values?.kraTransmissionResult ?? 'Unavailable'}</dd>
        </div>
        <div>
          <dt>CU serial number</dt>
          <dd>{values?.cuSerialNumber ?? summary.cuSerialNumber ?? 'Unavailable'}</dd>
        </div>
        <div>
          <dt>CU receipt number</dt>
          <dd>{values?.cuReceiptNumber ?? summary.cuReceiptNumber ?? 'Unavailable'}</dd>
        </div>
        <div>
          <dt>KRA fiscalization URL</dt>
          <dd>
            {safeVerificationUrl(values?.kraQrUrl ?? summary.kraQrUrl) ? (
              <a
                className="document-number"
                href={safeVerificationUrl(values?.kraQrUrl ?? summary.kraQrUrl)!}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
              >
                Open device verification URL
              </a>
            ) : (
              (values?.kraQrUrl ?? summary.kraQrUrl ?? 'Unavailable')
            )}
          </dd>
        </div>
        <div>
          <dt>Attempts</dt>
          <dd>{summary.attempts?.length ?? 'Unavailable'}</dd>
        </div>
        <div>
          <dt>Last error</dt>
          <dd>
            {summary.errorCode || summary.errorMessage
              ? [summary.errorCode, summary.errorMessage].filter(Boolean).join(': ')
              : 'Unavailable'}
          </dd>
        </div>
        <div>
          <dt>Fiscalization time</dt>
          <dd>{documentDate(values?.fiscalizedAt ?? summary.fiscalizedAt, true)}</dd>
        </div>
      </dl>
    </details>
  )
}
