import { describe, expect, it, vi } from 'vitest'
import { handleDashboardRequest, type GatewayDependencies } from './dashboard-gateway'
import { dashboardReadRoutes } from './dashboard-contracts'
import { mockInvoices } from '../../src/features/api/mock-api-fixtures'

const token = 'fixture-only-dashboard-service-credential'
const env = {
  DASHBOARD_UPSTREAM_BASE_URL: 'https://gateway.example.test',
  DASHBOARD_UPSTREAM_TOKEN: token,
}

async function invoke(path: string, payload: unknown = {}, method = 'GET') {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)))
  let body: unknown
  let status = 200
  const headers: Record<string, string | string[]> = {}
  const response = {
    setHeader(name: string, value: string | string[]) {
      headers[name.toLowerCase()] = value
      return response
    },
    status(value: number) {
      status = value
      return response
    },
    json(value: unknown) {
      body = value
    },
  }
  const dependencies: GatewayDependencies = {
    env,
    fetch,
    authorize: () => ({
      email: 'viewer@example.test',
      role: 'viewer',
      expiresAt: Date.now() + 60000,
    }),
  }
  await handleDashboardRequest(
    { url: path, method, headers: { cookie: 'browser-cookie-not-forwarded' } },
    response,
    dependencies,
  )
  return { body, status, headers, fetch }
}

describe('read-only gateway contract boundary', () => {
  it('contains only the four existing reads and four authorized document mappings', () => {
    expect(
      [...new Set(Object.values(dashboardReadRoutes).flatMap((route) => route.path ?? []))].sort(),
    ).toEqual([
      '/api/dashboard/credit-notes',
      '/api/dashboard/documents/credit-notes',
      '/api/dashboard/documents/credit-notes/{id}',
      '/api/dashboard/documents/invoices',
      '/api/dashboard/documents/invoices/{id}',
      '/api/dashboard/invoices',
      '/api/dashboard/overview',
      '/api/dashboard/services',
    ])
  })

  it('preserves the existing requests alias without adding a gateway route', async () => {
    const page = { page: 2, pageSize: 10, total: 0, items: [] }
    const result = await invoke(
      '/api/dashboard/requests?page=2&pageSize=10&status=OutcomeUnknown',
      page,
    )
    expect(result.status).toBe(200)
    const [url, options] = result.fetch.mock.calls[0]!
    expect(url.pathname).toBe('/api/dashboard/invoices')
    expect(url.searchParams.get('status')).toBe('OutcomeUnknown')
    expect(options.headers.Authorization).toBe(`Bearer ${token}`)
    expect(options.method).toBe('GET')
    expect(JSON.stringify(options)).not.toContain('browser-cookie')
    expect(result.headers['cache-control']).toBe('no-store')
  })

  it.each([
    'invoice?id=request-1',
    'credit-note?id=request-1',
    'request?id=request-1',
    'device',
    'capabilities',
    'writebacks?page=101',
    'manual-review',
    'manual-review-case?id=case-1',
    'reconciliation',
    'events',
    'operations',
  ])(
    'keeps the existing UI endpoint safely unavailable without forwarding %s',
    async (resource) => {
      const result = await invoke(`/api/dashboard/${resource}`)
      expect(result.status).toBe(503)
      expect(result.body).toMatchObject({ error: { code: 'GATEWAY_ROUTE_UNAVAILABLE' } })
      expect(result.fetch).not.toHaveBeenCalled()
    },
  )

  it.each(['health?check=live', 'health?check=ready', 'telemetry', 'writeback?id=request-123'])(
    'does not forward undocumented service-bearer read: %s',
    async (resource) => {
      const result = await invoke(`/api/dashboard/${resource}`)
      expect(result.status).toBe(503)
      expect(result.body).toMatchObject({ error: { code: 'CONTRACT_ROUTE_UNAVAILABLE' } })
      expect(result.fetch).not.toHaveBeenCalled()
    },
  )

  it.each([
    'page=',
    'page=1e2',
    'page=0x10',
    'page=%20',
    'page=1.5',
    'page=9007199254740993',
    'page=1&page=2',
    'pageSize=101',
    'status=MadeUp',
    '...path=invoices',
  ])('rejects invalid history query %s before upstream access', async (query) => {
    const result = await invoke(`/api/dashboard/invoices?${query}`)
    expect(result.status).toBe(400)
    expect(result.fetch).not.toHaveBeenCalled()
  })

  it.each([
    { page: 2, pageSize: 25, total: 0, items: [] },
    { page: 1, pageSize: 10, total: 0, items: [] },
    { page: 1, pageSize: 25, total: 0, items: [mockInvoices[0]] },
  ])('rejects inconsistent pagination envelopes', async (payload) => {
    const result = await invoke('/api/dashboard/invoices', payload)
    expect(result.status).toBe(502)
    expect(result.body).toMatchObject({ error: { code: 'UPSTREAM_CONTRACT_ERROR' } })
  })

  it('rejects history rows that extend past the reported total after the page offset', async () => {
    const result = await invoke('/api/dashboard/invoices?page=2&pageSize=1', {
      page: 2,
      pageSize: 1,
      total: 1,
      items: [mockInvoices[0]],
    })
    expect(result.status).toBe(502)
    expect(result.body).toMatchObject({ error: { code: 'UPSTREAM_CONTRACT_ERROR' } })
  })

  it('allows an empty history page beyond the reported total', async () => {
    const page = { page: 2, pageSize: 1, total: 1, items: [] }
    const result = await invoke('/api/dashboard/invoices?page=2&pageSize=1', page)
    expect(result.status).toBe(200)
    expect(result.body).toEqual(page)
  })

  it('rejects unsafe list evidence and secret fields', async () => {
    for (const item of [
      { ...mockInvoices[0], authorization: 'Bearer private-secret' },
      { ...mockInvoices[0], customerName: token },
      { ...mockInvoices[0], qrCode: 'javascript:alert(1)' },
    ]) {
      const result = await invoke('/api/dashboard/invoices', {
        page: 1,
        pageSize: 25,
        total: 1,
        items: [item],
      })
      expect(result.status).toBe(502)
      expect(JSON.stringify(result.body)).not.toContain(token)
      expect(JSON.stringify(result.body)).not.toContain('private-secret')
    }
  })

  it.each(['fiscalize', 'invoice-writeback', 'credit-note-writeback'])(
    'has no action mapping for %s and never sends a mutation',
    async (action) => {
      const path = `/api/dashboard/actions/${action}`
      expect((await invoke(path)).status).toBe(404)
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const result = await invoke(path, {}, method)
        expect(result.status).toBe(405)
        expect(result.headers.allow).toBe('GET')
        expect(result.fetch).not.toHaveBeenCalled()
      }
    },
  )
})
