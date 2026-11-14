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
  it('reports unavailable manual-review data without sending any request', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DATA_MODE', 'api')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { useDashboardManualReviewQuery } = await import('./queries')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result, unmount } = renderHook(
      () => useDashboardManualReviewQuery({ page: 1, pageSize: 100 }),
      {
        wrapper: createQueryWrapper(queryClient),
      },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toMatchObject({ availability: 'unavailable' })
    expect(fetchSpy).not.toHaveBeenCalled()
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
