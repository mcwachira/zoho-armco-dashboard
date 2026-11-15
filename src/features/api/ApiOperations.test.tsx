// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function showPage(
  fetcher: typeof fetch,
  route = '/writeback',
  family?: 'manual-review' | 'reconciliation' | 'events' | 'operations',
  demo = false,
) {
  vi.stubEnv('DEV', demo)
  vi.stubEnv('VITE_DATA_MODE', demo ? 'mock' : 'api')
  vi.stubGlobal('fetch', fetcher)
  const { ApiWritebackOperations, ApiOperationCollection } = await import('./ApiOperations')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        {family ? <ApiOperationCollection family={family} /> : <ApiWritebackOperations />}
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return client
}

const operation = {
  writebackId: 'wb-1',
  documentType: 'CREDIT_NOTE',
  documentId: 'zoho-note-1',
  requestId: 'request-1',
  status: 'failed',
  errorCategory: 'UPSTREAM_ERROR',
  retryCount: 0,
  providerExchangeCount: 2,
  nextRetryAt: null,
  createdAt: '2026-11-14T07:00:00Z',
  updatedAt: '2026-11-14T07:01:00Z',
  completedAt: null,
}

describe('operational collections', () => {
  it('renders independent writeback persistence fields and paginates server data', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const page = Number(new URL(String(input), 'https://dashboard.test').searchParams.get('page'))
      return response({
        page,
        pageSize: 25,
        total: 26,
        items: [{ ...operation, writebackId: `wb-${page}`, documentId: `note-page-${page}` }],
      })
    })
    const client = await showPage(fetcher)
    expect(await screen.findByText('note-page-1')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'request-1' })).toHaveAttribute(
      'href',
      '/requests?id=request-1&kind=credit_note',
    )
    expect(screen.getByText('UPSTREAM_ERROR')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Next page' }))
    expect(await screen.findByText('note-page-2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    expect(fetcher.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true)
    expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument()
    client.clear()
  })

  it('forwards documented writeback filters and preserves upstream failure', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      response(
        { error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Writeback store unavailable' } },
        503,
      ),
    )
    const client = await showPage(
      fetcher,
      '/writeback?status=failed&documentType=CREDIT_NOTE&from=2026-11-01&to=2026-11-14',
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Writeback store unavailable')
    const url = new URL(String(fetcher.mock.calls[0][0]), 'https://dashboard.test')
    expect(url.searchParams.get('status')).toBe('failed')
    expect(url.searchParams.get('documentType')).toBe('CREDIT_NOTE')
    expect(url.searchParams.get('createdFrom')).toBe('2026-11-01T00:00:00.000Z')
    expect(url.searchParams.get('createdTo')).toBe('2026-11-14T23:59:59.999Z')
    expect(
      screen.queryByText('No writeback operations match these filters.'),
    ).not.toBeInTheDocument()
    client.clear()
  })

  it('distinguishes empty validated writebacks from malformed response records', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ page: 1, pageSize: 25, total: 0, items: [] }))
      .mockResolvedValueOnce(
        response({
          page: 1,
          pageSize: 25,
          total: 1,
          items: [{ ...operation, providerExchangeCount: '2' }],
        }),
      )
    const client = await showPage(fetcher)
    expect(
      await screen.findByText('No writeback operations match these filters.'),
    ).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh writebacks' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/contract/)
    expect(screen.getByText(/Last successful response; data is stale/)).toBeInTheDocument()
    client.clear()
  })

  it.each(['manual-review', 'reconciliation', 'events', 'operations'] as const)(
    'fails closed for %s records with undocumented DTOs',
    async (family) => {
      const fetcher = vi.fn<typeof fetch>(async () =>
        response({ page: 1, pageSize: 25, total: 1, items: [{ secret: 'must-never-render' }] }),
      )
      const client = await showPage(fetcher, `/${family}`, family)
      expect(await screen.findByRole('alert')).toHaveTextContent(/contract/)
      expect(screen.getByText(/omits its exact record response schema/)).toBeInTheDocument()
      expect(screen.queryByText('must-never-render')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Resolve/ })).not.toBeInTheDocument()
      client.clear()
    },
  )

  it('uses exact case detail static gateway and documented collection filters', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      response({ error: { code: 'CONTRACT_UNAVAILABLE', message: 'Exact DTO missing' } }, 501),
    )
    const client = await showPage(fetcher, '/manual-review', 'manual-review')
    await screen.findByRole('alert')
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Review status'), 'open')
    await user.click(screen.getByRole('button', { name: 'Apply filters' }))
    await waitFor(() =>
      expect(fetcher.mock.calls.some(([url]) => String(url).includes('status=open'))).toBe(true),
    )
    await user.type(screen.getByLabelText('Case ID'), 'case-42')
    await user.click(screen.getByRole('button', { name: 'Open case' }))
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(
          ([url]) => String(url) === '/api/dashboard/manual-review-case?id=case-42',
        ),
      ).toBe(true),
    )
    client.clear()
  })

  it('does not substitute operational fixture data in demo mode', async () => {
    const fetcher = vi.fn()
    const client = await showPage(fetcher, '/writeback', undefined, true)
    expect(screen.getByText(/No sample operations are substituted/)).toBeInTheDocument()
    expect(fetcher).not.toHaveBeenCalled()
    client.clear()
  })
})
