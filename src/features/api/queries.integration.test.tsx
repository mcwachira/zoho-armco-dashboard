// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

function createQueryWrapper(queryClient: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('dashboard API query hooks', () => {
  it.each(['invoice', 'credit-note'] as const)(
    'loads %s request details through a static route with an encoded identifier',
    async (kind) => {
      vi.stubEnv('DEV', false)
      vi.stubEnv('VITE_DATA_MODE', 'api')
      const fixtures = await import('./mock-api-fixtures')
      const payload =
        kind === 'invoice'
          ? Object.values(fixtures.mockInvoiceDetails)[0]
          : Object.values(fixtures.mockCreditNoteDetails)[0]
      const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)))
      vi.stubGlobal('fetch', fetchSpy)
      const queries = await import('./queries')
      const useDetail =
        kind === 'invoice'
          ? queries.useDashboardInvoiceDetailQuery
          : queries.useDashboardCreditNoteDetailQuery
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const { result, unmount } = renderHook(() => useDetail('request_123'), {
        wrapper: createQueryWrapper(queryClient),
      })
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(fetchSpy).toHaveBeenCalledWith(
        `/api/dashboard/${kind}?id=request_123`,
        expect.objectContaining({
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          redirect: 'error',
        }),
      )
      unmount()
      queryClient.clear()
    },
  )
  it('reads passive health through the documented services endpoint', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DATA_MODE', 'api')
    const { mockServiceHealth } = await import('./mock-api-fixtures')
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockServiceHealth)))
    vi.stubGlobal('fetch', fetchSpy)
    const { useDashboardServiceHealthQuery } = await import('./queries')
    const queryClient = new QueryClient()
    const { result, unmount } = renderHook(() => useDashboardServiceHealthQuery(), {
      wrapper: createQueryWrapper(queryClient),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockServiceHealth)
    expect(result.current.lastUpdatedAt).toBeInstanceOf(Date)
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/dashboard/services',
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    )
    unmount()
    queryClient.clear()
  })

  it('does not replace rejected telemetry with zero-valued counters', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DATA_MODE', 'api')
    const fetchSpy = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: 'FORBIDDEN',
              message: 'The middleware gateway rejected the dashboard service credential.',
            },
          }),
          { status: 502 },
        ),
      ),
    )
    vi.stubGlobal('fetch', fetchSpy)
    const { useDashboardServiceHealthQuery } = await import('./queries')
    const queryClient = new QueryClient()
    const { result, unmount } = renderHook(() => useDashboardServiceHealthQuery(), {
      wrapper: createQueryWrapper(queryClient),
    })
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 })
    expect(result.current.data).toBeUndefined()
    expect(result.current.error).toMatchObject({ status: 502, code: 'FORBIDDEN' })
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/dashboard/services',
      expect.objectContaining({ method: 'GET' }),
    )
    unmount()
    queryClient.clear()
  })

  it('loads a validated persisted manual-review page through the same-origin API', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DATA_MODE', 'api')
    const { mockManualReview } = await import('./mock-api-fixtures')
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ...mockManualReview, pageSize: 100 }), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchSpy)
    const { useDashboardManualReviewQuery } = await import('./queries')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result, unmount } = renderHook(
      () => useDashboardManualReviewQuery({ page: 1, pageSize: 100 }),
      {
        wrapper: createQueryWrapper(queryClient),
      },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5000 })
    expect(result.current.data).toMatchObject({ page: 1, pageSize: 100, total: 1 })
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/dashboard/manual-review?page=1&pageSize=100',
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    )
    unmount()
    queryClient.clear()
  })

  it('loads verified service status and exposes successful refresh time', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DATA_MODE', 'api')
    vi.stubEnv('VITE_API_BASE_URL', 'https://middleware.example.test')
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          availability: 'partial',
          checkedAt: '2026-11-09T08:31:00.000Z',
          gateway: { status: 'unknown', lastSuccessfulCommunicationAt: null },
          middlewareApi: { status: 'reachable', processUptimeSeconds: 125 },
          database: { status: 'unknown' },
          zfplabserverEndpoint: { status: 'unknown' },
          g03Communication: { status: 'unknown' },
          physicalDevice: { status: 'unverified' },
          zohoBooks: { status: 'configured_unverified' },
          etims: { status: 'unknown' },
          upstreamUptime: { status: 'unavailable', valueSeconds: null },
          observability: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchSpy)
    const { useDashboardServiceHealthQuery } = await import('./queries')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result, unmount } = renderHook(() => useDashboardServiceHealthQuery(), {
      wrapper: createQueryWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.database.status).toBe('unknown')
    expect(result.current.dataUpdatedAt).toBeGreaterThan(0)
    expect(result.current.lastUpdatedAt).toBeInstanceOf(Date)
    expect(result.current.isRefreshing).toBe(false)
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/dashboard/services',
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    )

    unmount()
    queryClient.clear()
  })

  it('does not replace middleware errors with demo rows', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DATA_MODE', 'api')
    vi.stubEnv('VITE_API_BASE_URL', 'https://middleware.example.test')
    const fetchSpy = vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 }))
    vi.stubGlobal('fetch', fetchSpy)
    const { useDashboardInvoiceListQuery } = await import('./queries')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result, unmount } = renderHook(() => useDashboardInvoiceListQuery({ page: 1 }), {
      wrapper: createQueryWrapper(queryClient),
    })

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5_000 })
    expect(result.current.data).toBeUndefined()
    expect(result.current.error).toMatchObject({ status: 503 })
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/dashboard/invoices?page=1&pageSize=25',
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    )

    unmount()
    queryClient.clear()
  })
})

describe('Overview calendar input transport', () => {
  it('normalizes both calendar bounds before fetching and parses the existing offset-aware response', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DATA_MODE', 'api')
    const { mockOverview } = await import('./mock-api-fixtures')
    const { useDashboardOverviewQuery } = await import('./queries')
    const from = '2026-11-01T00:00:00.000+03:00'
    const to = '2026-11-18T23:59:59.999+03:00'
    const payload = mockOverview(from, to)
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)))
    vi.stubGlobal('fetch', fetch)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result, unmount } = renderHook(
      () => useDashboardOverviewQuery({ createdFrom: '2026-11-01', createdTo: '2026-11-18' }),
      { wrapper: createQueryWrapper(queryClient) },
    )
    try {
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(fetch).toHaveBeenCalledWith(
        '/api/dashboard/overview?createdFrom=2026-11-01T00%3A00%3A00.000%2B03%3A00&createdTo=2026-11-18T23%3A59%3A59.999%2B03%3A00',
        expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
      )
      expect(result.current.data).toEqual(payload)
    } finally {
      unmount()
      queryClient.clear()
    }
  })

  it('rejects a reversed calendar range before sending an API request', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DATA_MODE', 'api')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const { useDashboardOverviewQuery } = await import('./queries')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result, unmount } = renderHook(
      () => useDashboardOverviewQuery({ createdFrom: '2026-11-19', createdTo: '2026-11-18' }),
      { wrapper: createQueryWrapper(queryClient) },
    )
    try {
      await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 })
      expect(fetch).not.toHaveBeenCalled()
      expect(result.current.data).toBeUndefined()
    } finally {
      unmount()
      queryClient.clear()
    }
  })
})
