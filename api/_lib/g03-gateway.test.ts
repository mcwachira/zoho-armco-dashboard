import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { authorizeDashboardRequest, type DashboardRole } from './auth'
import { handleG03Request, type ApiRequest, type ApiResponse } from './dashboard-gateway'
import {
  cancellationFixture,
  openReceipt,
  unknownReceipt,
} from '../../src/features/api/__fixtures__/g03-receipt-fixtures'

const secret = 'g03-fixture-session-signing-secret-at-least-32-bytes'
const credential = 'g03-fixture-server-service-credential'
const origin = 'https://dashboard.example.test'
const emails = {
  admin: 'admin@example.test',
  operator: 'operator@example.test',
  viewer: 'viewer@example.test',
} as const
const ids = {
  'admin@example.test': 'internal-admin-001',
  'operator@example.test': 'internal-operations-002',
  'viewer@example.test': 'internal-viewer-003',
}
const baseEnv = {
  NODE_ENV: 'production',
  VERCEL: '1',
  DASHBOARD_AUTH_URL: origin,
  DASHBOARD_SESSION_SECRET: secret,
  GOOGLE_CLIENT_ID: 'fixture-google-client',
  GOOGLE_CLIENT_SECRET: 'fixture-google-client-secret',
  DASHBOARD_ALLOWED_USERS: JSON.stringify({
    [emails.admin]: 'admin',
    [emails.operator]: 'operator',
    [emails.viewer]: 'viewer',
  }),
  DASHBOARD_USER_IDS: JSON.stringify(ids),
  DASHBOARD_UPSTREAM_BASE_URL: 'https://gateway.example.test',
  DASHBOARD_UPSTREAM_TOKEN: credential,
}
function cookie(role: DashboardRole = 'admin', expiresAt = Date.now() + 60_000) {
  const value = Buffer.from(JSON.stringify({ email: emails[role], role, expiresAt })).toString(
    'base64url',
  )
  return (
    '__Host-dashboard_session=' +
    value +
    '.' +
    createHmac('sha256', secret).update(value).digest('base64url')
  )
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
async function invoke(
  options: {
    cancel?: boolean
    role?: DashboardRole
    sessionCookie?: string
    headers?: ApiRequest['headers']
    body?: unknown
    method?: string
    url?: string
    env?: Record<string, string | undefined>
    payload?: unknown
    upstreamStatus?: number
    upstream?: typeof fetch
  } = {},
) {
  const env = { ...baseEnv, ...options.env }
  const response = responseMock()
  const upstream =
    options.upstream ??
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify(
            options.payload ??
              (options.cancel ? cancellationFixture('cancelled_and_verified') : openReceipt),
          ),
          { status: options.upstreamStatus ?? 200 },
        ),
      )
  await handleG03Request(
    {
      url:
        options.url ?? '/api/device/g03/' + (options.cancel ? 'cancel-receipt' : 'current-receipt'),
      method: options.method ?? (options.cancel ? 'POST' : 'GET'),
      body: Object.hasOwn(options, 'body') ? options.body : options.cancel ? {} : undefined,
      headers: {
        cookie: options.sessionCookie ?? cookie(options.role),
        ...(options.cancel
          ? { origin, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }
          : {}),
        ...options.headers,
      },
    },
    response.res,
    {
      env,
      fetch: upstream,
      authorize: (req, res) => {
        const result = authorizeDashboardRequest(req, ['admin', 'operator', 'viewer'], env)
        if (!result.ok) {
          res.status(result.status).json({ error: { code: result.error } })
          return null
        }
        return result.session
      },
    },
  )
  return { ...response, upstream }
}
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('G03 proxy uses the existing signed dashboard session', () => {
  it.each([
    ['admin', 'administrator', ids[emails.admin]],
    ['operator', 'operations', ids[emails.operator]],
    ['viewer', 'viewer', ids[emails.viewer]],
  ] as const)(
    'relays authenticated %s as %s with the trusted internal ID',
    async (role, upstreamRole, id) => {
      const result = await invoke({ role })
      expect(result.status()).toBe(200)
      expect(result.body()).toEqual(openReceipt)
      expect(result.upstream).toHaveBeenCalledWith(
        new URL('https://gateway.example.test/integrations/device/g03/current-receipt'),
        expect.objectContaining({
          method: 'GET',
          cache: 'no-store',
          redirect: 'error',
          headers: {
            Accept: 'application/json',
            Authorization: 'Bearer ' + credential,
            'x-dashboard-user-id': id,
            'x-dashboard-role': upstreamRole,
            'X-Request-ID': expect.any(String),
          },
        }),
      )
      expect(result.headers['cache-control']).toBe('no-store')
      expect(JSON.stringify(result.body())).not.toContain(credential)
      expect(JSON.stringify(result.body())).not.toContain(id)
    },
  )

  it.each(['', 'invalid', cookie('admin', Date.now() - 60_000)])(
    'rejects missing, invalid or expired sessions %#',
    async (sessionCookie) => {
      for (const cancel of [false, true]) {
        const result = await invoke({ cancel, sessionCookie })
        expect(result.status()).toBe(401)
        expect(result.upstream).not.toHaveBeenCalled()
      }
    },
  )

  it('rechecks the current allowlist role rather than trusting a formerly valid cookie', async () => {
    const result = await invoke({
      env: { DASHBOARD_ALLOWED_USERS: JSON.stringify({ [emails.admin]: 'viewer' }) },
    })
    expect(result.status()).toBe(403)
    expect(result.upstream).not.toHaveBeenCalled()
  })

  it.each(['operator', 'viewer'] as const)(
    'rejects %s cancellation despite forged identity headers',
    async (role) => {
      const result = await invoke({
        cancel: true,
        role,
        headers: {
          authorization: 'Bearer browser-token',
          'x-dashboard-user-id': ids[emails.admin],
          'x-dashboard-role': 'administrator',
          'x-dashboard-permissions': 'dashboard:device:control',
        },
      })
      expect(result.status()).toBe(403)
      expect(result.upstream).not.toHaveBeenCalled()
    },
  )

  it('supports short legitimate internal IDs without mistaking receipt digits for secrets', async () => {
    const result = await invoke({
      env: { DASHBOARD_USER_IDS: JSON.stringify({ [emails.admin]: '42' }) },
    })
    expect(result.status()).toBe(200)
    expect(result.body()).toEqual(openReceipt)
    const [, init] = vi.mocked(result.upstream).mock.calls[0]!
    expect(init?.headers).toMatchObject({
      'x-dashboard-user-id': '42',
      'x-dashboard-role': 'administrator',
    })
    expect(JSON.stringify(result.body())).not.toContain(credential)
  })
  it('ignores all browser-supplied identity and connection headers', async () => {
    const result = await invoke({
      role: 'viewer',
      headers: {
        authorization: 'Bearer attacker-token',
        'x-dashboard-user-id': 'attacker-id',
        'x-dashboard-role': 'administrator',
        'x-dashboard-permissions': 'dashboard:device:control',
        'x-upstream-url': 'https://attacker.invalid',
        'x-forwarded-host': 'attacker.invalid',
      },
    })
    const [, init] = vi.mocked(result.upstream).mock.calls[0]!
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer ' + credential,
      'x-dashboard-user-id': ids[emails.viewer],
      'x-dashboard-role': 'viewer',
    })
    expect(JSON.stringify(init)).not.toContain('attacker')
    expect(JSON.stringify(init)).not.toContain('dashboard:device:control')
    expect(JSON.stringify(init)).not.toContain('__Host-dashboard_session')
  })

  it.each([
    { DASHBOARD_UPSTREAM_BASE_URL: undefined },
    { DASHBOARD_UPSTREAM_BASE_URL: 'http://127.0.0.1:3001' },
    { DASHBOARD_UPSTREAM_BASE_URL: 'https://gateway.example.test/path' },
    { DASHBOARD_UPSTREAM_TOKEN: undefined },
    { DASHBOARD_UPSTREAM_TOKEN: 'bad\r\nheader' },
    { DASHBOARD_USER_IDS: undefined },
    { DASHBOARD_USER_IDS: '{}' },
    { DASHBOARD_USER_IDS: 'invalid' },
    { DASHBOARD_USER_IDS: JSON.stringify({ [emails.admin]: 'bad\r\nid' }) },
    { DASHBOARD_USER_IDS: JSON.stringify({ [emails.admin]: 'same', [emails.viewer]: 'same' }) },
  ])('fails closed for missing or invalid server configuration %#', async (env) => {
    const result = await invoke({ env })
    expect(result.status()).toBe(503)
    expect(result.upstream).not.toHaveBeenCalled()
    expect(JSON.stringify(result.body())).not.toContain(credential)
  })
})

describe('G03 administrator POST and CSRF boundary', () => {
  it('sends exactly one empty JSON POST with server-derived administrator identity', async () => {
    const result = await invoke({ cancel: true, body: '{}' })
    expect(result.status()).toBe(200)
    expect(result.body()).toEqual(cancellationFixture('cancelled_and_verified'))
    expect(result.upstream).toHaveBeenCalledTimes(1)
    expect(result.upstream).toHaveBeenCalledWith(
      new URL('https://gateway.example.test/integrations/device/g03/cancel-receipt'),
      expect.objectContaining({
        method: 'POST',
        body: '{}',
        redirect: 'error',
        headers: expect.objectContaining({
          Authorization: 'Bearer ' + credential,
          'Content-Type': 'application/json',
          'x-dashboard-user-id': ids[emails.admin],
          'x-dashboard-role': 'administrator',
        }),
      }),
    )
  })

  it.each([
    { origin: undefined },
    { origin: 'null' },
    { origin: 'https://attacker.invalid' },
    { origin: [origin, 'https://attacker.invalid'] },
    { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' },
  ])('rejects missing/foreign Origin and cross-site requests %#', async (headers) => {
    const result = await invoke({ cancel: true, headers })
    expect(result.status()).toBe(403)
    expect(result.upstream).not.toHaveBeenCalled()
  })
  it('rejects missing Origin even when Referer looks trusted', async () => {
    const result = await invoke({
      cancel: true,
      headers: { origin: undefined, referer: origin + '/device' },
    })
    expect(result.status()).toBe(403)
    expect(result.upstream).not.toHaveBeenCalled()
  })
  it.each([
    null,
    [],
    { confirm: true },
    { role: 'administrator' },
    { userId: 'spoof' },
    '{invalid',
    '"text"',
    ' '.repeat(1025),
  ])('rejects non-empty or invalid cancellation bodies %#', async (body) => {
    const result = await invoke({ cancel: true, body })
    expect(result.status()).toBe(400)
    expect(result.upstream).not.toHaveBeenCalled()
  })
  it('requires JSON content type', async () => {
    const result = await invoke({ cancel: true, headers: { 'content-type': 'text/plain' } })
    expect(result.status()).toBe(415)
    expect(result.upstream).not.toHaveBeenCalled()
  })
  it.each([
    { url: '/api/device/g03/current-receipt?role=administrator' },
    { url: '/api/device/g03/anything' },
    { url: '/api/device/g03/cancel-receipt/' },
    { url: '/api/device/g03/../g03/current-receipt' },
  ])('does not forward unsupported paths or query overrides %#', async (options) => {
    const result = await invoke(options)
    expect(result.status()).toBe(404)
    expect(result.upstream).not.toHaveBeenCalled()
  })
  it.each([
    { method: 'POST', cancel: false },
    { method: 'GET', cancel: true },
    { method: 'DELETE', cancel: true },
  ])('rejects the wrong method %#', async (options) => {
    const result = await invoke(options)
    expect(result.status()).toBe(405)
    expect(result.upstream).not.toHaveBeenCalled()
  })
})

describe('G03 response and transport contract', () => {
  it('preserves HTTP 200 UNKNOWN without declaring the device state verified', async () => {
    const result = await invoke({ payload: unknownReceipt })
    expect(result.status()).toBe(200)
    expect(result.body()).toEqual(unknownReceipt)
  })
  it.each([
    'no_open_receipt',
    'cancellation_rejected',
    'receipt_still_open',
    'verification_required',
    'cancellation_outcome_unknown',
  ] as const)('preserves %s and the upstream HTTP status', async (status) => {
    const payload = cancellationFixture(status)
    const result = await invoke({
      cancel: true,
      payload,
      upstreamStatus: payload.success ? 200 : 409,
    })
    expect(result.status()).toBe(payload.success ? 200 : 409)
    expect(result.body()).toEqual(payload)
    expect(result.upstream).toHaveBeenCalledTimes(1)
  })
  it('rejects command acknowledgement without verified closure', async () => {
    const result = await invoke({
      cancel: true,
      payload: { ...cancellationFixture('cancelled_and_verified'), verification: openReceipt },
    })
    expect(result.status()).toBe(502)
    expect(result.body()).toMatchObject({ error: { code: 'UPSTREAM_CONTRACT_ERROR' } })
  })
  it('retains safe gateway errors, codes and request_id while withholding internal data', async () => {
    const result = await invoke({
      upstreamStatus: 503,
      payload: {
        error: { code: 'DEVICE_UNAVAILABLE', message: 'The fiscal device is unavailable.' },
        request_id: 'g03-server-request-123',
        stack: 'private stack',
        authorization: credential,
      },
    })
    expect(result.status()).toBe(503)
    expect(result.body()).toMatchObject({
      error: {
        code: 'DEVICE_UNAVAILABLE',
        message: 'The fiscal device is unavailable.',
        requestId: 'g03-server-request-123',
        upstreamStatus: 503,
      },
    })
    expect(JSON.stringify(result.body())).not.toContain('private stack')
    expect(JSON.stringify(result.body())).not.toContain(credential)
  })
  it.each([credential, secret, baseEnv.GOOGLE_CLIENT_SECRET, baseEnv.DASHBOARD_UPSTREAM_BASE_URL])(
    'blocks protected values echoed inside valid DTO fields %#',
    async (value) => {
      const result = await invoke({
        payload: { ...unknownReceipt, error: { code: 'READ_FAILED', message: value } },
      })
      expect(result.status()).toBe(502)
      expect(JSON.stringify({ body: result.body(), headers: result.headers })).not.toContain(value)
    },
  )
  it('does not leak stack traces in error messages', async () => {
    const result = await invoke({
      upstreamStatus: 500,
      payload: {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error stack C:\\private\\middleware.ts:42',
        },
      },
    })
    expect(result.status()).toBe(500)
    expect(JSON.stringify(result.body())).not.toContain('private')
  })
  it('blocks internal stack paths inside an otherwise valid UNKNOWN receipt DTO', async () => {
    const result = await invoke({
      payload: {
        ...unknownReceipt,
        error: {
          code: 'READ_FAILED',
          message: 'Device client failed at C:\\private\\device.ts:42',
        },
      },
    })
    expect(result.status()).toBe(502)
    expect(JSON.stringify(result.body())).not.toContain('private')
  })

  it('does not confuse a rejected middleware credential with an expired dashboard login', async () => {
    const result = await invoke({ upstreamStatus: 401, payload: { error: 'Unauthorized' } })
    expect(result.status()).toBe(502)
    expect(result.body()).toMatchObject({ error: { upstreamStatus: 401 } })
  })
  it('never retries a failed cancellation transport', async () => {
    const upstream = vi
      .fn()
      .mockRejectedValue(new Error('private transport diagnostics ' + credential))
    const result = await invoke({ cancel: true, upstream })
    expect(result.status()).toBe(502)
    expect(upstream).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(result.body())).not.toContain(credential)
  })
  it('bounds the device operation timeout without retrying', async () => {
    vi.useFakeTimers()
    const upstream = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          })
        }),
    )
    const pending = invoke({ cancel: true, upstream: upstream as typeof fetch })
    await vi.advanceTimersByTimeAsync(20_001)
    const result = await pending
    expect(result.status()).toBe(504)
    expect(upstream).toHaveBeenCalledTimes(1)
  })
  it('registers both static Vercel functions against the existing gateway handler', async () => {
    const read = await import('../device/g03/current-receipt')
    const cancel = await import('../device/g03/cancel-receipt')
    const gateway = await import('./dashboard-gateway')
    expect(read.default).toBe(gateway.handleG03Request)
    expect(cancel.default).toBe(gateway.handleG03Request)
  })
})
