import { describe, expect, it, vi } from 'vitest'
import type { GatewayDependencies } from './dashboard-gateway'
import { handleDashboardRequest } from './dashboard-gateway'
import type { DashboardSession } from './auth'
import { mockServiceHealth } from '../../src/features/api/mock-api-fixtures'

function responseMock() {
  const headers: Record<string, string> = {}
  let statusCode = 200
  let body: unknown
  const response = {
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value
      return response
    },
    status(code: number) {
      statusCode = code
      return response
    },
    json(value: unknown) {
      body = value
    },
  }
  return { response, headers, status: () => statusCode, body: () => body }
}

const session: DashboardSession = {
  email: 'viewer@example.test',
  role: 'viewer',
  expiresAt: Date.now() + 60_000,
}

function deps(overrides: Partial<GatewayDependencies> = {}): GatewayDependencies {
  return {
    authorize: () => session,
    fetch: vi.fn(),
    env: {},
    ...overrides,
  }
}

function request(method = 'GET', url = '/api/dashboard/invoices') {
  return { method, url, headers: {} } as never
}

describe('read-only Vercel dashboard gateway', () => {
  it('rejects non-GET methods without touching auth or upstreams', async () => {
    const authorize = vi.fn()
    const fetch = vi.fn()
    const res = responseMock()
    await handleDashboardRequest(request('POST'), res.response as never, deps({ authorize, fetch }))
    expect(res.status()).toBe(405)
    expect(authorize).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not fetch dashboard data for unauthenticated requests', async () => {
    const fetch = vi.fn()
    const authorize: GatewayDependencies['authorize'] = (_req, res) => {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in required.' } })
      return null
    }
    const res = responseMock()
    await handleDashboardRequest(request(), res.response as never, deps({ authorize, fetch }))
    expect(res.status()).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns explicit unavailable state when no gateway is configured', async () => {
    const fetch = vi.fn()
    const res = responseMock()
    await handleDashboardRequest(request(), res.response as never, deps({ fetch }))
    expect(res.status()).toBe(503)
    expect(res.body()).toMatchObject({ error: { code: 'UPSTREAM_UNCONFIGURED' } })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects unsupported sorting and out-of-range pagination before upstream access', async () => {
    const fetch = vi.fn()
    const res = responseMock()
    await handleDashboardRequest(
      request('GET', '/api/dashboard/invoices?page=0&sortBy=amount'),
      res.response as never,
      deps({ fetch }),
    )
    expect(res.status()).toBe(400)
    expect(res.body()).toMatchObject({ error: { code: 'INVALID_QUERY' } })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses the production gateway with the dedicated credential and no testing-only mode', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ page: 1, pageSize: 25, total: 0, items: [] })),
      )
    const res = responseMock()
    await handleDashboardRequest(
      request(),
      res.response as never,
      deps({
        fetch,
        env: {
          DASHBOARD_UPSTREAM_BASE_URL: 'https://g11server.tailaff2e5.ts.net',
          DASHBOARD_UPSTREAM_TOKEN: 'test-dashboard-read-token',
        },
      }),
    )
    expect(res.status()).toBe(200)
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://g11server.tailaff2e5.ts.net/api/dashboard/invoices?page=1&pageSize=25'),
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer test-dashboard-read-token',
          'X-Request-ID': expect.any(String),
        },
      }),
    )
    expect(JSON.stringify(res.body())).not.toContain('test-dashboard-read-token')
  })

  it('validates upstream response bodies before returning them', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ page: 1, pageSize: 25, total: 'incorrect', items: [] }), {
        status: 200,
      }),
    )
    const res = responseMock()
    await handleDashboardRequest(
      request('GET', '/api/dashboard/invoices?page=2&pageSize=10'),
      res.response as never,
      deps({
        fetch,
        env: {
          DASHBOARD_UPSTREAM_BASE_URL: 'https://testing.example.test',
          DASHBOARD_UPSTREAM_TOKEN: 'test-dashboard-read-token',
        },
      }),
    )
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://testing.example.test/api/dashboard/invoices?page=2&pageSize=10'),
      expect.objectContaining({ method: 'GET', redirect: 'error' }),
    )
    expect(res.status()).toBe(502)
    expect(res.body()).toMatchObject({ error: { code: 'UPSTREAM_CONTRACT_ERROR' } })
    expect(JSON.stringify(res.body())).not.toContain('incorrect')
  })

  it('requires the service credential before sending requests', async () => {
    const fetch = vi.fn()
    const res = responseMock()
    await handleDashboardRequest(
      request(),
      res.response as never,
      deps({
        fetch,
        env: {
          DASHBOARD_UPSTREAM_BASE_URL: 'https://g11server.tailaff2e5.ts.net',
        },
      }),
    )
    expect(res.status()).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    'manual-review',
    'device',
    'capabilities',
    'writebacks',
    'reconciliation',
    'invoices/123',
    'constructor',
  ])('does not forward unsupported resource %s', async (resource) => {
    const fetch = vi.fn()
    const res = responseMock()
    await handleDashboardRequest(
      request('GET', `/api/dashboard/${resource}`),
      res.response as never,
      deps({ fetch }),
    )
    expect(res.status()).toBe(404)
    expect(fetch).not.toHaveBeenCalled()
  })

  const dateQuery =
    'createdFrom=2026-11-06T12%3A00%3A00.000Z&createdTo=2026-11-13T12%3A00%3A00.000Z'
  it.each([
    [
      'overview',
      dateQuery,
      {
        availability: 'unavailable',
        generatedAt: '2026-11-13T12:00:00.000Z',
        reason: 'No aggregate source.',
      },
    ],
    ['invoices', `page=2&pageSize=8&${dateQuery}`, { page: 2, pageSize: 8, total: 0, items: [] }],
    [
      'credit-notes',
      `page=2&pageSize=8&${dateQuery}`,
      { page: 2, pageSize: 8, total: 0, items: [] },
    ],
    ['services', '', mockServiceHealth],
  ])('forwards only the validated GET query for %s', async (resource, query, payload) => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)))
    const res = responseMock()
    const path = `/api/dashboard/${resource}${query ? `?${query}` : ''}`
    await handleDashboardRequest(
      request('GET', path),
      res.response as never,
      deps({
        fetch,
        env: {
          DASHBOARD_UPSTREAM_BASE_URL: 'http://127.0.0.1:3004',
          DASHBOARD_UPSTREAM_TOKEN: 'local-test-token',
          NODE_ENV: 'test',
        },
      }),
    )
    expect(res.status()).toBe(200)
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0]?.[0].toString()).toBe(`http://127.0.0.1:3004${path}`)
    expect(fetch.mock.calls[0]?.[1].method).toBe('GET')
    expect(res.body()).toEqual(payload)
  })

  it.each([{ NODE_ENV: 'production' }, { NODE_ENV: 'test', VERCEL: '1' }])(
    'rejects the desktop HTTP URL in hosted/production environments: %j',
    async (environment) => {
      const fetch = vi.fn()
      const res = responseMock()
      await handleDashboardRequest(
        request(),
        res.response as never,
        deps({
          fetch,
          env: {
            ...environment,
            DASHBOARD_UPSTREAM_BASE_URL: 'http://127.0.0.1:3004',
            DASHBOARD_UPSTREAM_TOKEN: 'local-test-token',
          },
        }),
      )
      expect(res.status()).toBe(503)
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it.each([
    'http://127.0.0.1:3001',
    'http://example.test',
    'https://example.test/prefix',
    'https://user:password@example.test',
  ])('rejects invalid upstream %s', async (base) => {
    const fetch = vi.fn()
    const res = responseMock()
    await handleDashboardRequest(
      request(),
      res.response as never,
      deps({
        fetch,
        env: {
          NODE_ENV: 'test',
          DASHBOARD_UPSTREAM_BASE_URL: base,
          DASHBOARD_UPSTREAM_TOKEN: 'local-test-token',
        },
      }),
    )
    expect(res.status()).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([['POST'], ['PUT'], ['PATCH'], ['DELETE']])(
    'rejects dashboard %s writes',
    async (method) => {
      const fetch = vi.fn()
      const res = responseMock()
      await handleDashboardRequest(
        request(method, '/api/dashboard/services'),
        res.response as never,
        deps({ fetch }),
      )
      expect(res.status()).toBe(405)
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['/api/dashboard/services?page=1'],
    ['/api/dashboard/invoices?page=1&page=2'],
    ['/api/dashboard/invoices?pageSize=101'],
    ['/api/dashboard/overview?createdFrom=invalid&createdTo=invalid'],
  ])('rejects invalid filters before upstream access: %s', async (path) => {
    const fetch = vi.fn()
    const res = responseMock()
    await handleDashboardRequest(request('GET', path), res.response as never, deps({ fetch }))
    expect(res.status()).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([400, 401, 403, 503])(
    'preserves upstream error status context for HTTP %i without forwarding private messages',
    async (status) => {
      const fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: status === 503 ? 'DASHBOARD_AUTH_DISABLED' : 'REQUEST_REJECTED',
              message: 'private diagnostic local-test-token',
            },
          }),
          { status, headers: { 'X-Request-ID': 'middleware-request-123' } },
        ),
      )
      const res = responseMock()
      await handleDashboardRequest(
        request('GET', '/api/dashboard/services'),
        res.response as never,
        deps({
          fetch,
          env: {
            DASHBOARD_UPSTREAM_BASE_URL: 'https://g11server.tailaff2e5.ts.net',
            DASHBOARD_UPSTREAM_TOKEN: 'local-test-token',
          },
        }),
      )
      expect(res.status()).toBe(status === 401 || status === 403 ? 502 : status)
      expect(res.body()).toMatchObject({
        error: { upstreamStatus: status, requestId: 'middleware-request-123' },
      })
      expect(res.headers['x-request-id']).toBe('middleware-request-123')
      expect(JSON.stringify(res.body())).not.toContain('private diagnostic')
      expect(JSON.stringify(res.body())).not.toContain('local-test-token')
    },
  )

  it('retains middleware error codes and correlation IDs supplied in the JSON body', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'DASHBOARD_AUTH_DISABLED',
          correlationId: 'middleware-body-123',
          message: 'private diagnostic',
        }),
        { status: 503 },
      ),
    )
    const res = responseMock()
    await handleDashboardRequest(
      request('GET', '/api/dashboard/services'),
      res.response as never,
      deps({
        fetch,
        env: {
          DASHBOARD_UPSTREAM_BASE_URL: 'https://g11server.tailaff2e5.ts.net',
          DASHBOARD_UPSTREAM_TOKEN: 'local-test-token',
        },
      }),
    )
    expect(res.body()).toMatchObject({
      error: {
        code: 'DASHBOARD_AUTH_DISABLED',
        requestId: 'middleware-body-123',
        message: 'Middleware dashboard authentication is disabled.',
      },
    })
    expect(JSON.stringify(res.body())).not.toContain('private diagnostic')
  })
})
