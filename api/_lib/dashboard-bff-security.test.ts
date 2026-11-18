import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleDashboardRequest, type ApiRequest, type ApiResponse } from './dashboard-gateway'
import { authorizeDashboardRequest, type DashboardRole } from './auth'

const origin = 'https://gateway.example.test'
const credential = 'fixture-only-service-bearer-123'
const secret = 'fixture-only-session-signing-secret-at-least-32-bytes'
const env = {
  DASHBOARD_UPSTREAM_BASE_URL: origin,
  DASHBOARD_UPSTREAM_TOKEN: credential,
  DASHBOARD_AUTH_URL: 'https://dashboard.example.test',
  DASHBOARD_SESSION_SECRET: secret,
  GOOGLE_CLIENT_ID: 'fixture-google-client-id',
  GOOGLE_CLIENT_SECRET: 'fixture-google-client-secret',
  DASHBOARD_ALLOWED_USERS: JSON.stringify({ 'reader@example.test': 'viewer' }),
}

function cookie(role: string = 'viewer', expiresAt = Date.now() + 60_000) {
  const value = Buffer.from(
    JSON.stringify({ email: 'reader@example.test', role, expiresAt }),
  ).toString('base64url')
  return `__Host-dashboard_session=${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`
}

function responseMock() {
  let status = 200
  let body: unknown
  const headers: Record<string, string | string[]> = {}
  const res: ApiResponse = {
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
  }
  return { res, headers, status: () => status, body: () => body }
}

async function invoke(
  options: {
    url?: string
    headers?: ApiRequest['headers']
    environment?: Partial<typeof env>
    fetch?: typeof fetch
  } = {},
) {
  const response = responseMock()
  const environment = { ...env, ...options.environment }
  const upstream =
    options.fetch ??
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          page: 1,
          pageSize: 25,
          total: 0,
          items: [],
        }),
      ),
    )
  await handleDashboardRequest(
    {
      method: 'GET',
      url: options.url ?? '/api/dashboard/invoices',
      headers: options.headers ?? { cookie: cookie() },
    },
    response.res,
    {
      env: environment,
      fetch: upstream,
      // Exercise the real verifier, including HMAC, expiry and current allowlist.
      authorize: (req, res) => {
        const result = authorizeDashboardRequest(req, ['admin', 'operator', 'viewer'], environment)
        if (!result.ok) {
          res.status(result.status).json({ error: result.error })
          return null
        }
        return result.session
      },
    },
  )
  return { ...response, upstream }
}

beforeEach(() => {
  vi.useRealTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('BFF security with signed fixture sessions and mocked gateway', () => {
  it.each(['admin', 'operator', 'viewer'] satisfies DashboardRole[])(
    'allows read permission for a currently allowlisted %s',
    async (role) => {
      const result = await invoke({
        headers: { cookie: cookie(role) },
        environment: { DASHBOARD_ALLOWED_USERS: JSON.stringify({ 'reader@example.test': role }) },
      })
      expect(result.status()).toBe(200)
      expect(result.headers['cache-control']).toBe('no-store')
    },
  )

  it.each([
    ['absent', '', 401],
    ['tampered', `${cookie()}invalid`, 401],
    ['expired', cookie('viewer', Date.now() - 1), 401],
    ['browser promoted', cookie('admin'), 403],
    ['unknown role', cookie('owner'), 401],
  ] as const)('rejects a %s session despite browser claims', async (_name, value, status) => {
    const upstream = vi.fn()
    const result = await invoke({
      headers: {
        cookie: value,
        authorization: 'Bearer browser-token',
        'x-role': 'admin',
        'x-user-id': 'reader@example.test',
      },
      fetch: upstream,
    })
    expect(result.status()).toBe(status)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('rejects a removed allowlisted user on the next request', async () => {
    const result = await invoke({
      environment: { DASHBOARD_ALLOWED_USERS: '{"someone@example.test":"viewer"}' },
    })
    expect(result.status()).toBe(403)
    expect(result.upstream).not.toHaveBeenCalled()
  })

  it('ignores browser authorization and connection headers', async () => {
    const result = await invoke({
      headers: {
        cookie: cookie(),
        authorization: 'Bearer attacker-chosen-token',
        host: 'attacker.example.test',
        'x-forwarded-host': 'attacker.example.test',
        'x-upstream-url': 'http://127.0.0.1/private',
        'x-role': 'admin',
      },
    })
    expect(result.status()).toBe(200)
    expect(result.upstream).toHaveBeenCalledWith(
      new URL(`${origin}/api/dashboard/invoices?page=1&pageSize=25`),
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${credential}`,
          'X-Request-ID': expect.any(String),
        },
      }),
    )
    expect(JSON.stringify(result.body())).not.toContain(credential)
  })

  it.each(['', ' ', 'bad\r\nInjected: value', 'surrounded-by-spaces '])(
    'fails closed for absent or malformed service configuration %#',
    async (value) => {
      const result = await invoke({
        headers: { cookie: cookie(), authorization: `Bearer ${credential}` },
        environment: { DASHBOARD_UPSTREAM_TOKEN: value },
      })
      expect(result.status()).toBe(503)
      expect(result.upstream).not.toHaveBeenCalled()
      expect(JSON.stringify(result.body())).not.toContain(credential)
    },
  )

  it.each([
    '/api/dashboard/services?url=https://attacker.example.test',
    '/api/dashboard/invoices?upstream=http://127.0.0.1',
    '/api/dashboard/invoices?authorization=chosen',
    '/api/dashboard/services?__proto__=x',
    '/api/dashboard/invoices?role=admin',
    '/api/dashboard/services/../invoices',
    'https://attacker.example.test/api/dashboard/invoices',
    '//attacker.example.test/api/dashboard/invoices',
  ])('rejects destination and permission injection: %s', async (url) => {
    const result = await invoke({ url })
    expect(result.status()).toBe(400)
    expect(result.upstream).not.toHaveBeenCalled()
  })

  it.each([credential, origin, 'gateway.example.test', secret, env.GOOGLE_CLIENT_SECRET])(
    'blocks protected server configuration echoed in a schema-valid response %#',
    async (value) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const info = vi.spyOn(console, 'log').mockImplementation(() => undefined)
      const upstream = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            availability: 'unavailable',
            generatedAt: '2026-11-15T00:00:00Z',
            reason: value,
          }),
        ),
      )
      const result = await invoke({
        url: '/api/dashboard/overview?createdFrom=2026-11-14T00:00:00Z&createdTo=2026-11-15T00:00:00Z',
        fetch: upstream,
      })
      expect(result.status()).toBe(502)
      expect(JSON.stringify({ body: result.body(), headers: result.headers })).not.toContain(value)
      expect(log).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
      expect(info).not.toHaveBeenCalled()
    },
  )

  it('suppresses credential echoes in error codes, request IDs, cookies and redirect headers', async () => {
    const upstream = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: credential, message: `${origin} ${secret}` },
        }),
        {
          status: 503,
          headers: {
            'X-Request-ID': credential,
            'Set-Cookie': `upstream=${credential}`,
            Location: origin,
          },
        },
      ),
    )
    const result = await invoke({ fetch: upstream })
    expect(result.status()).toBe(503)
    const serialized = JSON.stringify({ body: result.body(), headers: result.headers })
    expect(serialized).not.toContain(credential)
    expect(serialized).not.toContain(origin)
    expect(result.headers['set-cookie']).toBeUndefined()
    expect(result.headers.location).toBeUndefined()
  })

  it.each([200, 302, 500])(
    'handles non-JSON/redirect failures safely (HTTP %i)',
    async (status) => {
      const upstream = vi.fn().mockResolvedValue(
        new Response(`<html>${credential}</html>`, {
          status,
          headers: { Location: 'https://attacker.example.test' },
        }),
      )
      const result = await invoke({ fetch: upstream })
      expect(result.status()).toBe(status === 500 ? 500 : 502)
      expect(JSON.stringify(result.body())).not.toContain(credential)
      expect(result.headers.location).toBeUndefined()
      expect(upstream).toHaveBeenCalledOnce()
    },
  )

  it('cancels oversized upstream bodies', async () => {
    const cancel = vi.fn()
    const upstream = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(1_048_577))
          },
          cancel,
        }),
      ),
    )
    const result = await invoke({ fetch: upstream })
    expect(result.status()).toBe(502)
    expect(cancel).toHaveBeenCalledOnce()
  })

  it.each(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET'])(
    'handles %s without disclosing transport diagnostics or credentials',
    async (code) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const upstream = vi.fn().mockRejectedValue(
        Object.assign(new TypeError(`fetch failed: ${origin} Bearer ${credential}`), {
          cause: { code, hostname: 'gateway.example.test' },
        }),
      )
      const result = await invoke({ fetch: upstream })
      expect(result.status()).toBe(502)
      expect(result.body()).toMatchObject({ error: { code: 'UPSTREAM_UNAVAILABLE' } })
      const output = JSON.stringify({ body: result.body(), headers: result.headers })
      for (const privateValue of [credential, origin, code])
        expect(output).not.toContain(privateValue)
      expect(log).not.toHaveBeenCalled()
      expect(upstream).toHaveBeenCalledOnce()
    },
  )

  it.each([502, 504])('preserves a gateway HTTP %i as a safe data failure', async (status) => {
    const upstream = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'GATEWAY_UNAVAILABLE', message: `${credential} ${origin}` },
        }),
        { status },
      ),
    )
    const result = await invoke({ fetch: upstream })
    expect(result.status()).toBe(status)
    expect(result.body()).toMatchObject({
      error: { code: 'GATEWAY_UNAVAILABLE', upstreamStatus: status },
    })
    expect(JSON.stringify(result.body())).not.toContain(credential)
    expect(JSON.stringify(result.body())).not.toContain(origin)
  })

  it.each(['/api/dashboard//services', '/api/dashboard/services/'])(
    'rejects a non-allowlisted spelling %s without forwarding',
    async (url) => {
      const result = await invoke({ url })
      expect(result.status()).toBe(404)
      expect(result.upstream).not.toHaveBeenCalled()
    },
  )

  it.each(['headers', 'body'] as const)(
    'bounds upstream time spent waiting for %s',
    async (phase) => {
      vi.useFakeTimers()
      const cancel = vi.fn()
      const upstream = vi.fn((_url, init) =>
        phase === 'headers'
          ? new Promise<Response>((_resolve, reject) =>
              init.signal.addEventListener('abort', () => reject(new Error(credential))),
            )
          : Promise.resolve(new Response(new ReadableStream({ cancel }))),
      )
      const pending = invoke({ fetch: upstream })
      await vi.advanceTimersByTimeAsync(8_000)
      const result = await pending
      expect(result.status()).toBe(504)
      expect(result.body()).toMatchObject({ error: { code: 'UPSTREAM_TIMEOUT' } })
      expect(JSON.stringify(result.body())).not.toContain(credential)
      if (phase === 'body') expect(cancel).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)
    },
  )
})
