// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  documentDetailPath,
  documentListPath,
  documentPagination,
  documentQuerySchema,
  undocumentedDocumentResponseSchema,
} from './document-contracts'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('document contract boundaries', () => {
  it('uses only documented filters and preserves null-total pagination', () => {
    const path = new URL(
      documentListPath('invoice', {
        page: 3,
        pageSize: 200,
        search: 'INV 42',
        status: 'sent',
        customerId: 'customer-1',
        dateFrom: '2026-11-01T00:00:00Z',
        dateTo: '2026-11-15T23:59:59Z',
        sortBy: 'date',
        sortOrder: 'D',
      }),
      'https://dashboard.invalid',
    )
    expect(path.pathname).toBe('/api/dashboard/documents/invoices')
    expect(Object.fromEntries(path.searchParams)).toEqual({
      page: '3',
      pageSize: '200',
      search: 'INV 42',
      status: 'sent',
      customerId: 'customer-1',
      dateFrom: '2026-11-01T00:00:00Z',
      dateTo: '2026-11-15T23:59:59Z',
      sortBy: 'date',
      sortOrder: 'D',
    })
    expect(documentPagination({ page: 3, pageSize: 25, total: null, hasMore: false })).toEqual({
      previousPage: 2,
      nextPage: null,
      totalLabel: 'Total unavailable from Zoho Books',
    })
    expect(documentPagination({ page: 1, pageSize: 25, total: null, hasMore: true }).nextPage).toBe(
      2,
    )
    expect(
      documentPagination({ page: 1, pageSize: 25, total: null, hasMore: true }).previousPage,
    ).toBeNull()
  })

  it('keeps invoice and credit-note detail paths separate and encodes document IDs', () => {
    expect(documentListPath('credit_note')).toBe(
      '/api/dashboard/documents/credit-notes?page=1&pageSize=25',
    )
    expect(documentDetailPath('invoice', 'inv/?1')).toBe(
      '/api/dashboard/documents/invoice?id=inv%2F%3F1',
    )
    expect(documentDetailPath('credit_note', 'cn-1')).toBe(
      '/api/dashboard/documents/credit-note?id=cn-1',
    )
    expect(() => documentDetailPath('invoice', ' ')).toThrow('Zoho document ID')
  })

  it('rejects unsupported middleware-only filters, bad dates and out-of-range pages', () => {
    expect(documentQuerySchema.safeParse({ fiscalizationStatus: 'Failed' }).success).toBe(false)
    expect(documentQuerySchema.safeParse({ transmissionStatus: 'pending' }).success).toBe(false)
    expect(documentQuerySchema.safeParse({ pageSize: 201 }).success).toBe(false)
    expect(documentQuerySchema.safeParse({ page: 0 }).success).toBe(false)
    expect(documentQuerySchema.safeParse({ sortOrder: 'desc' }).success).toBe(false)
    expect(
      documentQuerySchema.safeParse({
        dateFrom: '2026-11-15T00:00:00Z',
        dateTo: '2026-11-01T00:00:00Z',
      }).success,
    ).toBe(false)
    expect(
      documentQuerySchema.safeParse({
        dateFrom: '2026-11-15T01:00:00+03:00',
        dateTo: '2026-11-15T00:00:00Z',
      }).success,
    ).toBe(true)
  })

  it('fails closed on responses whose DTO is not specified, including empty successful pages', () => {
    expect(
      undocumentedDocumentResponseSchema.safeParse({
        page: 1,
        pageSize: 25,
        total: null,
        hasMore: false,
        items: [],
      }).success,
    ).toBe(false)
    expect(
      undocumentedDocumentResponseSchema.safeParse({ invoice: { invoice_id: 'invented' } }).success,
    ).toBe(false)
  })
})

async function renderDocuments(
  kind: 'invoice' | 'credit_note',
  entry: string,
  fetch: ReturnType<typeof vi.fn>,
) {
  vi.stubEnv('DEV', false)
  vi.stubEnv('VITE_DATA_MODE', 'api')
  vi.stubGlobal('fetch', fetch)
  const { ApiDocuments } = await import('./ApiDocuments')
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[entry]}>
        <ApiDocuments kind={kind} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('document register and detail unavailable states', () => {
  it('preserves register filters on the return link from document detail', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: 'CONTRACT_SCHEMA_UNAVAILABLE', message: 'Exact detail schema missing.' },
          }),
          { status: 503 },
        ),
    )
    await renderDocuments(
      'invoice',
      '/invoices?id=zoho-1&search=INV-42&page=3&from=2026-11-01',
      fetch,
    )
    expect(screen.getByRole('link', { name: 'Back to register' })).toHaveAttribute(
      'href',
      '/invoices?search=INV-42&page=3&from=2026-11-01',
    )
    await screen.findByRole('alert')
  })

  it('clears applied filters and the search draft together', async () => {
    const fetch = vi.fn<(path: string) => Promise<Response>>(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'CONTRACT_SCHEMA_UNAVAILABLE',
              message: 'Exact register schema missing.',
            },
          }),
          { status: 503 },
        ),
    )
    await renderDocuments('invoice', '/invoices?search=INV-42&customerId=c-1&page=3', fetch)
    expect(screen.getByLabelText('Document number or customer search')).toHaveValue('INV-42')
    await screen.findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Document number or customer search')).toHaveValue(''),
    )
    expect(screen.getByLabelText('Customer ID')).toHaveValue('')
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([path]) => path === '/api/dashboard/documents/invoices?page=1&pageSize=25',
        ),
      ).toBe(true),
    )
  })

  it.each([
    ['invoice', '/invoices', '/api/dashboard/documents/invoices'],
    ['credit_note', '/credit-notes', '/api/dashboard/documents/credit-notes'],
  ] as const)(
    'shows the actual gateway failure for %s instead of a successful empty register',
    async (kind, entry, endpoint) => {
      const fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'CONTRACT_SCHEMA_UNAVAILABLE',
              message: 'Exact document row schema is missing from the supplied contract.',
            },
          }),
          { status: 503 },
        ),
      )
      await renderDocuments(kind, entry, fetch)
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('Exact document row schema is missing'),
      )
      expect(fetch.mock.calls[0][0]).toBe(`${endpoint}?page=1&pageSize=25`)
      expect(screen.getByText(/Total unavailable from Zoho Books/)).toBeInTheDocument()
      expect(screen.queryByText('No documents found')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /next page/i })).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'View fiscalization history' })).toHaveAttribute(
        'href',
        '/fiscalization',
      )
    },
  )

  it('passes supported search and date filters to the gateway without filtering page rows', async () => {
    const fetch = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: 'CONTRACT_SCHEMA_UNAVAILABLE', message: 'Schema unavailable.' },
          }),
          { status: 503 },
        ),
    )
    await renderDocuments(
      'invoice',
      '/invoices?from=2026-11-01&to=2026-11-15&customerId=c-1',
      fetch,
    )
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Document number or customer search'), 'INV-42')
    await user.click(screen.getByRole('button', { name: /^Search$/ }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    const path = new URL(fetch.mock.calls[1][0], 'https://dashboard.invalid')
    expect(path.searchParams.get('search')).toBe('INV-42')
    expect(path.searchParams.get('dateFrom')).toBe('2026-11-01T00:00:00.000Z')
    expect(path.searchParams.get('dateTo')).toBe('2026-11-15T23:59:59.999Z')
    expect(path.searchParams.get('customerId')).toBe('c-1')
    expect(screen.getByText(/does not filter only the current page/)).toBeInTheDocument()
  })

  it('opens a credit note by Zoho ID without confusing the ID with a request ID', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'CONTRACT_SCHEMA_UNAVAILABLE', message: 'Exact detail schema missing.' },
        }),
        { status: 503 },
      ),
    )
    await renderDocuments('credit_note', '/credit-notes?id=zoho-cn-1', fetch)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    expect(fetch.mock.calls[0][0]).toBe('/api/dashboard/documents/credit-note?id=zoho-cn-1')
    expect(screen.getByRole('heading', { name: 'Credit-note detail' })).toBeInTheDocument()
    expect(screen.getByText(/Zoho document ID: zoho-cn-1/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to register' })).toHaveAttribute(
      'href',
      '/credit-notes',
    )
    expect(screen.queryByRole('button', { name: /fiscaliz|writeback/i })).not.toBeInTheDocument()
  })
})
