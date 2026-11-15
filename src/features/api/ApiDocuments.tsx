import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, FileText, RefreshCw, Search } from 'lucide-react'
import { apiMode, getJson } from '@/lib/api/client'
import {
  documentDetailPath,
  documentListPath,
  documentQuerySchema,
  undocumentedDocumentResponseSchema,
  type DocumentKind,
  type DocumentQuery,
} from './document-contracts'
import './api-operational-pages.css'
import './documents.css'

function dateBoundary(value: string, end = false) {
  if (!value) return undefined
  const parsed = new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z`)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined
}

function positivePage(value: string | null, fallback: number) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : fallback
}

export function ApiDocuments({ kind }: { kind: DocumentKind }) {
  const [search, setSearch] = useSearchParams()
  const title = kind === 'invoice' ? 'Invoice' : 'Credit-note'
  const pluralPath = kind === 'invoice' ? '/invoices' : '/credit-notes'
  const id = search.get('id')?.trim() ?? ''
  const [lookup, setLookup] = useState('')
  const [draftSearch, setDraftSearch] = useState(search.get('search') ?? '')
  const appliedSearch = search.get('search') ?? ''
  useEffect(() => setDraftSearch(appliedSearch), [appliedSearch])
  const registerParams = new URLSearchParams(search)
  registerParams.delete('id')
  const registerPath = `${pluralPath}${registerParams.size ? `?${registerParams}` : ''}`
  const page = positivePage(search.get('page'), 1)
  const pageSize = positivePage(search.get('pageSize'), 25)
  const params: DocumentQuery = {
    page,
    pageSize,
    ...(search.get('search') ? { search: search.get('search')! } : {}),
    ...(search.get('status') ? { status: search.get('status')! } : {}),
    ...(search.get('customerId') ? { customerId: search.get('customerId')! } : {}),
    ...(search.get('sortBy') ? { sortBy: search.get('sortBy')! } : {}),
    ...(search.get('sortOrder') ? { sortOrder: search.get('sortOrder') as 'A' | 'D' } : {}),
    dateFrom: dateBoundary(search.get('from') ?? ''),
    dateTo: dateBoundary(search.get('to') ?? '', true),
  }
  const validation = documentQuerySchema.safeParse(params)
  const path = id
    ? documentDetailPath(kind, id)
    : validation.success
      ? documentListPath(kind, validation.data)
      : null
  const query = useQuery({
    queryKey: ['dashboard-documents', kind, path],
    queryFn: ({ signal }) => getJson(path!, undocumentedDocumentResponseSchema, signal),
    enabled: apiMode === 'api' && path !== null,
    retry: false,
    refetchInterval: false,
  })

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
            {title} {id ? 'detail' : 'register'}
          </h1>
          <p>
            {id
              ? 'Original document information and independent middleware fiscalization evidence.'
              : 'The live Zoho register includes documents never submitted to middleware.'}
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
          {id ? `Zoho document ID: ${id}. ` : ''}
          Zoho status, fiscalization, transmission and Zoho writeback are independent. A previous
          request alone does not confirm a fiscal receipt.
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
            <label className="document-search">
              Document number or customer search
              <input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} />
            </label>
            <button className="button secondary" type="submit">
              <Search size={14} /> Search
            </button>
          </form>
          <div className="document-filter-grid">
            <label>
              Customer ID
              <input
                value={search.get('customerId') ?? ''}
                onChange={(event) => update({ customerId: event.target.value })}
              />
            </label>
            <label>
              Zoho status
              <input
                value={search.get('status') ?? ''}
                onChange={(event) => update({ status: event.target.value })}
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
                <option value="">Upstream default</option>
                <option value="A">Ascending</option>
                <option value="D">Descending</option>
              </select>
            </label>
            <label>
              Page size
              <select
                value={pageSize}
                onChange={(event) => update({ pageSize: event.target.value })}
              >
                {[25, 50, 100, 200].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="api-note">
            Zoho status and sort-field values are validated by middleware. Their supported values
            are not enumerated in the supplied contract.
          </p>
          <p className="api-note">
            Middleware fiscalization and transmission filters belong in fiscalization history. Zoho
            cannot apply them to its register; this screen does not filter only the current page.
          </p>
          <button className="button secondary" type="button" onClick={() => setSearch({})}>
            Clear filters
          </button>
        </section>
      )}

      {id && (
        <div className="api-source-note document-scope-note">
          Original Zoho document, line items, custom fields, fiscal receipt, associated requests and
          writeback information remain unavailable until their exact response structure is
          documented.
        </div>
      )}

      <section
        className="panel api-panel"
        aria-label={`${title} ${id ? 'detail data' : 'register data'}`}
      >
        <div className="api-availability" role={query.error ? 'alert' : 'status'}>
          <AlertCircle size={22} />
          <strong>
            {query.isFetching ? 'Loading document information' : 'Document data unavailable'}
          </strong>
          <span>
            {!validation.success && !id
              ? 'The filters are invalid. Check the date range, page size and sort order.'
              : query.error instanceof Error
                ? query.error.message
                : apiMode !== 'api'
                  ? 'Live document data requires the authenticated dashboard gateway. No sample documents are substituted.'
                  : 'The supplied middleware contract names these endpoints but omits the exact document response schemas. No document data is inferred.'}
          </span>
          {!query.isFetching && apiMode === 'api' && path && (
            <button className="button secondary" type="button" onClick={() => void query.refetch()}>
              <RefreshCw size={14} /> Try again
            </button>
          )}
        </div>
        {!id && (
          <p className="api-note">
            Total unavailable from Zoho Books. Pagination requires the middleware hasMore response;
            no page count or zero-result claim can be made while data is unavailable.
          </p>
        )}
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
            <input required value={lookup} onChange={(event) => setLookup(event.target.value)} />
          </label>
          <button className="button secondary" type="submit">
            Open document
          </button>
        </form>
      )}
    </>
  )
}
