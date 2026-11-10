// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

function createQueryWrapper(client: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe('local dashboard API fixture adapter', () => {
  it('validates each fixture-backed route against its strict response schema', async () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_DATA_MODE', 'mock')
    const { getMockDashboardJson, mockFixtureSchemas } = await import('./mock-api-adapter')
    const range = new URLSearchParams({
      createdFrom: '2026-11-01T00:00:00.000Z',
      createdTo: '2026-11-10T00:00:00.000Z',
    }).toString()
    const samples: [string, keyof typeof mockFixtureSchemas][] = [
      ['/api/dashboard/capabilities', 'capabilities'],
      ['/api/dashboard/invoices?page=1&pageSize=25', 'invoices'],
      ['/api/dashboard/invoices/demo-invoice-1001', 'invoiceDetail'],
      ['/api/dashboard/credit-notes?page=1&pageSize=25', 'creditNotes'],
      ['/api/dashboard/credit-notes/demo-credit-note-2001', 'creditNoteDetail'],
      [`/api/dashboard/overview?${range}`, 'overview'],
      ['/api/dashboard/writebacks', 'writebacks'],
      ['/api/dashboard/manual-review?page=1&pageSize=25', 'manualReview'],
      ['/api/dashboard/reconciliation', 'reconciliation'],
      ['/api/dashboard/device', 'device'],
      ['/api/dashboard/services', 'services'],
    ]

    for (const [path, key] of samples) {
      await expect(
        getMockDashboardJson<unknown>(path, mockFixtureSchemas[key]),
      ).resolves.toBeDefined()
    }
  })

  it('serves API page hooks from local fixtures without invoking fetch', async () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_DATA_MODE', 'mock')
    vi.stubEnv('VITE_API_BASE_URL', 'https://must-not-be-contacted.example.test')
    const fetchSpy = vi.fn(() =>
      Promise.reject(new Error('Network must not be used in mock mode.')),
    )
    vi.stubGlobal('fetch', fetchSpy)
    const { useDashboardInvoiceListQuery } = await import('./queries')
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result, unmount } = renderHook(() => useDashboardInvoiceListQuery({ page: 1 }), {
      wrapper: createQueryWrapper(client),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.items[0]?.documentNumber).toBe('DEMO-INV-1001')
    expect(fetchSpy).not.toHaveBeenCalled()

    unmount()
    client.clear()
  })

  it('filters fixture responses and returns a clear not-found for unknown details', async () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_DATA_MODE', 'mock')
    const { getMockDashboardJson, mockFixtureSchemas } = await import('./mock-api-adapter')
    const filtered = await getMockDashboardJson(
      '/api/dashboard/invoices?page=1&pageSize=10&status=Failed',
      mockFixtureSchemas.invoices,
    )
    expect(filtered.items.map((item) => item.documentNumber)).toEqual(['DEMO-INV-1002'])
    await expect(
      getMockDashboardJson(
        '/api/dashboard/invoices/not-a-demo-record',
        mockFixtureSchemas.invoiceDetail,
      ),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('refuses fixture mode outside a Vite development build', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'mock')
    vi.stubEnv('DEV', false)
    const { getMockDashboardJson, mockFixtureSchemas } = await import('./mock-api-adapter')
    await expect(
      getMockDashboardJson('/api/dashboard/capabilities', mockFixtureSchemas.capabilities),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('blocks API transport in local Vite development even when API mode is selected', async () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_DATA_MODE', 'api')
    vi.stubEnv('VITE_API_BASE_URL', 'https://must-not-be-contacted.example.test')
    const fetchSpy = vi.fn(() => Promise.reject(new Error('Network must not be used in Vite dev.')))
    vi.stubGlobal('fetch', fetchSpy)
    const { getJson } = await import('@/lib/api/client')
    const { dashboardInvoicePageSchema } = await import('./schemas')

    await expect(
      getJson('/api/dashboard/invoices', dashboardInvoicePageSchema),
    ).rejects.toMatchObject({
      kind: 'configuration',
      message: expect.stringContaining('disabled during Vite development'),
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
