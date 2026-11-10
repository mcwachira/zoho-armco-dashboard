import { describe, expect, it, vi } from 'vitest'
import type { GatewayDependencies } from './dashboard-gateway'
import { handleDashboardRequest } from './dashboard-gateway'
import type { DashboardSession } from './auth'

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

  it('returns explicit unavailable state when no verified testing API is configured', async () => {
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

  it('refuses the existing Zoho public gateway hostname even when configured as testing-api', async () => {
    const fetch = vi.fn()
    const res = responseMock()
    await handleDashboardRequest(
      request(),
      res.response as never,
      deps({
        fetch,
        env: {
          DASHBOARD_DATA_MODE: 'testing-api',
          DASHBOARD_UPSTREAM_BASE_URL: 'https://g11server.tailaff2e5.ts.net',
        },
      }),
    )
    expect(res.status()).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
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
          DASHBOARD_DATA_MODE: 'testing-api',
          DASHBOARD_UPSTREAM_BASE_URL: 'https://testing.example.test',
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
})
