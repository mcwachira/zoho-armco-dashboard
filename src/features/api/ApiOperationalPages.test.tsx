// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

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
  it('renders persisted invoice data, applies server search and opens the API detail timeline', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DATA_MODE', 'api')
    vi.stubEnv('VITE_API_BASE_URL', 'https://middleware.example.test')
    vi.stubEnv('VITE_AUTH_MODE', 'unconfigured')
    const detail = {
      request: {
        ...invoice,
        snapshot: null,
        attempts: [],
        evidence: {
          cuSerialNumber: 'CU-SERIAL-42',
          cuInvoiceNumber: 'CU-42',
          cuReceiptNumber: 'CU-42',
          qrVerificationUrl: invoice.qrCode,
          fiscalizedAtLocal: '2026-11-09T13:02:00',
          timeZone: 'Africa/Nairobi',
          fiscalizedAtUtc: invoice.fiscalizedAt,
          evidenceSource: {
            cuSerialNumber: 'startup_configuration',
            cuInvoiceNumber: 'electronic_journal',
            cuReceiptNumber: 'close_receipt',
            electronicJournal: 'tremol_g03',
            qrVerificationUrl: 'close_receipt',
            fiscalizedAt: 'electronic_journal',
            transmissionStatus: 'successful_g03_receipt',
          },
        },
        etims: null,
        writeback: null,
        manualReview: null,
        timeline: [
          {
            event: 'request_received',
            timestamp: invoice.createdAt,
            status: 'persisted',
          },
        ],
      },
    }
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input), 'https://dashboard.example.test')
      if (url.pathname === '/api/dashboard/invoices/request-42') return jsonResponse(detail)
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
    const { ApiFiscalization } = await import('./ApiOperationalPages')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const user = userEvent.setup()

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ApiFiscalization range="24h" />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('INV-42')).toBeInTheDocument()
    expect(screen.getByText('CU-42')).toBeInTheDocument()
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

    await user.click(screen.getByText('INV-42'))
    expect(await screen.findByRole('dialog', { name: 'INV-42' })).toBeInTheDocument()
    expect(await screen.findByText('request_received')).toBeInTheDocument()
    expect(screen.getByText('Persisted request detail')).toBeInTheDocument()

    queryClient.clear()
  })
})
