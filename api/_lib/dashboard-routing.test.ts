import { createHmac } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiRequest, ApiResponse } from './dashboard-gateway'
import { mockOverview, mockServiceHealth } from '../../src/features/api/mock-api-fixtures'

const createdFrom = '2026-11-13T04:30:17.469Z'
const createdTo = '2026-11-14T04:30:17.469Z'
const encodedDates =
  'createdFrom=2026-11-13T04%3A30%3A17.469Z&createdTo=2026-11-14T04%3A30%3A17.469Z'
const sessionSecret = 'routing-test-only-session-signing-secret'
const serviceCredential = 'routing-test-only-service-credential'
const resources = [
  'capabilities',
  'credit-note',
  'credit-notes',
  'device',
  'events',
  'health',
  'invoice',
  'invoices',
  'manual-review',
  'manual-review-case',
  'operations',
  'overview',
  'reconciliation',
  'request',
  'requests',
  'services',
  'telemetry',
  'writeback',
  'writebacks',
].sort()
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
  const { default: handler } = await import('../dashboard')
  const configuration = JSON.parse(
    readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'),
  )
  const rewrite = configuration.rewrites.find(
    (rule: { source: string }) => rule.source === `/api/dashboard/${resource}`,
  )
  if (!rewrite) throw new Error('Missing fixed dashboard rewrite.')
  return (req: ApiRequest, res: ApiResponse) => {
    const destination = new URL(rewrite.destination, 'https://dashboard.invalid')
    const original = new URL(req.url ?? '/', 'https://dashboard.invalid')
    for (const [key, value] of original.searchParams) destination.searchParams.append(key, value)
    return handler({ ...req, url: destination.pathname + destination.search }, res)
  }
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
  it.each([
    {
      source: '/api/dashboard/documents/invoices/:invoiceId',
      destination: '/api/dashboard?dashboardResource=documents%2Finvoice&id=:invoiceId',
      id: 'zoho-invoice-42',
      kind: 'invoice',
      upstreamPath: '/api/dashboard/documents/invoices/zoho-invoice-42',
    },
    {
      source: '/api/dashboard/documents/credit-notes/:creditNoteId',
      destination: '/api/dashboard?dashboardResource=documents%2Fcredit-note&id=:creditNoteId',
      id: 'zoho-credit-note-42',
      kind: 'credit_note',
      upstreamPath: '/api/dashboard/documents/credit-notes/zoho-credit-note-42',
    },
  ])(
    'forwards the $kind document-detail path ID through the authenticated BFF',
    async ({ source, destination, id, kind, upstreamPath }) => {
      const configuration = JSON.parse(
        readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'),
      )
      const rewrite = configuration.rewrites.find(
        (rule: { source: string }) => rule.source === source,
      )
      expect(rewrite?.destination).toBe(destination)
      const parameter = kind === 'invoice' ? ':invoiceId' : ':creditNoteId'
      const rewritten = destination.replace(parameter, id)
      const upstream = vi.fn().mockResolvedValue(
        Response.json({
          documentType: kind,
          zohoDocumentId: id,
          document: kind === 'invoice' ? { invoice_id: id } : { creditnote_id: id },
          fiscalizationRequest: null,
        }),
      )
      vi.stubGlobal('fetch', upstream)
      const { default: handler } = await import('../dashboard')
      const destinationUrl = new URL(rewritten, 'https://dashboard.invalid')
      const response = responseMock()
      await handler(
        {
          method: 'GET',
          url: destinationUrl.pathname + destinationUrl.search,
          headers: { cookie: sessionCookie() },
        },
        response.res,
      )
      expect(response.status()).toBe(200)
      expect(new URL(String(upstream.mock.calls[0]![0])).pathname).toBe(upstreamPath)
    },
  )

  it('preserves prototype-backed Node request headers through consolidation', async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockServiceHealth)))
    vi.stubGlobal('fetch', upstream)
    const { default: handler } = await import('../dashboard')
    const req = Object.assign(Object.create({ headers: { cookie: sessionCookie() } }), {
      method: 'GET',
      url: '/api/dashboard?dashboardResource=services',
    }) as ApiRequest
    const response = responseMock()
    await handler(req, response.res)
    expect(response.status()).toBe(200)
    expect(upstream).toHaveBeenCalledOnce()
  })

  it('retains static resource mappings without dynamic route query injection', () => {
    // Plain Vercel Node routing adds bracketed filename segments to req.url's
    // query. [...path].ts produces ?...path=<resource>, not Next.js catch-all
    // semantics. Fixed rewrites share a static function without bracketed names.
    const files = readdirSync(new URL('../_dashboard/', import.meta.url))
      .filter((file) => file.endsWith('.ts'))
      .sort()
    expect(files).toEqual(resources.map((resource) => `${resource}.ts`).sort())
    for (const directory of ['documents']) {
      expect(
        readdirSync(new URL(`../_dashboard/${directory}/`, import.meta.url)).every(
          (file) => !file.includes('['),
        ),
      ).toBe(true)
    }
    for (const action of ['fiscalize', 'invoice-writeback', 'credit-note-writeback']) {
      expect(existsSync(new URL(`../_dashboard/actions/${action}.ts`, import.meta.url))).toBe(false)
    }
  })

  it.each(['dashboardResource=services', 'dashboardResource=__proto__'])(
    'rejects caller-injected routing selector %s',
    async (query) => {
      const upstream = vi.fn()
      vi.stubGlobal('fetch', upstream)
      const handler = await entryPoint('overview')
      const response = responseMock()
      await handler(
        {
          method: 'GET',
          url: `/api/dashboard/overview?${encodedDates}&${query}`,
          headers: { cookie: sessionCookie() },
        },
        response.res,
      )
      expect(response.status()).toBe(400)
      expect(upstream).not.toHaveBeenCalled()
    },
  )

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
          resource === 'health'
            ? 'https://g11server.tailaff2e5.ts.net/health/live'
            : `https://g11server.tailaff2e5.ts.net/api/dashboard/${resource}${query ? `?${query}` : ''}`,
        )
        expect(options).toMatchObject({
          method: 'GET',
          redirect: 'error',
          headers: { Accept: 'application/json', Authorization: `Bearer ${serviceCredential}` },
        })
        expect(options.headers.Cookie).toBeUndefined()
        expect(options.headers.cookie).toBeUndefined()
        if (query && resource !== 'health') {
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

  it.each(['...path', 'path'])(
    'reproduces the historical overview failure when routing injects %s into valid dates',
    async (routingKey) => {
      const upstream = vi.fn()
      vi.stubGlobal('fetch', upstream)
      const handler = await entryPoint('overview')
      const response = responseMock()
      await handler(
        {
          method: 'GET',
          url: `/api/dashboard/overview?${encodedDates}&${routingKey}=overview`,
          headers: { cookie: sessionCookie() },
        },
        response.res,
      )
      // These exact dates succeed above through the static entrypoint. The
      // former dynamic route's extra key, not ISO fractional seconds, is invalid.
      // Do not repair routing by silently accepting arbitrary query parameters.
      expect(response.status()).toBe(400)
      expect(response.body()).toMatchObject({ error: { code: 'INVALID_QUERY' } })
      expect(upstream).not.toHaveBeenCalled()
    },
  )
})

describe('Overview offset-aware wire contract', () => {
  it.each([
    ['2026-01-02T00:00:00.000Z', 200],
    ['2026-01-02T00:00:00.001Z', 400],
  ] as const)(
    'bounds the actual overview handler range ending %s to 366 days',
    async (to, status) => {
      const from = '2025-01-01T00:00:00.000Z'
      const payload = mockOverview(from, to)
      const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)))
      vi.stubGlobal('fetch', upstream)
      const handler = await entryPoint('overview')
      const response = responseMock()
      const query = new URLSearchParams({ createdFrom: from, createdTo: to })
      await handler(
        {
          method: 'GET',
          url: '/api/dashboard/overview?' + query,
          headers: { cookie: sessionCookie() },
        },
        response.res,
      )
      expect(response.status()).toBe(status)
      if (status === 200) {
        expect(response.body()).toEqual(payload)
        expect(upstream).toHaveBeenCalledOnce()
      } else {
        expect(response.body()).toMatchObject({ error: { code: 'INVALID_QUERY' } })
        expect(upstream).not.toHaveBeenCalled()
      }
    },
  )

  it('preserves encoded Nairobi calendar boundaries through the existing authenticated gateway', async () => {
    const from = '2026-11-01T00:00:00.000+03:00'
    const to = '2026-11-18T23:59:59.999+03:00'
    const payload = mockOverview(from, to)
    const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)))
    vi.stubGlobal('fetch', upstream)
    const handler = await entryPoint('overview')
    const response = responseMock()
    const query = new URLSearchParams({ createdFrom: from, createdTo: to })
    await handler(
      {
        method: 'GET',
        url: '/api/dashboard/overview?' + query,
        headers: { cookie: sessionCookie() },
      },
      response.res,
    )
    expect(response.status()).toBe(200)
    expect(response.body()).toEqual(payload)
    const [target, options] = upstream.mock.calls[0]!
    expect(target.searchParams.get('createdFrom')).toBe(from)
    expect(target.searchParams.get('createdTo')).toBe(to)
    expect(target.search).toContain('%2B03%3A00')
    expect(options.method).toBe('GET')
    expect(options.headers.Authorization).toBe('Bearer ' + serviceCredential)
  })

  it('keeps date-only values invalid at the server wire boundary', async () => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const handler = await entryPoint('overview')
    const response = responseMock()
    await handler(
      {
        method: 'GET',
        url: '/api/dashboard/overview?createdFrom=2026-11-01&createdTo=2026-11-18',
        headers: { cookie: sessionCookie() },
      },
      response.res,
    )
    expect(response.status()).toBe(400)
    expect(response.body()).toMatchObject({ error: { code: 'INVALID_QUERY' } })
    expect(upstream).not.toHaveBeenCalled()
  })
})
