// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import {
  mockInvoices,
  mockCreditNotes,
  mockInvoiceDetails,
  mockCreditNoteDetails,
} from './mock-api-fixtures'
import { invoiceDocumentFixture } from './__fixtures__/document-fixtures'

vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: { role: 'admin' } }) }))

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
async function mount(fetch: ReturnType<typeof vi.fn>, route = '/requests') {
  vi.stubEnv('DEV', false)
  vi.stubEnv('VITE_DATA_MODE', 'api')
  vi.stubGlobal('fetch', fetch)
  const { ApiRequests } = await import('./ApiRequests')
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false } } })
      }
    >
      <MemoryRouter initialEntries={[route]}>
        <ApiRequests />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
function requestFetch(total = 1) {
  return vi.fn(async (path: string) => {
    const sourceInvoiceId = path.match(/\/api\/dashboard\/documents\/invoices\/([^?]+)/)?.[1]
    if (sourceInvoiceId) {
      const zohoDocumentId = decodeURIComponent(sourceInvoiceId)
      const source = mockInvoices.find((item) => item.zohoDocumentId === zohoDocumentId)
      return json({
        documentType: 'invoice',
        zohoDocumentId,
        document: { ...invoiceDocumentFixture, invoice_id: zohoDocumentId },
        fiscalizationRequest: source
          ? { requestId: source.requestId, status: source.fiscalizationStatus }
          : null,
      })
    }
    const writebackRequestId = path.match(/\/writebacks\/(?:invoices|credit-notes)\/([^?]+)/)?.[1]
    if (writebackRequestId)
      return json({ status: 'failed', requestId: decodeURIComponent(writebackRequestId) })
    if (path.includes('/invoice?')) return json(mockInvoiceDetails[mockInvoices[0].requestId])
    if (path.includes('/credit-note?'))
      return json(mockCreditNoteDetails[mockCreditNotes[1].requestId])
    const query = new URL(path, 'https://dashboard.test').searchParams
    return json({
      page: Number(query.get('page') ?? 1),
      pageSize: Number(query.get('pageSize') ?? 25),
      total,
      items: total
        ? path.startsWith('/api/dashboard/credit-notes')
          ? [mockCreditNotes[1]]
          : [mockInvoices[0]]
        : [],
    })
  })
}

describe('documented fiscalization request history', () => {
  it('uses the documented invoice history DTO and keeps execution, transmission and writeback independent', async () => {
    const fetch = requestFetch()
    await mount(fetch)
    const row = (await screen.findByText(mockInvoices[0].documentNumber!)).closest('tr')!
    expect(within(row).getByText('Succeeded')).toBeInTheDocument()
    expect(within(row).getByText('succeeded')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: mockInvoices[0].documentNumber! })).toHaveAttribute(
      'href',
      `/invoices?id=${mockInvoices[0].zohoDocumentId}`,
    )
    expect(fetch.mock.calls[0][0]).toBe('/api/dashboard/invoices?page=1&pageSize=25')
    expect(fetch.mock.calls.every(([path]) => !path.startsWith('/api/dashboard/requests'))).toBe(
      true,
    )
    expect(
      screen.getByText(/writeback recovery is a separate authenticated action/),
    ).toBeInTheDocument()
    expect(screen.getByText(/not the complete Zoho Books registers/)).toBeInTheDocument()
    expect(
      screen.getByText(/Documents never submitted to middleware are not included/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
  }, 15_000)
  it.each(['invoice', 'credit_note'] as const)(
    'shows confirmed %s receipt evidence from list data even when request details are unavailable',
    async (kind) => {
      const source = kind === 'invoice' ? mockInvoices[0] : mockCreditNotes[0]
      const row = {
        ...source,
        confirmedReceiptEvidence: true,
        receiptNumber: '000123456',
        qrCode: 'https://verification.example.test/?invoiceNo=000123456',
        fiscalizedAt: '2026-11-18T10:00:00Z',
      }
      const fetch = vi.fn(async () => json({ page: 1, pageSize: 25, total: 1, items: [row] }))
      await mount(fetch, `/requests?kind=${kind}`)
      const rendered = (await screen.findByText(source.documentNumber!)).closest('tr')!
      expect(within(rendered).getByText('000123456')).toBeInTheDocument()
      expect(within(rendered).getByRole('link', { name: /Open persisted QR/ })).toHaveAttribute(
        'href',
        row.qrCode,
      )
      expect(rendered.querySelector('time[datetime="2026-11-18T10:00:00Z"]')).toBeInTheDocument()
      expect(fetch).toHaveBeenCalledOnce()
    },
  )
  it('does not turn unconfirmed or inconsistent list evidence into a confirmed receipt', async () => {
    const row = {
      ...mockInvoices[0],
      confirmedReceiptEvidence: false,
      receiptNumber: 'UNCONFIRMED-RECEIPT',
      qrCode: 'https://verification.example.test/?invoiceNo=UNCONFIRMED-RECEIPT',
      fiscalizedAt: '2026-11-18T10:00:00Z',
    }
    await mount(vi.fn(async () => json({ page: 1, pageSize: 25, total: 1, items: [row] })))
    expect(await screen.findByText('No confirmed receipt')).toBeInTheDocument()
    expect(screen.queryByText('UNCONFIRMED-RECEIPT')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Open persisted QR/ })).not.toBeInTheDocument()
  })
  it('rejects malformed request IDs without opening a drawer or fetching details', async () => {
    const fetch = requestFetch()
    await mount(fetch, '/requests?id=..%2Fservices')
    expect(screen.getByRole('alert')).toHaveTextContent('The request ID is invalid')
    await screen.findByText(mockInvoices[0].documentNumber!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetch.mock.calls.every(([path]) => path.startsWith('/api/dashboard/invoices?'))).toBe(
      true,
    )
  })
  it.each([
    'page=garbage',
    'page=0',
    'page=1e2',
    'pageSize=101',
    'from=2026-02-30',
    'from=not-a-date',
    'from=2026-11-18&to=2026-11-01',
    'from=2024-01-01&to=2026-11-18',
    'status=MADE_UP',
    'kind=unknown',
  ])('rejects invalid request filters without broadening the query: %s', async (query) => {
    const fetch = requestFetch()
    await mount(fetch, `/requests?${query}`)
    expect(screen.getByRole('alert')).toHaveTextContent('Request filters are invalid')
    expect(screen.getByRole('button', { name: 'Refresh requests' })).toBeDisabled()
    expect(fetch).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await screen.findByText(mockInvoices[0].documentNumber!)
    expect(fetch).toHaveBeenCalledOnce()
  })
  it.each([
    ['invoice', 'Pending', null],
    ['invoice', 'InProgress', null],
    ['invoice', 'Failed', null],
    ['invoice', 'OutcomeUnknown', null],
    ['invoice', 'Failed', 'reconciliation_required'],
    ['credit_note', 'PENDING', null],
    ['credit_note', 'IN_PROGRESS', null],
    ['credit_note', 'FAILED', null],
    ['credit_note', 'RECONCILIATION_REQUIRED', 'reconciliation_required'],
    ['credit_note', 'MANUAL_REVIEW_REQUIRED', null],
  ] as const)(
    'displays %s execution %s and reconciliation %s without inferring a physical receipt state',
    async (kind, execution, reconciliation) => {
      const source = kind === 'invoice' ? mockInvoices[0] : mockCreditNotes[1]
      const row = {
        ...source,
        fiscalizationStatus: execution,
        reconciliationStatus: reconciliation,
        confirmedReceiptEvidence: false,
        receiptNumber: null,
        qrCode: null,
        fiscalizedAt: null,
      }
      const fetch = vi.fn(async () => json({ page: 1, pageSize: 25, total: 1, items: [row] }))
      await mount(fetch, `/requests?kind=${kind}`)
      const rendered = (await screen.findByText(source.documentNumber!)).closest('tr')!
      expect(within(rendered).getByText(execution)).toBeInTheDocument()
      if (reconciliation) expect(within(rendered).getByText(reconciliation)).toBeInTheDocument()
      expect(screen.getByText(/not the current physical G03 receipt state/)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'View current G03 receipt state' })).toHaveAttribute(
        'href',
        '/device',
      )
      expect(screen.queryByRole('heading', { name: /Receipt state:/ })).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /retry|resubmit|cancel|fiscalize/i }),
      ).not.toBeInTheDocument()
      expect(fetch.mock.calls.length).toBeGreaterThan(0)
    },
  )

  it('loads credit-note requests and manual-review state without fabricating customer data', async () => {
    const fetch = requestFetch()
    await mount(fetch, '/requests?kind=credit_note&status=MANUAL_REVIEW_REQUIRED')
    const row = (await screen.findByText(mockCreditNotes[1].documentNumber!)).closest('tr')!
    expect(within(row).getByText('MANUAL_REVIEW_REQUIRED')).toBeInTheDocument()
    expect(within(row).getAllByText('Unavailable').length).toBeGreaterThan(0)
    expect(fetch.mock.calls[0][0]).toContain('/api/dashboard/credit-notes?')
    expect(fetch.mock.calls[0][0]).toContain('state=MANUAL_REVIEW_REQUIRED')
    expect(fetch.mock.calls[0][0]).not.toContain('status=')
    expect(screen.queryByLabelText('Transmission status')).not.toBeInTheDocument()
  })
  it('preserves filters when opening and closing documented invoice detail with persisted evidence', async () => {
    const fetch = requestFetch()
    await mount(fetch, `/requests?status=Succeeded&id=${mockInvoices[0].requestId}`)
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('Confirmed receipt evidence')
    expect(await within(dialog).findByText('UI fixture description')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: /Open persisted QR/ })).toHaveAttribute(
      'href',
      mockInvoices[0].qrCode,
    )
    expect(within(dialog).getAllByText('Attempt history').length).toBeGreaterThan(0)
    expect(within(dialog).getByText('Request timeline')).toBeInTheDocument()
    expect(
      fetch.mock.calls.some(
        ([path]) => path === `/api/dashboard/invoice?id=${mockInvoices[0].requestId}`,
      ),
    ).toBe(true)
    expect(
      fetch.mock.calls.some(
        ([path]) => path === `/api/dashboard/documents/invoices/${mockInvoices[0].zohoDocumentId}`,
      ),
    ).toBe(true)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close details' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toHaveValue('Succeeded')
  })
  it('opens credit-note detail with its distinct diagnostics and receipt state', async () => {
    const fetch = requestFetch()
    await mount(fetch, `/requests?kind=credit_note&id=${mockCreditNotes[1].requestId}`)
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('Persisted diagnostics')
    expect(within(dialog).getByText('No confirmed receipt evidence')).toBeInTheDocument()
    expect(within(dialog).getByText('Original invoice relationship')).toBeInTheDocument()
    expect(within(dialog).getByText('Device attempt 1 completed')).toBeInTheDocument()
    const timeline = within(dialog).getByText('Persisted request timeline').parentElement!
    const timelineTimes = Array.from(timeline.querySelectorAll('time')).map((element) =>
      new Date(element.textContent!).getTime(),
    )
    expect(timelineTimes).toEqual([...timelineTimes].sort((a, b) => a - b))
    expect(
      fetch.mock.calls.some(
        ([path]) => path === `/api/dashboard/credit-note?id=${mockCreditNotes[1].requestId}`,
      ),
    ).toBe(true)
  })
  it('shows reporting attempts and invoice retry counts separately from confirmed receipt evidence', async () => {
    const source = mockInvoiceDetails[mockInvoices[0].requestId]
    const fallback = requestFetch()
    const fetch = vi.fn(async (path: string) =>
      path.includes('/invoice?')
        ? json({
            request: {
              ...source.request,
              etims: {
                status: 'reconciliation_required',
                reconciliationRequired: true,
                attempts: [
                  {
                    attemptNumber: 2,
                    attemptType: 'poll',
                    outcome: 'Failed',
                    startedAt: '2026-11-14T10:00:00Z',
                    completedAt: '2026-11-14T10:01:00Z',
                    errorCategory: 'READ_TIMEOUT',
                  },
                ],
              },
              writeback: { ...source.request.writeback!, retryCount: 3 },
            },
          })
        : fallback(path),
    )
    await mount(fetch, `/requests?id=${mockInvoices[0].requestId}`)
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('poll attempt 2')).toBeInTheDocument()
    expect(within(dialog).getByText('READ_TIMEOUT')).toBeInTheDocument()
    expect(
      within(dialog)
        .getAllByText('Retry count')
        .some((label) => label.parentElement?.textContent === 'Retry count3'),
    ).toBe(true)
    expect(within(dialog).getByRole('link', { name: /Open persisted QR/ })).toHaveAttribute(
      'href',
      source.request.evidence!.qrVerificationUrl,
    )
    expect(fetch.mock.calls.every(([path]) => path.startsWith('/api/dashboard/'))).toBe(true)
  })
  it('passes search, date and middleware-only filters to persisted history and resets pagination', async () => {
    const fetch = requestFetch(51)
    await mount(fetch, '/requests?page=2')
    await screen.findByText('51 matching requests - Page 2')
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Search requests'), 'INV-42')
    await user.click(screen.getByRole('button', { name: /^Search$/ }))
    await user.selectOptions(screen.getByLabelText('Transmission status'), 'TRANSMISSION_PENDING')
    await user.selectOptions(
      screen.getByLabelText('Reconciliation status'),
      'reconciliation_required',
    )
    await user.selectOptions(screen.getByLabelText('Writeback status'), 'failed')
    await user.type(screen.getByLabelText('Created from (UTC)'), '2026-11-01')
    await user.type(screen.getByLabelText('Created to (UTC)'), '2026-11-14')
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(([path]) => {
          const query = new URL(path, 'https://dashboard.test').searchParams
          return (
            query.get('page') === '1' &&
            query.get('search') === 'INV-42' &&
            query.get('transmissionStatus') === 'TRANSMISSION_PENDING' &&
            query.get('reconciliationStatus') === 'reconciliation_required' &&
            query.get('writebackStatus') === 'failed' &&
            query.get('createdFrom') === '2026-11-01T00:00:00.000Z' &&
            query.get('createdTo') === '2026-11-14T23:59:59.999Z'
          )
        }),
      ).toBe(true),
    )
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    await screen.findByText('51 matching requests - Page 2')
  })
  it('shows real errors rather than a successful empty register', async () => {
    await mount(
      vi.fn(async () =>
        json({ error: { code: 'READ_FAILED', message: 'History unavailable' } }, 503),
      ),
    )
    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(
      'Request data unavailable',
    )
    expect(screen.queryByText('No requests match these filters.')).not.toBeInTheDocument()
    expect(screen.queryByText(/matching requests - Page/)).not.toBeInTheDocument()
  })
  it('shows zero only for a successful empty persisted page', async () => {
    await mount(requestFetch(0))
    await screen.findByText('No requests match these filters.')
    expect(screen.getByText('0 matching requests - Page 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  })
})

describe('invoice and credit-note processing error visibility', () => {
  it.each(['invoice', 'credit_note'] as const)(
    'shows %s identity, failed stage, errors, uncertainty and separate writeback evidence',
    async (kind) => {
      const invoice = mockInvoiceDetails[mockInvoices[0].requestId]!.request
      const credit = mockCreditNoteDetails[mockCreditNotes[1].requestId]!.request
      const source = kind === 'invoice' ? invoice : credit
      const stage = kind === 'invoice' ? 'close_receipt' : 'close_credit_note'
      const code = kind === 'invoice' ? 'G03_TIMEOUT' : 'G03_COMMAND_REJECTED'
      const message = 'The recorded device operation did not provide a confirmed result.'
      const attempt =
        kind === 'invoice'
          ? {
              ...invoice.attempts[0]!,
              stage,
              outcome: 'OutcomeUnknown',
              errorCode: code,
              errorMessage: message,
            }
          : {
              ...credit.attempts[0]!,
              stage,
              status: 'RECONCILIATION_REQUIRED',
              errorCategory: code,
              errorDetails: message,
              deviceEvidence: [],
            }
      const writeback = {
        status: 'failed',
        writtenCustomFieldIds: [],
        errorCategory: 'ZOHO_UPDATE_REJECTED',
        createdAt: '2026-11-17T10:00:00Z',
        updatedAt: '2026-11-17T10:01:00Z',
        completedAt: null,
        ...(kind === 'invoice' ? { retryCount: 1 } : {}),
      }
      const request = {
        ...source,
        fiscalizationStatus: kind === 'invoice' ? 'OutcomeUnknown' : 'RECONCILIATION_REQUIRED',
        confirmedReceiptEvidence: false,
        receiptNumber: null,
        qrCode: null,
        fiscalizedAt: null,
        attempts: [attempt],
        evidence: null,
        writeback,
        writebackStatus: 'failed',
        lastError: { code, message },
      }
      const fallback = requestFetch()
      const fetch = vi.fn(async (path: string) =>
        path.includes(kind === 'invoice' ? '/invoice?' : '/credit-note?')
          ? json({ request })
          : fallback(path),
      )
      await mount(fetch, '/requests?kind=' + kind + '&id=' + source.requestId)
      const dialog = await screen.findByRole('dialog')
      const diagnostics = await within(dialog).findByRole('region', {
        name: 'Processing diagnostics',
      })
      expect(within(diagnostics).getByText(source.documentNumber!)).toBeInTheDocument()
      expect(within(diagnostics).getByText(source.requestId)).toBeInTheDocument()
      expect(within(diagnostics).getByText(stage)).toBeInTheDocument()
      expect(within(diagnostics).getByText(code)).toBeInTheDocument()
      expect(within(diagnostics).getByText(message)).toBeInTheDocument()
      expect(within(diagnostics).getByText('Device contact').nextElementSibling).toHaveTextContent(
        'Not established by this API response; an attempt alone does not prove contact',
      )
      expect(
        within(diagnostics).getByText('Fiscal receipt outcome').nextElementSibling,
      ).toHaveTextContent('No confirmed fiscal receipt evidence')
      expect(
        within(diagnostics).getByText('Zoho writeback state').nextElementSibling,
      ).toHaveTextContent('failed')
      expect(within(diagnostics).getByText('ZOHO_UPDATE_REJECTED')).toBeInTheDocument()
      expect(diagnostics).toHaveTextContent('whether the G03 currently has an open receipt')
      expect(fetch.mock.calls.every(([path]) => path.startsWith('/api/dashboard/'))).toBe(true)
    },
  )

  it('does not invent a failed stage or device contact when no attempt is persisted', async () => {
    const source = mockInvoiceDetails[mockInvoices[0].requestId]!.request
    const fallback = requestFetch()
    const fetch = vi.fn(async (path: string) =>
      path.includes('/invoice?')
        ? json({
            request: {
              ...source,
              fiscalizationStatus: 'Failed',
              confirmedReceiptEvidence: false,
              attempts: [],
              evidence: null,
              receiptNumber: null,
              qrCode: null,
              fiscalizedAt: null,
              lastError: {
                code: 'VALIDATION_REJECTED',
                message: 'The document failed validation.',
              },
            },
          })
        : fallback(path),
    )
    await mount(fetch, '/requests?id=' + source.requestId)
    const diagnostics = await screen.findByRole('region', { name: 'Processing diagnostics' })
    expect(
      within(diagnostics).getByText('Latest stage with recorded error').nextElementSibling,
    ).toHaveTextContent('Not reported')
    expect(
      within(diagnostics).getByText('Recorded attempt outcome').nextElementSibling,
    ).toHaveTextContent('Not reported')
    expect(within(diagnostics).getByText('VALIDATION_REJECTED')).toBeInTheDocument()
    expect(within(diagnostics).getByText('The document failed validation.')).toBeInTheDocument()
    expect(within(diagnostics).getByText('Device contact').nextElementSibling).toHaveTextContent(
      'Not established',
    )
  })

  it('retains confirmed fiscal evidence when only Zoho writeback failed', async () => {
    const source = mockInvoiceDetails[mockInvoices[0].requestId]!.request
    const fallback = requestFetch()
    const fetch = vi.fn(async (path: string) =>
      path.includes('/invoice?')
        ? json({
            request: {
              ...source,
              writebackStatus: 'failed',
              writeback: {
                ...source.writeback!,
                status: 'failed',
                errorCategory: 'ZOHO_UPDATE_REJECTED',
              },
            },
          })
        : fallback(path),
    )
    await mount(fetch, '/requests?id=' + source.requestId)
    const diagnostics = await screen.findByRole('region', { name: 'Processing diagnostics' })
    expect(
      within(diagnostics).getByText('Recorded processing state').nextElementSibling,
    ).toHaveTextContent('Succeeded')
    expect(
      within(diagnostics).getByText('Fiscal receipt outcome').nextElementSibling,
    ).toHaveTextContent('Confirmed fiscal receipt evidence persisted')
    expect(within(diagnostics).getByText('Device contact').nextElementSibling).toHaveTextContent(
      'Confirmed by persisted receipt evidence',
    )
    expect(
      within(diagnostics).getByText('Zoho writeback state').nextElementSibling,
    ).toHaveTextContent('failed')
    expect(within(diagnostics).getByText('ZOHO_UPDATE_REJECTED')).toBeInTheDocument()
    expect(screen.queryByText('Receipt state: OPEN')).not.toBeInTheDocument()
  })
})
