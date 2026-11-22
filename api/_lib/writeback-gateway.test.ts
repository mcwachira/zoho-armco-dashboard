import { describe, expect, it, vi } from 'vitest'
import type { DashboardSession } from './auth'
import {
  handleDashboardWritebackRequest,
  type ApiRequest,
  type ApiResponse,
  type GatewayDependencies,
} from './dashboard-gateway'

const origin = 'https://dashboard.example.test'
const readToken = 'read-only-service-token-fixture'
const writeToken = 'dedicated-writeback-token-fixture'
const userIds = {
  'admin@example.test': 'trusted-admin-41',
  'ops@example.test': 'trusted-operator-42',
  'viewer@example.test': 'trusted-viewer-43',
}
const env = {
  NODE_ENV: 'production',
  VERCEL: '1',
  DASHBOARD_AUTH_URL: origin,
  DASHBOARD_UPSTREAM_BASE_URL: 'https://gateway.example.test',
  DASHBOARD_UPSTREAM_TOKEN: readToken,
  DASHBOARD_WRITEBACK_SERVICE_BEARER_TOKEN: writeToken,
  DASHBOARD_USER_IDS: JSON.stringify(userIds),
}

function session(role: DashboardSession['role']): DashboardSession {
  return {
    email:
      role === 'admin'
        ? 'admin@example.test'
        : role === 'operator'
          ? 'ops@example.test'
          : 'viewer@example.test',
    role,
    expiresAt: Date.now() + 60_000,
  }
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

function result(requestId = 'invoice-request-17', status = 'failed') {
  return {
    status,
    requestId,
    invoiceId: 'zoho-invoice-88',
    correlationId: 'writeback-correlation-17',
    fieldsWritten: ['CU receipt number'],
    updatedFields: ['CU receipt number'],
    remainingFields: ['KRA QR URL'],
    retryCount: 2,
    lastAttemptAt: '2026-11-20T08:00:00.000Z',
    nextRetryAt: null,
    errorCategory: 'provider_unavailable',
    lastError: { code: 'ZOHO_TIMEOUT', message: 'Zoho Books timed out.' },
    manualInterventionRequired: false,
  }
}

async function invoke(
  options: {
    kind?: 'invoice' | 'credit_note'
    role?: DashboardSession['role']
    authenticated?: boolean
    method?: string
    requestId?: string
    body?: unknown
    headers?: Record<string, string | string[] | undefined>
    env?: Record<string, string | undefined>
    payload?: unknown
    upstreamStatus?: number
    upstreamHeaders?: Record<string, string>
    fetch?: typeof fetch
  } = {},
) {
  const kind = options.kind ?? 'invoice'
  const requestId = options.requestId ?? 'invoice-request-17'
  const route = kind === 'invoice' ? 'invoices' : 'credit-notes'
  const mockFetch =
    options.fetch ??
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(options.payload ?? result(requestId)), {
        status: options.upstreamStatus ?? 200,
        headers: options.upstreamHeaders,
      }),
    )
  const captured = responseMock()
  const dependencies: GatewayDependencies = {
    env: { ...env, ...options.env },
    fetch: mockFetch,
    authorize: (_req, res) => {
      if (options.authenticated === false) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED' } })
        return null
      }
      return session(options.role ?? 'operator')
    },
  }
  await handleDashboardWritebackRequest(
    {
      method: options.method ?? 'GET',
      url: `/api/dashboard/writebacks/${route}/${requestId}`,
      body: options.body,
      headers: {
        origin,
        cookie: 'dashboard-session-fixture',
        ...(options.method === 'POST' ? { 'sec-fetch-site': 'same-origin' } : {}),
        ...options.headers,
      },
    } as ApiRequest,
    captured.res,
    kind,
    dependencies,
  )
  return { ...captured, fetch: mockFetch }
}

describe('request-scoped writeback gateway', () => {
  it.each([
    ['invoice', 'invoices', 'admin', 'administrator', userIds['admin@example.test']],
    ['invoice', 'invoices', 'operator', 'operations', userIds['ops@example.test']],
    ['credit_note', 'credit-notes', 'operator', 'operations', userIds['ops@example.test']],
  ] as const)(
    'uses the dedicated credential and trusted identity for %s %s as %s',
    async (kind, collection, role, upstreamRole, userId) => {
      const response = await invoke({ kind, role })
      expect(response.status()).toBe(200)
      expect(response.body()).toMatchObject({ requestId: 'invoice-request-17' })
      expect(response.fetch).toHaveBeenCalledWith(
        new URL(
          `https://gateway.example.test/api/dashboard/writebacks/${collection}/invoice-request-17`,
        ),
        expect.objectContaining({
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${writeToken}`,
            'x-dashboard-user-id': userId,
            'x-dashboard-role': upstreamRole,
            'X-Request-ID': expect.any(String),
          },
        }),
      )
      const [, init] = vi.mocked(response.fetch).mock.calls[0]!
      expect(JSON.stringify(init)).not.toContain('browser-session-fixture')
      expect(JSON.stringify(init)).not.toContain(readToken)
    },
  )

  it('uses the credit-note route and preserves the request and correlation IDs on recovery', async () => {
    const payload = {
      ...result('credit-note-request-19', 'succeeded'),
      invoiceId: null,
      creditNoteId: 'zoho-credit-note-72',
    }
    const response = await invoke({
      kind: 'credit_note',
      method: 'POST',
      requestId: 'credit-note-request-19',
      body: {},
      payload,
      upstreamHeaders: { 'x-correlation-id': 'gateway-correlation-19' },
    })
    expect(response.status()).toBe(200)
    expect(response.body()).toMatchObject({
      requestId: 'credit-note-request-19',
      correlationId: 'writeback-correlation-17',
      status: 'succeeded',
    })
    expect(response.headers['x-request-id']).toBe('gateway-correlation-19')
    expect(response.fetch).toHaveBeenCalledOnce()
    expect(response.fetch).toHaveBeenCalledWith(
      new URL(
        'https://gateway.example.test/api/dashboard/writebacks/credit-notes/credit-note-request-19',
      ),
      expect.objectContaining({ method: 'POST' }),
    )
    const [, init] = vi.mocked(response.fetch).mock.calls[0]!
    expect(init?.body).toBeUndefined()
  })

  it('accepts administrator recovery while ignoring browser identity and permission headers', async () => {
    const response = await invoke({
      role: 'admin',
      method: 'POST',
      body: {},
      headers: {
        authorization: 'Bearer browser-controlled-token',
        'x-dashboard-user-id': userIds['viewer@example.test'],
        'x-dashboard-role': 'viewer',
        'x-dashboard-permissions': 'none',
      },
    })
    expect(response.status()).toBe(200)
    const [, init] = vi.mocked(response.fetch).mock.calls[0]!
    expect(init?.headers).toMatchObject({
      Authorization: `Bearer ${writeToken}`,
      'x-dashboard-user-id': userIds['admin@example.test'],
      'x-dashboard-role': 'administrator',
    })
    expect(JSON.stringify(init)).not.toContain('browser-controlled-token')
  })

  it('rejects viewers and unauthenticated sessions without upstream access', async () => {
    for (const options of [{ role: 'viewer' as const }, { authenticated: false }]) {
      const response = await invoke({ ...options, method: 'POST', body: {} })
      expect(response.status()).toBe(options.authenticated === false ? 401 : 403)
      expect(response.fetch).not.toHaveBeenCalled()
    }
  })

  it('fails closed without the dedicated credential even when the read bearer is configured', async () => {
    const response = await invoke({
      method: 'POST',
      body: {},
      env: { DASHBOARD_WRITEBACK_SERVICE_BEARER_TOKEN: undefined },
    })
    expect(response.status()).toBe(503)
    expect(response.body()).toMatchObject({
      error: { code: 'WRITEBACK_CREDENTIAL_UNCONFIGURED' },
    })
    expect(response.fetch).not.toHaveBeenCalled()
  })

  it('rejects an unmapped user, unsafe request ID, foreign origin, and nonempty body', async () => {
    const unmapped = await invoke({
      method: 'POST',
      body: {},
      role: 'operator',
      env: { DASHBOARD_USER_IDS: '{}' },
    })
    expect(unmapped.status()).toBe(503)
    expect(unmapped.body()).toMatchObject({
      error: { code: 'DASHBOARD_IDENTITY_UNCONFIGURED' },
    })
    expect(unmapped.fetch).not.toHaveBeenCalled()

    const foreignOrigin = await invoke({
      method: 'POST',
      body: {},
      headers: { origin: 'https://evil.test' },
    })
    expect(foreignOrigin.status()).toBe(400)
    expect(foreignOrigin.fetch).not.toHaveBeenCalled()

    const body = await invoke({ method: 'POST', body: { requestId: 'spoof' } })
    expect(body.status()).toBe(400)
    expect(body.fetch).not.toHaveBeenCalled()

    const badId = await invoke({ requestId: '../other' })
    expect(badId.status()).toBe(400)
    expect(badId.fetch).not.toHaveBeenCalled()
  })

  it.each([404, 409, 422, 502, 503, 504])(
    'preserves gateway HTTP %i with a safe code and correlation ID',
    async (status) => {
      const response = await invoke({
        method: 'POST',
        body: {},
        upstreamStatus: status,
        payload: {
          error: { code: 'WRITEBACK_REJECTED', message: 'Writeback was not eligible.' },
          correlationId: 'gateway-correlation-error-7',
          stack: 'private server stack',
        },
      })
      expect(response.status()).toBe(status)
      expect(response.body()).toMatchObject({
        error: { code: 'WRITEBACK_REJECTED', upstreamStatus: status },
      })
      expect(JSON.stringify(response.body())).not.toContain('private server stack')
      expect(response.headers['x-request-id']).toBe('gateway-correlation-error-7')
      expect(response.fetch).toHaveBeenCalledOnce()
    },
  )

  it('maps an upstream credential rejection to 502 without expiring the local session', async () => {
    const response = await invoke({
      method: 'POST',
      body: {},
      upstreamStatus: 401,
      payload: { error: { code: 'UNAUTHORIZED', message: 'Not authorized.' } },
    })
    expect(response.status()).toBe(502)
    expect(response.body()).toMatchObject({ error: { upstreamStatus: 401 } })
  })

  it('rejects response request-ID mismatch and does not retry a failed write', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(result('different-request')), { status: 200 }))
    const mismatch = await invoke({ fetch })
    expect(mismatch.status()).toBe(502)
    expect(fetch).toHaveBeenCalledOnce()

    const failingFetch = vi.fn().mockRejectedValue(new Error('private transport detail'))
    const failed = await invoke({ method: 'POST', body: {}, fetch: failingFetch })
    expect(failed.status()).toBe(502)
    expect(failingFetch).toHaveBeenCalledOnce()
    expect(JSON.stringify(failed.body())).not.toContain('private transport detail')
  })
})
