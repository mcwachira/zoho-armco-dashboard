import { describe, expect, it, vi } from 'vitest'
import {
  handleDashboardAction,
  handleDashboardRequest,
  type GatewayDependencies,
} from './dashboard-gateway'
import { mockInvoiceDetails, mockInvoices } from '../../src/features/api/mock-api-fixtures'

const token = 'fixture-only-dashboard-service-credential'
const env = {
  DASHBOARD_UPSTREAM_BASE_URL: 'https://gateway.example.test',
  DASHBOARD_UPSTREAM_TOKEN: token,
  DASHBOARD_AUTH_URL: 'https://dashboard.example.test',
}
const detail = Object.values(mockInvoiceDetails)[0]!

async function invoke(
  path: string,
  payload: unknown = {},
  options: {
    method?: string
    body?: unknown
    role?: 'viewer' | 'operator'
    origin?: string
    unauthenticated?: boolean
  } = {},
) {
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
    authorize: (_req, res) => {
      if (options.unauthenticated) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED' } })
        return null
      }
      return {
        email: 'operator@example.test',
        role: options.role ?? 'viewer',
        expiresAt: Date.now() + 60000,
      }
    },
  }
  const action = path.startsWith('/api/dashboard/actions/')
  await (action ? handleDashboardAction : handleDashboardRequest)(
    {
      url: path,
      method: options.method ?? (action ? 'POST' : 'GET'),
      body: options.body,
      headers: {
        cookie: 'browser-cookie-not-forwarded',
        origin: options.origin ?? env.DASHBOARD_AUTH_URL,
      },
    },
    response,
    dependencies,
  )
  return { body, status, headers, fetch }
}

describe('contract-based dashboard operations', () => {
  it('forwards request history through the documented dashboard namespace with GET-only service authorization', async () => {
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

  it('reads full persisted request detail using its dashboard DTO', async () => {
    const result = await invoke(`/api/dashboard/request?id=${detail.request.requestId}`, detail)
    expect(result.status).toBe(200)
    expect(result.body).toEqual(detail)
    expect(result.fetch.mock.calls[0]?.[0].pathname).toBe(
      `/api/dashboard/invoices/${detail.request.requestId}`,
    )
  })

  it('rejects a request detail for a different identifier', async () => {
    const result = await invoke('/api/dashboard/request?id=another-request', detail)
    expect(result.status).toBe(502)
    expect(result.body).toMatchObject({ error: { code: 'UPSTREAM_CONTRACT_ERROR' } })
  })

  it('rejects unsafe evidence fields and server credentials', async () => {
    for (const request of [
      { ...detail.request, authorization: 'Bearer private-secret' },
      { ...detail.request, customerName: token },
      { ...detail.request, qrCode: 'javascript:alert(1)' },
    ]) {
      const result = await invoke(`/api/dashboard/request?id=${detail.request.requestId}`, {
        request,
      })
      expect(result.status).toBe(502)
      expect(JSON.stringify(result.body)).not.toContain(token)
      expect(JSON.stringify(result.body)).not.toContain('private-secret')
    }
  })

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
    'documents/invoices',
    'documents/credit-notes',
    'documents/invoice?id=123',
    'documents/credit-note?id=123',
    'manual-review',
    'manual-review-case?id=case-1',
    'reconciliation',
    'events',
    'operations',
  ])('makes an absent response DTO explicit without fabricating records: %s', async (resource) => {
    const result = await invoke(`/api/dashboard/${resource}`)
    expect(result.status).toBe(503)
    expect(result.body).toMatchObject({ error: { code: 'CONTRACT_SCHEMA_UNAVAILABLE' } })
    expect(result.fetch).not.toHaveBeenCalled()
  })

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

  it('forwards the complete documented writeback list and preserves model-specific counters', async () => {
    const payload = {
      page: 1,
      pageSize: 25,
      total: 1,
      items: [
        {
          writebackId: 'wb-1',
          documentType: 'credit_note',
          documentId: 'doc-1',
          requestId: null,
          status: 'failed',
          errorCategory: 'UPSTREAM_ERROR',
          retryCount: 0,
          providerExchangeCount: 3,
          nextRetryAt: null,
          createdAt: '2026-11-14T00:00:00Z',
          updatedAt: '2026-11-14T00:00:00Z',
          completedAt: null,
        },
      ],
    }
    const result = await invoke('/api/dashboard/writebacks', payload)
    expect(result.status).toBe(200)
    expect(result.body).toEqual(payload)
    expect(result.fetch.mock.calls[0]?.[0].pathname).toBe('/api/dashboard/writebacks')
  })

  it('does not impose the newer operational-list page cap on writeback history', async () => {
    const payload = { page: 101, pageSize: 25, total: 2500, items: [] }
    const result = await invoke('/api/dashboard/writebacks?page=101', payload)
    expect(result.status).toBe(200)
    expect(result.fetch.mock.calls[0]?.[0].searchParams.get('page')).toBe('101')
  })
})

const fiscalization = {
  org_id: 'org-1',
  document_type: 'INVOICE',
  document_id: 'document-1',
  source: 'ZOHO_BOOKS_BUTTON',
}
const actions = [
  ['/api/dashboard/actions/fiscalize', fiscalization],
  ['/api/dashboard/actions/invoice-writeback?id=request-1', {}],
  ['/api/dashboard/actions/credit-note-writeback?id=request-1', {}],
] as const

describe('POST operator authorization remains separate from GET bearer authorization', () => {
  it.each(actions)('requires an authenticated local session for %s', async (path, body) => {
    const result = await invoke(path, {}, { body, unauthenticated: true })
    expect(result.status).toBe(401)
    expect(result.fetch).not.toHaveBeenCalled()
  })
  it.each(actions)('rejects a viewer for %s', async (path, body) => {
    const result = await invoke(path, {}, { body })
    expect(result.status).toBe(403)
    expect(result.body).toMatchObject({ error: { code: 'OPERATOR_REQUIRED' } })
    expect(result.fetch).not.toHaveBeenCalled()
  })
  it.each(actions)(
    'does not substitute the GET service bearer for a missing middleware operator session: %s',
    async (path, body) => {
      const result = await invoke(path, {}, { body, role: 'operator' })
      expect(result.status).toBe(503)
      expect(result.body).toMatchObject({ error: { code: 'OPERATOR_SESSION_UNAVAILABLE' } })
      expect(result.fetch).not.toHaveBeenCalled()
      expect(JSON.stringify(result.body)).not.toContain(token)
    },
  )
  it.each(actions)('requires same-origin submission for %s', async (path, body) => {
    const result = await invoke(
      path,
      {},
      { body, role: 'operator', origin: 'https://evil.example.test' },
    )
    expect(result.status).toBe(403)
    expect(result.body).toMatchObject({ error: { code: 'INVALID_ORIGIN' } })
    expect(result.fetch).not.toHaveBeenCalled()
  })
  it.each([
    ['/api/dashboard/actions/fiscalize', { ...fiscalization, source: 'DASHBOARD' }],
    ['/api/dashboard/actions/fiscalize', { ...fiscalization, document_type: 'RECEIPT' }],
    ['/api/dashboard/actions/fiscalize', { ...fiscalization, deviceCommand: 'unsafe' }],
    ['/api/dashboard/actions/invoice-writeback?id=../request', {}],
    ['/api/dashboard/actions/invoice-writeback?id=request-1', { retry: true }],
    ['/api/dashboard/actions/credit-note-writeback?id=request-1&id=request-2', {}],
    ['/api/dashboard/actions/fiscalize', '{invalid'],
    ['/api/dashboard/actions/fiscalize', 'x'.repeat(4097)],
  ])('rejects undocumented payloads and paths for %s', async (path, body) => {
    const result = await invoke(path, {}, { body, role: 'operator' })
    expect(result.status).toBe(400)
    expect(result.fetch).not.toHaveBeenCalled()
  })
  it('does not allow GET to invoke an operational action', async () => {
    const result = await invoke(
      '/api/dashboard/actions/fiscalize',
      {},
      { method: 'GET', role: 'operator' },
    )
    expect(result.status).toBe(405)
    expect(result.headers.allow).toBe('POST')
    expect(result.fetch).not.toHaveBeenCalled()
  })
})
