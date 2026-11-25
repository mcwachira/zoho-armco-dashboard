// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: { role: 'admin' } }) }))

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const invoice = {
  requestId: 'request-42',
  documentType: 'invoice' as const,
  zohoDocumentId: 'zoho-42',
  documentNumber: 'INV-42',
  customerName: 'Verified Customer',
  amount: '116.00',
  currency: 'KES',
  fiscalizationStatus: 'Succeeded',
  transmissionStatus: 'TRANSMISSION_CONFIRMED',
  reconciliationStatus: 'accepted',
  writebackStatus: 'not_attempted',
  confirmedReceiptEvidence: true,
  receiptNumber: 'CU-42',
  qrCode: 'https://etims.example.test/receipt/CU-42',
  fiscalizedAt: '2026-11-09T10:02:00.000Z',
  createdAt: '2026-11-09T10:00:00.000Z',
  updatedAt: '2026-11-09T10:03:00.000Z',
  attemptCount: 1,
  lastError: null,
  correlationId: 'correlation-42',
}

describe('authenticated operational views', () => {
  it('opens a filtered credit-note deep link and keeps writeback independent of fiscalization', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DATA_MODE', 'api')
    const { mockCreditNotes, mockCreditNoteDetails } = await import('./mock-api-fixtures')
    const note = {
      ...mockCreditNotes[0],
      fiscalizationStatus: 'FISCALIZED',
      writebackStatus: 'failed',
    }
    const fetch = vi.fn(async (path: string) => {
      const url = new URL(path, 'https://dashboard.test')
      const params = url.searchParams
      if (url.pathname === `/api/dashboard/documents/credit-notes/${note.zohoDocumentId}`)
        return jsonResponse({
          documentType: 'credit_note',
          zohoDocumentId: note.zohoDocumentId,
          document: {
            creditnote_id: note.zohoDocumentId,
            creditnote_number: note.documentNumber,
            customer_name: note.customerName,
            line_items: [],
          },
          fiscalizationRequest: {
            requestId: note.requestId,
            status: note.fiscalizationStatus,
            cuReceiptNumber: note.receiptNumber,
            kraQrUrl: note.qrCode,
            fiscalizedAt: note.fiscalizedAt,
          },
        })
      if (url.pathname === '/api/dashboard/credit-note')
        return jsonResponse(mockCreditNoteDetails[params.get('id')!]!)
      return jsonResponse({
        page: 1,
        pageSize: 25,
        total: 1,
        items:
          path.startsWith('/api/dashboard/credit-notes') && params.get('state') === 'FISCALIZED'
            ? [note]
            : [invoice],
      })
    })
    vi.stubGlobal('fetch', fetch)
    const { ApiFiscalization } = await import('./ApiOperationalPages')
    const { ApiDocuments } = await import('./ApiDocuments')
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/fiscalization?kind=credit_note&status=FISCALIZED']}>
          <Routes>
            <Route path="/fiscalization" element={<ApiFiscalization range="24h" />} />
            <Route path="/credit-notes" element={<ApiDocuments kind="credit_note" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText(note.documentNumber!)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Credit notes' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByLabelText('Fiscalization status')).toHaveValue('FISCALIZED')
    expect(screen.getByRole('columnheader', { name: 'ZOHO WRITEBACK' })).toBeInTheDocument()
    const row = screen.getByText(note.documentNumber!).closest('tr')!
    expect(within(row).getByText('FISCALIZED')).toBeInTheDocument()
    expect(within(row).getByText('failed')).toBeInTheDocument()
    expect(
      within(row).getByRole('link', { name: `Open execution request ${note.requestId}` }),
    ).toHaveAttribute('href', `/requests?kind=credit_note&id=${encodeURIComponent(note.requestId)}`)
    expect(screen.getByText(/Zoho documents never submitted are unavailable/)).toBeInTheDocument()
    expect(
      within(row).getByRole('link', {
        name: `Open credit note details for ${note.documentNumber}`,
      }),
    ).toHaveAttribute('href', `/credit-notes?id=${note.zohoDocumentId}`)
    await userEvent.setup().click(within(row).getByText('FISCALIZED'))
    expect(await screen.findByRole('region', { name: 'Document information' })).toBeInTheDocument()
    expect(screen.getAllByText(note.receiptNumber!).length).toBeGreaterThan(0)
    expect(fetch).toHaveBeenCalledWith(
      `/api/dashboard/documents/credit-notes/${note.zohoDocumentId}`,
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    )
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/dashboard\/credit-note\?/),
      expect.anything(),
    )
  }, 15_000)

  it('shows unavailable register totals when upstream reads fail', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DATA_MODE', 'api')
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { code: 'HISTORY_UNAVAILABLE', message: 'Request history unavailable' },
            }),
            { status: 503 },
          ),
      ),
    )
    const { ApiFiscalization } = await import('./ApiOperationalPages')
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <ApiFiscalization range="24h" />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(
      await screen.findByText('Record count unavailable', {}, { timeout: 4000 }),
    ).toBeInTheDocument()
    expect(screen.queryByText('0 matching invoice records')).not.toBeInTheDocument()
    expect(screen.queryByText('No matching requests')).not.toBeInTheDocument()
  })

  it('separates failed and uncertain execution metrics and links each to filtered registers', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DATA_MODE', 'api')
    const { mockOverview } = await import('./mock-api-fixtures')
    const overview = mockOverview('2026-11-01T00:00:00.000Z', '2026-11-14T23:59:59.999Z')
    if (overview.availability !== 'available') throw new Error('Available fixture required')
    overview.metrics.invoices.requestsByStatus = { Failed: 2, OutcomeUnknown: 3, Pending: 4 }
    overview.metrics.creditNotes.requestsByState = {
      FAILED: 5,
      RECONCILIATION_REQUIRED: 7,
      WRITEBACK_PENDING: 11,
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) =>
        path.startsWith('/api/dashboard/overview')
          ? jsonResponse(overview)
          : path.startsWith('/api/dashboard/services')
            ? new Response('', { status: 503 })
            : jsonResponse({ page: 1, pageSize: 25, total: 0, items: [] }),
      ),
    )
    const { ApiOverview } = await import('./ApiOperationalPages')
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <ApiOverview range="24h" />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const failed = (await screen.findByText('FAILED EXECUTIONS')).closest(
      '.stat-card',
    ) as HTMLElement
    const uncertain = screen.getByText('UNCERTAIN OUTCOMES').closest('.stat-card') as HTMLElement
    expect(within(failed).getByText('7')).toBeInTheDocument()
    expect(within(uncertain).getByText('10')).toBeInTheDocument()
    expect(within(failed).getByRole('link', { name: 'Invoices' })).toHaveAttribute(
      'href',
      '/requests?kind=invoice&status=Failed',
    )
    expect(within(uncertain).getByRole('link', { name: 'Credit notes' })).toHaveAttribute(
      'href',
      '/requests?kind=credit_note&status=RECONCILIATION_REQUIRED',
    )
    const pending = screen.getByText('PENDING / IN PROGRESS').closest('.stat-card') as HTMLElement
    expect(within(pending).getByText('4')).toBeInTheDocument()
  }, 15_000)

  it('opens Zoho invoice details from fiscalization history using the Zoho document ID', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DATA_MODE', 'api')
    vi.stubEnv('VITE_API_BASE_URL', 'https://middleware.example.test')
    vi.stubEnv('VITE_AUTH_MODE', 'unconfigured')
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input), 'https://dashboard.example.test')
      if (url.pathname === '/api/dashboard/documents/invoices/zoho-42')
        return jsonResponse({
          documentType: 'invoice',
          zohoDocumentId: 'zoho-42',
          document: {
            invoice_id: 'zoho-42',
            invoice_number: 'INV-42',
            customer_name: 'Verified Customer',
            line_items: [],
          },
          fiscalizationRequest: {
            requestId: invoice.requestId,
            status: invoice.fiscalizationStatus,
            cuReceiptNumber: invoice.receiptNumber,
            kraQrUrl: invoice.qrCode,
            fiscalizedAt: invoice.fiscalizedAt,
          },
        })
      if (url.pathname === '/api/dashboard/invoices') {
        const matches =
          !url.searchParams.has('search') || url.searchParams.get('search') === 'INV-42'
        return jsonResponse({
          page: 1,
          pageSize: 25,
          total: matches ? 1 : 0,
          items: matches ? [invoice] : [],
        })
      }
      return new Response('', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchSpy)
    vi.resetModules()
    const { ApiFiscalization, statusBadgeTone } = await import('./ApiOperationalPages')
    const { ApiDocuments } = await import('./ApiDocuments')
    expect(statusBadgeTone('unavailable')).toBe('bad')
    expect(statusBadgeTone('not_available')).toBe('bad')
    expect(statusBadgeTone('available')).toBe('good')
    expect(statusBadgeTone('not_ready')).toBe('warn')
    expect(statusBadgeTone('not_confirmed')).toBe('warn')
    expect(statusBadgeTone('RECONCILIATION_REQUIRED')).toBe('warn')
    expect(statusBadgeTone('endpoint_unreachable')).toBe('bad')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const user = userEvent.setup()

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/fiscalization']}>
          <Routes>
            <Route path="/fiscalization" element={<ApiFiscalization range="24h" />} />
            <Route path="/invoices" element={<ApiDocuments kind="invoice" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('INV-42')).toBeInTheDocument()
    expect(screen.getAllByText('CU-42').length).toBeGreaterThan(0)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/dashboard\/invoices\?/),
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    )

    await user.type(screen.getByRole('textbox', { name: 'Search records' }), 'INV-42')
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Search records' })).toHaveValue('INV-42')
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('search=INV-42'),
        expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
      )
    })

    expect(screen.getByRole('link', { name: 'Open invoice details for INV-42' })).toHaveAttribute(
      'href',
      '/invoices?id=zoho-42',
    )
    await user.click(within(screen.getByText('INV-42').closest('tr')!).getByText('Succeeded'))
    expect(await screen.findByRole('region', { name: 'Document information' })).toBeInTheDocument()
    expect(screen.getByText('Zoho document ID')).toBeInTheDocument()
    expect(screen.getAllByText('Verified Customer').length).toBeGreaterThan(0)
    expect(screen.getAllByText('CU-42').length).toBeGreaterThan(0)
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/dashboard/documents/invoices/zoho-42',
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    )

    queryClient.clear()
  }, 15_000)
})
