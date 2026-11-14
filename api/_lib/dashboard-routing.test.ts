import { createHmac } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiRequest, ApiResponse } from './dashboard-gateway'
import { mockOverview, mockServiceHealth } from '../../src/features/api/mock-api-fixtures'

const createdFrom = '2026-11-13T04:30:17.469Z'
const createdTo = '2026-11-14T04:30:17.469Z'
const encodedDates =
  'createdFrom=2026-11-13T04%3A30%3A17.469Z&createdTo=2026-11-14T04%3A30%3A17.469Z'
const sessionSecret = 'routing-test-only-session-signing-secret'
const serviceCredential = 'routing-test-only-service-credential'
const resources = ['credit-notes', 'invoices', 'overview', 'services']
const cases = [
  { resource: 'overview', query: encodedDates, payload: mockOverview(createdFrom, createdTo) },
  {
    resource: 'invoices',
    query: `page=1&pageSize=25&${encodedDates}`,
    payload: { page: 1, pageSize: 25, total: 0, items: [] },
  },
  {
    resource: 'credit-notes',
    query: `page=1&pageSize=25&${encodedDates}`,
    payload: { page: 1, pageSize: 25, total: 0, items: [] },
  },
  { resource: 'services', query: '', payload: mockServiceHealth },
]

function sessionCookie() {
  const value = Buffer.from(
    JSON.stringify({
      email: 'reader@example.test',
      role: 'viewer',
      expiresAt: Date.now() + 60_000,
    }),
  ).toString('base64url')
  const signature = createHmac('sha256', sessionSecret).update(value).digest('base64url')
  return `__Host-dashboard_session=${value}.${signature}`
}

function responseMock() {
  let status = 200
  let body: unknown
  const headers: Record<string, string | string[]> = {}
  const res: ApiResponse & { end: (value?: string) => void } = {
    setHeader(name, value) {
      headers[name.toLowerCase()] = value
      return res
    },
    status(value) {
      status = value
      return res
    },
    json(value) {
      body = value
    },
    end(value) {
      body = value ? JSON.parse(value) : undefined
    },
  }
  return { res, headers, status: () => status, body: () => body }
}

async function entryPoint(resource: string) {
  const module = await import(`../dashboard/${resource}.ts`)
  return module.default as (req: ApiRequest, res: ApiResponse) => Promise<unknown>
}

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('VERCEL', '1')
  vi.stubEnv('DASHBOARD_AUTH_URL', 'https://dashboard.example.test')
  vi.stubEnv('DASHBOARD_SESSION_SECRET', sessionSecret)
  vi.stubEnv('GOOGLE_CLIENT_ID', 'routing-test-client')
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'routing-test-client-secret')
  vi.stubEnv('DASHBOARD_ALLOWED_USERS', JSON.stringify({ 'reader@example.test': 'viewer' }))
  vi.stubEnv('DASHBOARD_UPSTREAM_BASE_URL', 'https://g11server.tailaff2e5.ts.net')
  vi.stubEnv('DASHBOARD_UPSTREAM_TOKEN', serviceCredential)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('Vercel dashboard filesystem routes', () => {
  it('uses four static entry points without dynamic route query injection', () => {
    // Plain Vercel Node routing adds bracketed filename segments to req.url's
    // query. [...path].ts produces ?...path=<resource>, not Next.js catch-all
    // semantics. Static filenames must stay in place to avoid this regression.
    const files = readdirSync(new URL('../dashboard/', import.meta.url))
      .filter((file) => file.endsWith('.ts'))
      .sort()
    expect(files).toEqual(resources.map((resource) => `${resource}.ts`))
  })

  describe.each([
    ['encoded', false],
    ['unescaped ISO colons', true],
  ] as const)('exact browser requests with %s dates', (_label, unescaped) => {
    it.each(cases)(
      'authenticates and forwards $resource without changing milliseconds',
      async ({ resource, query, payload }) => {
        const upstream = vi.fn().mockResolvedValue(
          new Response(JSON.stringify(payload), {
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        vi.stubGlobal('fetch', upstream)
        const handler = await entryPoint(resource)
        const response = responseMock()
        const requestQuery = unescaped ? query.replaceAll('%3A', ':') : query
        await handler(
          {
            method: 'GET',
            url: `/api/dashboard/${resource}${requestQuery ? `?${requestQuery}` : ''}`,
            headers: { cookie: sessionCookie() },
          },
          response.res,
        )
        expect(response.status()).toBe(200)
        expect(response.body()).toEqual(payload)
        expect(upstream).toHaveBeenCalledOnce()
        const [target, options] = upstream.mock.calls[0]!
        expect(target.toString()).toBe(
          `https://g11server.tailaff2e5.ts.net/api/dashboard/${resource}${query ? `?${query}` : ''}`,
        )
        expect(options).toMatchObject({
          method: 'GET',
          redirect: 'error',
          headers: { Accept: 'application/json', Authorization: `Bearer ${serviceCredential}` },
        })
        expect(options.headers.Cookie).toBeUndefined()
        expect(options.headers.cookie).toBeUndefined()
        if (query) {
          expect(target.searchParams.get('createdFrom')).toBe(createdFrom)
          expect(target.searchParams.get('createdTo')).toBe(createdTo)
        }
      },
    )
  })

  it.each(resources)('still rejects unauthenticated reads of %s', async (resource) => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const handler = await entryPoint(resource)
    const response = responseMock()
    await handler({ method: 'GET', url: `/api/dashboard/${resource}`, headers: {} }, response.res)
    expect(response.status()).toBe(401)
    expect(upstream).not.toHaveBeenCalled()
  })

  it.each(['...path=services', 'path=services', 'organization=other', 'page=1'])(
    'still rejects arbitrary services query %s',
    async (query) => {
      const upstream = vi.fn()
      vi.stubGlobal('fetch', upstream)
      const handler = await entryPoint('services')
      const response = responseMock()
      await handler(
        {
          method: 'GET',
          url: `/api/dashboard/services?${query}`,
          headers: { cookie: sessionCookie() },
        },
        response.res,
      )
      expect(response.status()).toBe(400)
      expect(response.body()).toMatchObject({ error: { code: 'INVALID_QUERY' } })
      expect(upstream).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['invoices', 'page=1&page=2'],
    ['invoices', 'page=1&pageSize=101'],
    ['credit-notes', 'page=1.5&pageSize=25'],
    ['overview', `createdFrom=${createdTo}&createdTo=${createdFrom}`],
    ['overview', 'createdFrom=2026-11-13T04%3A30%3A17.469&createdTo=2026-11-14T04%3A30%3A17.469Z'],
  ])('still rejects invalid %s query', async (resource, query) => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const handler = await entryPoint(resource)
    const response = responseMock()
    await handler(
      {
        method: 'GET',
        url: `/api/dashboard/${resource}?${query}`,
        headers: { cookie: sessionCookie() },
      },
      response.res,
    )
    expect(response.status()).toBe(400)
    expect(upstream).not.toHaveBeenCalled()
  })
})
