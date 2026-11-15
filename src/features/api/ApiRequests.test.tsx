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
    expect(screen.getByText(/read bearer cannot authorize/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
  }, 15_000)
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
    expect(within(dialog).getByRole('link', { name: /Open persisted QR/ })).toHaveAttribute(
      'href',
      mockInvoices[0].qrCode,
    )
    expect(within(dialog).getByText('Attempt history')).toBeInTheDocument()
    expect(within(dialog).getByText('Request timeline')).toBeInTheDocument()
    expect(
      fetch.mock.calls.some(
        ([path]) => path === `/api/dashboard/invoice?id=${mockInvoices[0].requestId}`,
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
    expect(within(dialog).getByText('Retry count').parentElement).toHaveTextContent('3')
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
