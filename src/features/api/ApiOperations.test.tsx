// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
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
  const { ApiWritebackOperations, ApiOperationCollection, ApiReconciliation } =
    await import('./ApiOperations')
  const ApiMonitoring =
    route === '/monitoring' ? (await import('./ApiOperationalPages')).ApiMonitoring : null
  const { ApiSystemHealth } = await import('./ApiSystemHealth')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        {family ? (
          <ApiOperationCollection family={family} />
        ) : route === '/monitoring' && ApiMonitoring ? (
          <ApiMonitoring range="7d" />
        ) : route === '/health' ? (
          <ApiSystemHealth />
        ) : route.startsWith('/reconciliation') ? (
          <ApiReconciliation />
        ) : (
          <ApiWritebackOperations />
        )}
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

const services = {
  availability: 'partial',
  checkedAt: '2026-11-18T07:00:00Z',
  gateway: { status: 'unknown', lastSuccessfulCommunicationAt: null },
  middlewareApi: { status: 'reachable', processUptimeSeconds: 7230 },
  database: { status: 'available' },
  zfplabserverEndpoint: { status: 'unknown' },
  g03Communication: { status: 'unknown' },
  physicalDevice: { status: 'unverified' },
  zohoBooks: { status: 'configured_unverified' },
  etims: { status: 'not_configured' },
  upstreamUptime: { status: 'unavailable', valueSeconds: null },
  observability: {
    source: 'in_process_observational_metrics',
    counters: { 'http_requests.2xx': 42 },
    jobs: {
      stale_recovery: {
        runs: 3,
        failures: 1,
        consecutiveFailures: 1,
        lastStartedAt: '2026-11-18T06:55:00Z',
        lastFinishedAt: '2026-11-18T06:55:01Z',
        lastSuccessAt: null,
        lastReconciledAt: null,
        lastDurationMs: 1000,
        running: false,
        activeWork: 0,
      },
    },
    httpDurationMs: { count: 4, sum: 60, buckets: { '100': 4, '+Inf': 4 } },
  },
}

describe('limited service observations', () => {
  it('loads validated service observations through its existing GET', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response(services))
    const client = await showPage(fetcher, '/health')
    expect(await screen.findByText('15.0 ms')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'System health', level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/Process uptime: 7230 seconds/)).toBeInTheDocument()
    expect(screen.getByText('configured unverified')).toHaveClass('warn')
    expect(screen.getByText('unverified')).toHaveClass('warn')
    expect(screen.getByText('http requests.2xx').closest('tr')).toHaveTextContent('42')
    expect(screen.getByText(/Idle.*recent failures/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pending operations' })).toHaveAttribute(
      'href',
      '/operations',
    )
    expect(
      fetcher.mock.calls.every(
        ([url, init]) => String(url) === '/api/dashboard/services' && init?.method === 'GET',
      ),
    ).toBe(true)
    client.clear()
  })

  it('shows missing monitoring metrics as unavailable instead of invented zero observations', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response({ ...services, observability: null }))
    const client = await showPage(fetcher, '/health')
    expect(
      await screen.findByText(/no in-process metrics snapshot was returned/),
    ).toBeInTheDocument()
    expect(screen.queryByText('No observations')).not.toBeInTheDocument()
    expect(screen.queryByText('HTTP duration observations')).not.toBeInTheDocument()
    expect(screen.getByText(/Process uptime: 7230 seconds/)).toBeInTheDocument()
    client.clear()
  })

  it('distinguishes returned empty metric sets from missing observations', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      response({
        ...services,
        observability: {
          ...services.observability,
          counters: {},
          jobs: {},
          httpDurationMs: { count: 0, sum: 0, buckets: {} },
        },
      }),
    )
    const client = await showPage(fetcher, '/health')
    expect(await screen.findByText('No observations')).toBeInTheDocument()
    const observations = screen.getByText('HTTP duration observations').parentElement
    expect(observations).not.toBeNull()
    expect(within(observations!).getByText('0')).toBeInTheDocument()
    expect(screen.getByText(/No counters have been recorded/)).toBeInTheDocument()
    expect(screen.getByText(/No worker observations returned/)).toBeInTheDocument()
    client.clear()
  })

  it('retains validated metrics as stale after failed refresh and permits a successful recovery', async () => {
    let fail = false
    const fetcher = vi.fn<typeof fetch>(async () =>
      fail
        ? response(
            {
              error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Monitoring transport unavailable' },
            },
            503,
          )
        : response(services),
    )
    const client = await showPage(fetcher, '/health')
    expect(await screen.findByText('15.0 ms')).toBeInTheDocument()
    fail = true
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Refresh telemetry' }))
    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent(
      'Monitoring transport unavailable',
    )
    expect(screen.getByText(/all displayed health observations are stale/)).toBeInTheDocument()
    expect(screen.getByText('15.0 ms')).toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Refresh telemetry' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(
      screen.queryByText(/all displayed health observations are stale/),
    ).not.toBeInTheDocument()
    client.clear()
  })

  it('reports unavailable monitoring without fabricated health or zero metrics', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      response(
        {
          error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Services read unavailable' },
        },
        503,
      ),
    )
    const client = await showPage(fetcher, '/health')
    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent(
      'Services read unavailable',
    )
    expect(screen.queryByText('No observations')).not.toBeInTheDocument()
    expect(screen.queryByText('HTTP duration observations')).not.toBeInTheDocument()
    expect(screen.queryByText('configured unverified')).not.toBeInTheDocument()
    client.clear()
  })

  it('does not substitute demo monitoring or make live reads in mock mode', async () => {
    const fetcher = vi.fn()
    const client = await showPage(fetcher, '/health', undefined, true)
    expect(screen.getByText(/No sample health results are substituted/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh telemetry' })).toBeDisabled()
    expect(fetcher).not.toHaveBeenCalled()
    client.clear()
  })
})

describe('overview-backed operational monitoring', () => {
  async function showMonitoring(overviewResponse: (url: URL) => Response | Promise<Response>) {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input), 'https://dashboard.test')
      if (url.pathname === '/api/dashboard/overview') return overviewResponse(url)
      if (url.pathname === '/api/dashboard/services') return response(services)
      if (url.pathname === '/api/dashboard/manual-review')
        return response({ availability: 'unavailable', reason: 'No review projection supplied.' })
      return response({ page: 1, pageSize: 25, total: 0, items: [] })
    })
    return { client: await showPage(fetcher, '/monitoring'), fetcher }
  }

  it('reads overview aggregates using the selected range and retains scoped service links', async () => {
    const { mockOverview } = await import('./mock-api-fixtures')
    const { client, fetcher } = await showMonitoring((url) => {
      const payload = mockOverview(
        url.searchParams.get('createdFrom')!,
        url.searchParams.get('createdTo')!,
      )
      if (payload.availability !== 'available') throw new Error('Expected synthetic overview.')
      payload.metrics.invoices.totalRequests = 123
      payload.metrics.creditNotes.totalRequests = 13
      return response(payload)
    })
    const label = await screen.findByText('FISCALIZATION REQUESTS')
    expect(within(label.closest('.stat-card')!).getByText('136')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Monitoring', level: 1 })).toBeInTheDocument()
    const call = fetcher.mock.calls.find(([url]) =>
      String(url).startsWith('/api/dashboard/overview?'),
    )
    expect(call).toBeDefined()
    const url = new URL(String(call![0]), 'https://dashboard.test')
    expect(
      Date.parse(url.searchParams.get('createdTo')!) -
        Date.parse(url.searchParams.get('createdFrom')!),
    ).toBe(7 * 86_400_000)
    expect(url.searchParams.has('from')).toBe(false)
    expect(url.searchParams.has('to')).toBe(false)
    expect(
      fetcher.mock.calls.some(([url]) => String(url).startsWith('/api/dashboard/monitoring')),
    ).toBe(false)
    expect(screen.getByRole('link', { name: 'Reconciliation' })).toHaveAttribute(
      'href',
      '/reconciliation?view=operations',
    )
    expect(
      screen.getAllByRole('link', { name: 'System health and telemetry' }).length,
    ).toBeGreaterThan(0)
    client.clear()
  })

  it('preserves overview unavailability instead of replacing it with service metrics', async () => {
    const { client } = await showMonitoring(() =>
      response({
        availability: 'unavailable',
        generatedAt: '2026-11-18T12:00:00Z',
        reason: 'Aggregate projection unavailable.',
      }),
    )
    expect(await screen.findByText('Aggregate projection unavailable.')).toBeInTheDocument()
    expect(screen.queryByText('FISCALIZATION REQUESTS')).not.toBeInTheDocument()
    expect(screen.queryByText('Mean HTTP duration')).not.toBeInTheDocument()
    expect(screen.getByText('Current service diagnostics')).toBeInTheDocument()
    client.clear()
  })

  it('surfaces an overview transport failure without inventing operational totals', async () => {
    const { client } = await showMonitoring(() =>
      response(
        {
          error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Overview gateway unavailable' },
        },
        503,
      ),
    )
    expect(
      await screen.findByText(/Overview gateway unavailable/, {}, { timeout: 5000 }),
    ).toBeInTheDocument()
    expect(screen.queryByText('FISCALIZATION REQUESTS')).not.toBeInTheDocument()
    client.clear()
  })
})

describe('reconciliation scopes', () => {
  it('preserves the receipt comparison and exposes the operational endpoint as a separate view', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      response(
        {
          error: {
            code: 'CONTRACT_SCHEMA_UNAVAILABLE',
            message: 'Reconciliation record schema unavailable.',
          },
        },
        503,
      ),
    )
    const client = await showPage(fetcher, '/reconciliation')
    expect(screen.getByRole('heading', { name: 'CU/KRA Reconciliation' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'CU/KRA receipt comparison' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: 'Persisted reconciliation operations' }))
    expect(await screen.findByRole('heading', { name: 'Reconciliation' })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Reconciliation record schema unavailable.',
    )
    expect(
      fetcher.mock.calls.some(([input]) =>
        String(input).startsWith('/api/dashboard/reconciliation?'),
      ),
    ).toBe(true)
    await userEvent.setup().type(screen.getByLabelText('Reconciliation status'), 'pending')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Apply filters' }))
    expect(screen.getByRole('heading', { name: 'Reconciliation' })).toBeInTheDocument()
    await waitFor(() =>
      expect(fetcher.mock.calls.some(([input]) => String(input).includes('status=pending'))).toBe(
        true,
      ),
    )
    client.clear()
  })
})

describe('operational collections', () => {
  it.each(['invoice', 'credit_note'] as const)(
    'opens the original %s document from writeback history and keeps writeback status visible',
    async (kind) => {
      vi.stubEnv('DEV', false)
      vi.stubEnv('VITE_DATA_MODE', 'api')
      const { invoiceDocumentFixture, creditNoteDocumentFixture } =
        await import('./__fixtures__/document-fixtures')
      const id =
        kind === 'invoice'
          ? invoiceDocumentFixture.invoice_id
          : creditNoteDocumentFixture.creditnote_id
      const detail = {
        documentType: kind,
        zohoDocumentId: id,
        document: kind === 'invoice' ? invoiceDocumentFixture : creditNoteDocumentFixture,
        fiscalizationRequest: null,
      }
      const writeback = {
        ...operation,
        writebackId: `wb-${kind}`,
        documentType: kind === 'invoice' ? 'INVOICE' : 'CREDIT_NOTE',
        documentId: id,
      }
      const fetcher = vi.fn<typeof fetch>(async (input) => {
        const url = new URL(String(input), 'https://dashboard.test')
        if (url.pathname === '/api/dashboard/writebacks')
          return response({ page: 1, pageSize: 25, total: 1, items: [writeback] })
        if (
          url.pathname ===
          `/api/dashboard/documents/${kind === 'invoice' ? 'invoices' : 'credit-notes'}/${id}`
        )
          return response(detail)
        return response({ error: { code: 'NOT_FOUND' } }, 404)
      })
      vi.stubGlobal('fetch', fetcher)
      const { ApiWritebackOperations } = await import('./ApiOperations')
      const { ApiDocuments } = await import('./ApiDocuments')
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={['/writeback']}>
            <Routes>
              <Route path="/writeback" element={<ApiWritebackOperations />} />
              <Route path="/invoices" element={<ApiDocuments kind="invoice" />} />
              <Route path="/credit-notes" element={<ApiDocuments kind="credit_note" />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      )
      await userEvent.setup().click(await screen.findByRole('link', { name: new RegExp(id) }))
      expect(
        await screen.findByRole('heading', {
          name:
            kind === 'invoice'
              ? invoiceDocumentFixture.invoice_number
              : creditNoteDocumentFixture.creditnote_number,
        }),
      ).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Related writeback operation' })).toHaveTextContent(
        'failed',
      )
      expect(fetcher).toHaveBeenCalledWith(
        `/api/dashboard/documents/${kind === 'invoice' ? 'invoices' : 'credit-notes'}/${id}`,
        expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
      )
      client.clear()
    },
  )

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
    expect(
      screen.getByRole('link', {
        name: 'Open credit note details for note-page-1',
      }),
    ).toHaveAttribute('href', '/credit-notes?id=note-page-1')
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

  it.each(['reconciliation', 'operations'] as const)(
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

  it('renders a validated derived event response', async () => {
    const event = {
      eventId: 'event-ui-1',
      eventType: 'writeback_failed',
      timestamp: '2026-11-20T10:00:00.000Z',
      documentType: 'invoice',
      documentId: 'document-1',
      requestId: null,
      message: 'Writeback needs attention.',
      metadata: { retryCount: 2 },
    }
    const fetcher = vi.fn<typeof fetch>(async () =>
      response({ page: 1, pageSize: 25, total: 1, items: [event] }),
    )
    const client = await showPage(fetcher, '/events', 'events')
    expect(await screen.findByText('Writeback needs attention.')).toBeInTheDocument()
    expect(screen.getByText('writeback_failed')).toBeInTheDocument()
    expect(screen.getByText(/No request ID/)).toBeInTheDocument()
    expect(fetcher).toHaveBeenCalledOnce()
    client.clear()
  })

  it('renders persisted manual-review cases and loads validated case details', async () => {
    const { mockManualReview, mockManualReviewCase } = await import('./mock-api-fixtures')
    const item = mockManualReview.items[0]!
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input), 'https://dashboard.test')
      if (url.pathname === '/api/dashboard/manual-review-case')
        return response(mockManualReviewCase)
      return response(mockManualReview)
    })
    const client = await showPage(fetcher, '/manual-review', 'manual-review')
    expect(await screen.findByText(item.reason ?? 'No reason recorded.')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Review status'), 'open')
    await waitFor(() =>
      expect(fetcher.mock.calls.some(([url]) => String(url).includes('status=open'))).toBe(true),
    )
    await user.click(screen.getByRole('button', { name: 'Open case details' }))
    expect(await screen.findByText(item.id)).toBeInTheDocument()
    expect(screen.getByText(`Operation: ${item.operationId}`)).toBeInTheDocument()
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(
          ([url]) => String(url) === `/api/dashboard/manual-review-case?id=${item.id}`,
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
