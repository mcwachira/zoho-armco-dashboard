import { describe, expect, it, vi } from 'vitest'
import { handleDashboardRequest, type GatewayDependencies } from './dashboard-gateway'
import { dashboardGatewayNamespace, dashboardReadRoutes } from './dashboard-contracts'
import {
  mockInvoices,
  mockInvoiceDetails,
  mockCreditNoteDetails,
  mockDeviceDiagnostics,
} from '../../src/features/api/mock-api-fixtures'

const token = 'fixture-only-dashboard-service-credential'
const env = {
  DASHBOARD_UPSTREAM_BASE_URL: 'https://gateway.example.test',
  DASHBOARD_UPSTREAM_TOKEN: token,
}

async function invoke(path: string, payload: unknown = {}, method = 'GET', upstreamStatus = 200) {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(payload), { status: upstreamStatus }))
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
  it('preserves the established namespace while the transferred route matrix is pending', () => {
    expect(dashboardGatewayNamespace).toBe('/api/dashboard')
  })
  it('contains only fixed Public Gateway roots and documented detail compatibility templates', () => {
    expect(
      [...new Set(Object.values(dashboardReadRoutes).flatMap((route) => route.path ?? []))].sort(),
    ).toEqual([
      '/credit-notes',
      '/credit-notes/{id}',
      '/device',
      '/documents/credit-notes',
      '/documents/credit-notes/{id}',
      '/documents/invoices',
      '/documents/invoices/{id}',
      '/events',
      '/invoices',
      '/invoices/{id}',
      '/operations',
      '/overview',
      '/reconciliation',
      '/services',
      '/writebacks',
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

  it.each(['capabilities', 'manual-review', 'manual-review-case?id=case-1'])(
    'keeps the existing UI endpoint safely unavailable without forwarding %s',
    async (resource) => {
      const result = await invoke(`/api/dashboard/${resource}`)
      expect(result.status).toBe(503)
      expect(result.body).toMatchObject({
        error: {
          code: 'GATEWAY_ROUTE_UNAVAILABLE',
          message: `The dashboard has no confirmed Public Gateway contract for ${resource.split('?')[0]}. No upstream request was made.`,
          upstreamStatus: undefined,
        },
      })
      expect(result.fetch).not.toHaveBeenCalled()
    },
  )

  it.each(['reconciliation', 'events', 'operations'])(
    'identifies a confirmed %s route with a missing response schema accurately',
    async (resource) => {
      expect(dashboardReadRoutes[resource]?.path).toBe('/' + resource)
      const result = await invoke('/api/dashboard/' + resource)
      expect(result.status).toBe(503)
      expect(result.body).toMatchObject({
        error: { code: 'CONTRACT_SCHEMA_UNAVAILABLE' },
      })
      expect(result.fetch).not.toHaveBeenCalled()
    },
  )

  it('reads persisted writebacks through the confirmed gateway root with validated filters', async () => {
    const item = {
      writebackId: 'writeback-1',
      documentType: 'invoice',
      documentId: 'zoho-1',
      requestId: 'request-1',
      status: 'failed',
      errorCategory: 'provider_unavailable',
      retryCount: 2,
      providerExchangeCount: 3,
      nextRetryAt: null,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-02T00:00:00.000Z',
      completedAt: null,
    }
    const payload = { page: 1, pageSize: 1, total: 1, items: [item] }
    const result = await invoke(
      '/api/dashboard/writebacks?page=1&pageSize=1&status=failed&documentType=invoice',
      payload,
    )
    expect(result.status).toBe(200)
    expect(result.body).toEqual(payload)
    expect(result.fetch.mock.calls[0]![0].toString()).toBe(
      'https://gateway.example.test/api/dashboard/writebacks?page=1&pageSize=1&documentType=invoice&status=failed',
    )
    const unsafe = await invoke('/api/dashboard/writebacks?pageSize=1', {
      ...payload,
      items: [{ ...item, authorization: 'withheld-provider-credential' }],
    })
    expect(unsafe.status).toBe(502)
    expect(JSON.stringify(unsafe.body)).not.toContain('withheld-provider-credential')
  })

  it('reads passive device diagnostics with the existing explicit validator', async () => {
    const result = await invoke('/api/dashboard/device', mockDeviceDiagnostics)
    expect(result.status).toBe(200)
    expect(result.fetch.mock.calls[0]![0].pathname).toBe('/api/dashboard/device')
    expect(result.body).toEqual(mockDeviceDiagnostics)
    const incompatible = await invoke('/api/dashboard/device', { state: 'healthy' })
    expect(incompatible.status).toBe(502)
    expect(incompatible.body).toMatchObject({ error: { code: 'UPSTREAM_CONTRACT_ERROR' } })
  })

  it.each([
    ['invoice', Object.values(mockInvoiceDetails)[0]!, '/invoices/'],
    ['request', Object.values(mockInvoiceDetails)[0]!, '/invoices/'],
    ['credit-note', Object.values(mockCreditNoteDetails)[0]!, '/credit-notes/'],
  ] as const)(
    'keeps the prepared %s request template gated pending exact route confirmation',
    async (resource, payload, base) => {
      const blocked = await invoke(
        `/api/dashboard/${resource}?id=${payload.request.requestId}`,
        payload,
      )
      expect(blocked.status).toBe(503)
      expect(blocked.body).toMatchObject({ error: { code: 'CONTRACT_ROUTE_UNAVAILABLE' } })
      expect(blocked.fetch).not.toHaveBeenCalled()
      // Validate identity enforcement for the prepared mapping using a test-only
      // activation; this does not enable or verify the production gateway route.
      const route = dashboardReadRoutes[resource]!
      const unavailable = route.unavailable
      delete route.unavailable
      try {
        const id = payload.request.requestId
        const result = await invoke(`/api/dashboard/${resource}?id=${id}`, payload)
        expect(result.status).toBe(200)
        expect(result.fetch.mock.calls[0]![0].pathname).toBe('/api/dashboard' + base + id)
        expect(result.fetch.mock.calls[0]![0].search).toBe('')
        const wrong = await invoke(`/api/dashboard/${resource}?id=different-request`, payload)
        expect(wrong.status).toBe(502)
        expect(wrong.body).toMatchObject({ error: { code: 'UPSTREAM_CONTRACT_ERROR' } })
      } finally {
        route.unavailable = unavailable
      }
    },
  )

  it.each([401, 403, 404, 503])(
    'distinguishes an actual upstream HTTP %s failure from a local route restriction',
    async (upstreamStatus) => {
      const result = await invoke(
        '/api/dashboard/invoices',
        { error: { code: 'GATEWAY_ROUTE_UNAVAILABLE' } },
        'GET',
        upstreamStatus,
      )
      expect(result.fetch).toHaveBeenCalledOnce()
      expect(result.status).toBe([401, 403].includes(upstreamStatus) ? 502 : upstreamStatus)
      expect(result.body).toMatchObject({
        error: {
          code: 'GATEWAY_ROUTE_UNAVAILABLE',
          upstreamStatus,
          message: [401, 403].includes(upstreamStatus)
            ? 'The middleware gateway rejected the dashboard service credential.'
            : `The middleware gateway returned HTTP ${upstreamStatus}.`,
        },
      })
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
