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

async function showPage(fetcher: typeof fetch, mock = false) {
  vi.stubEnv('DEV', mock)
  vi.stubEnv('VITE_DATA_MODE', mock ? 'mock' : 'api')
  vi.stubGlobal('fetch', fetcher)
  const { ApiSystemHealth } = await import('./ApiSystemHealth')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ApiSystemHealth />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return client
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const emptyMetrics = {
  source: 'in_process_observational_metrics',
  counters: {},
  jobs: {},
  httpDurationMs: {
    count: 0,
    sum: 0,
    buckets: { '10': 0, '50': 0, '100': 0, '250': 0, '500': 0, '1000': 0, '5000': 0, '+Inf': 0 },
  },
}

const services = {
  availability: 'partial',
  checkedAt: '2026-11-14T07:00:00Z',
  gateway: { status: 'unknown', lastSuccessfulCommunicationAt: null },
  middlewareApi: { status: 'reachable', processUptimeSeconds: 3600 },
  database: { status: 'available' },
  zfplabserverEndpoint: { status: 'unknown' },
  g03Communication: { status: 'unknown' },
  physicalDevice: { status: 'unverified' },
  zohoBooks: { status: 'configured_unverified' },
  etims: { status: 'not_configured' },
  upstreamUptime: { status: 'unavailable', valueSeconds: null },
  observability: emptyMetrics,
}

describe('middleware health and telemetry', () => {
  it('uses the documented services endpoint and preserves configured and unknown dependencies', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response(services))
    const client = await showPage(fetcher)
    expect(await screen.findByText('configured unverified')).toHaveClass('warn')
    expect(screen.getByText('unverified')).toHaveClass('warn')
    expect(screen.getByText('available')).toHaveClass('good')
    expect(screen.getByText(/Process uptime: 3600 seconds/)).toBeInTheDocument()
    expect(screen.getByText('No observations')).toBeInTheDocument()
    expect(screen.getByText(/No counters have been recorded/)).toBeInTheDocument()
    expect(screen.getByText(/No worker observations returned/)).toBeInTheDocument()
    expect(fetcher.mock.calls.every(([url]) => String(url) === '/api/dashboard/services')).toBe(
      true,
    )
    client.clear()
  })

  it('keeps failed services unavailable without fabricated health or metrics', async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      response({ error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Middleware unavailable' } }, 503),
    )
    const client = await showPage(fetcher)
    expect(await screen.findByText(/Telemetry unavailable:/)).toBeInTheDocument()
    expect(screen.queryByText('Mean HTTP duration')).not.toBeInTheDocument()
    expect(screen.queryByText('No observations')).not.toBeInTheDocument()
    expect(screen.queryByText('available')).not.toBeInTheDocument()
    client.clear()
  })

  it('distinguishes an absent metrics snapshot from zero observations', async () => {
    const client = await showPage(
      vi.fn<typeof fetch>(async () => response({ ...services, observability: null })),
    )
    expect(
      await screen.findByText(/no in-process metrics snapshot was returned/),
    ).toBeInTheDocument()
    expect(screen.queryByText('No observations')).not.toBeInTheDocument()
    expect(screen.queryByText('HTTP duration observations')).not.toBeInTheDocument()
    client.clear()
  })

  it('shows worker evidence independently from queue depth and refreshes safe reads', async () => {
    const metrics = {
      ...emptyMetrics,
      counters: { 'http_requests.2xx': 12, 'device_attempts.uncertain': 1 },
      jobs: {
        stale_recovery: {
          runs: 2,
          failures: 1,
          consecutiveFailures: 1,
          lastStartedAt: '2026-11-14T07:00:00Z',
          lastFinishedAt: '2026-11-14T07:00:01Z',
          lastSuccessAt: null,
          lastReconciledAt: null,
          lastDurationMs: 1000,
          running: false,
          activeWork: 0,
        },
      },
      httpDurationMs: { ...emptyMetrics.httpDurationMs, count: 2, sum: 20 },
    }
    const fetcher = vi.fn<typeof fetch>(async () =>
      response({ ...services, observability: metrics }),
    )
    const client = await showPage(fetcher)
    expect(await screen.findByText('10.0 ms')).toBeInTheDocument()
    expect(screen.getByText(/Idle.*recent failures/)).toBeInTheDocument()
    expect(screen.getByText('device attempts.uncertain')).toBeInTheDocument()
    expect(
      screen.getByText(/Background workers.*execution observations, not queue depth/),
    ).toBeInTheDocument()
    const before = fetcher.mock.calls.length
    await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh telemetry' }))
    await waitFor(() => expect(fetcher.mock.calls.length).toBeGreaterThan(before))
    expect(
      fetcher.mock.calls.every(([, init]) => init === undefined || init.method === 'GET'),
    ).toBe(true)
    client.clear()
  })

  it('never substitutes demo health or starts network reads in mock mode', async () => {
    const fetcher = vi.fn()
    const client = await showPage(fetcher, true)
    expect(screen.getByText(/No sample health results are substituted/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh telemetry' })).toBeDisabled()
    expect(fetcher).not.toHaveBeenCalled()
    client.clear()
  })
})
