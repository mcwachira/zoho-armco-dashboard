// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockOverview, mockManualReview, mockServiceHealth } from './mock-api-fixtures'
import type { GlobalDateRange } from '@/types/dashboard'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function mountOverview(
  overviewResponse: (url: URL) => Response | Promise<Response>,
  range: GlobalDateRange = '24h',
) {
  vi.stubEnv('DEV', false)
  vi.stubEnv('VITE_DATA_MODE', 'api')
  const fetch = vi.fn(async (path: string) => {
    const url = new URL(path, 'https://dashboard.test')
    if (url.pathname === '/api/dashboard/overview') return overviewResponse(url)
    if (url.pathname === '/api/dashboard/services') return json(mockServiceHealth)
    if (url.pathname === '/api/dashboard/manual-review') return json(mockManualReview)
    return json({ page: 1, pageSize: 25, total: 0, items: [] })
  })
  vi.stubGlobal('fetch', fetch)
  const { ApiOverview } = await import('./ApiOperationalPages')
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, refetchInterval: false } },
        })
      }
    >
      <MemoryRouter>
        <ApiOverview range={range} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return fetch
}

describe('Overview date requests and existing response presentation', () => {
  it('advances rolling date bounds during polling and an explicit dashboard refresh', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date('2026-11-18T12:00:00.000Z'))
    const fetch = await mountOverview((url) =>
      json(mockOverview(url.searchParams.get('createdFrom')!, url.searchParams.get('createdTo')!)),
    )
    expect(await screen.findByText('FISCALIZATION REQUESTS')).toBeInTheDocument()
    await act(async () => {
      vi.advanceTimersByTime(30_000)
    })
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([path]) =>
            path.startsWith('/api/dashboard/overview?') &&
            new URL(path, 'https://dashboard.test').searchParams.get('createdTo') ===
              '2026-11-18T12:00:30.000Z',
        ),
      ).toBe(true),
    )
    vi.setSystemTime(new Date('2026-11-18T12:00:45.000Z'))
    await act(async () => {
      window.dispatchEvent(new Event('dashboard:refresh-range'))
    })
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([path]) =>
            path.startsWith('/api/dashboard/overview?') &&
            new URL(path, 'https://dashboard.test').searchParams.get('createdTo') ===
              '2026-11-18T12:00:45.000Z',
        ),
      ).toBe(true),
    )
  }, 15_000)

  it.each([
    ['24h', '2026-11-17T12:34:56.789Z'],
    ['7d', '2026-11-11T12:34:56.789Z'],
    ['30d', '2026-10-19T12:34:56.789Z'],
  ] as const)(
    'preserves the %s rolling range and renders the returned available data',
    async (range, from) => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-11-18T12:34:56.789Z'))
      const fetch = await mountOverview((url) => {
        const payload = mockOverview(
          url.searchParams.get('createdFrom')!,
          url.searchParams.get('createdTo')!,
        )
        if (payload.availability !== 'available')
          throw new Error('Expected existing available fixture')
        payload.metrics.invoices.totalRequests = 12
        payload.metrics.creditNotes.totalRequests = 3
        return json(payload)
      }, range)
      const card = (await screen.findByText('FISCALIZATION REQUESTS')).closest('.stat-card')!
      expect(within(card as HTMLElement).getByText('15')).toBeInTheDocument()
      expect(screen.getByText(from.slice(0, 10) + ' – 2026-11-18')).toBeInTheDocument()
      const calls = fetch.mock.calls.filter(([path]) => path.startsWith('/api/dashboard/overview?'))
      expect(calls).toHaveLength(1)
      const url = new URL(calls[0]![0], 'https://dashboard.test')
      expect(Object.fromEntries(url.searchParams)).toEqual({
        createdFrom: from,
        createdTo: '2026-11-18T12:34:56.789Z',
      })
      expect(screen.getByText('No recent requests in this range')).toBeInTheDocument()
    },
    15_000,
  )

  it('keeps the existing loading state until the Overview response arrives', async () => {
    let resolveOverview!: (response: Response) => void
    const response = new Promise<Response>((resolve) => {
      resolveOverview = resolve
    })
    await mountOverview(() => response)
    expect(screen.getAllByText('Loading dashboard data').length).toBeGreaterThan(0)
    expect(screen.queryByText('FISCALIZATION REQUESTS')).not.toBeInTheDocument()
    resolveOverview(
      json(mockOverview('2026-11-01T00:00:00.000+03:00', '2026-11-18T23:59:59.999+03:00')),
    )
    expect(await screen.findByText('FISCALIZATION REQUESTS')).toBeInTheDocument()
    expect(screen.getByText('2026-11-01 – 2026-11-18')).toBeInTheDocument()
  }, 15_000)

  it('surfaces a gateway HTTP 400 with its existing safe code and request ID', async () => {
    await mountOverview(() =>
      json(
        {
          error: {
            code: 'INVALID_QUERY',
            message: 'Query parameters are invalid.',
            requestId: 'overview-validation-123',
          },
        },
        400,
      ),
    )
    const message = await screen.findByText(
      'Query parameters are invalid. [INVALID_QUERY] Request ID: overview-validation-123',
      {},
      { timeout: 5000 },
    )
    expect(message.closest('[role="alert"]')).toBeInTheDocument()
    expect(screen.queryByText('FISCALIZATION REQUESTS')).not.toBeInTheDocument()
    expect(await screen.findByText('Current service diagnostics')).toBeInTheDocument()
    expect(screen.getByText('Middleware API')).toBeInTheDocument()
  }, 15_000)

  it('keeps a useful HTTP 400 fallback for non-JSON platform errors', async () => {
    await mountOverview(() => new Response('invalid upstream input', { status: 400 }))
    expect(
      await screen.findByText('Dashboard gateway returned HTTP 400.', {}, { timeout: 5000 }),
    ).toBeInTheDocument()
    expect(screen.queryByText('invalid upstream input')).not.toBeInTheDocument()
  }, 15_000)
})
