import { describe, expect, it, vi } from 'vitest'
import { handleDashboardRequest, type GatewayDependencies } from './dashboard-gateway'
import { dashboardGatewayNamespace, dashboardReadRoutes } from './dashboard-contracts'
import {
  mockInvoices,
  mockInvoiceDetails,
  mockCreditNoteDetails,
  mockDeviceDiagnostics,
  mockManualReview,
  mockManualReviewCase,
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
      '/manual-review',
      '/manual-review/{id}',
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

  it('keeps capabilities unavailable until its own gateway contract is verified', async () => {
    const result = await invoke('/api/dashboard/capabilities')
    expect(result.status).toBe(503)
    expect(result.body).toMatchObject({
      error: { code: 'GATEWAY_ROUTE_UNAVAILABLE' },
    })
    expect(result.fetch).not.toHaveBeenCalled()
  })

  it('forwards manual-review pagination and validates empty and populated persisted pages', async () => {
    const empty = await invoke('/api/dashboard/manual-review?page=1&pageSize=8', {
      page: 1,
      pageSize: 8,
      total: 0,
      items: [],
    })
    expect(empty.status).toBe(200)
    expect(empty.body).toEqual({ page: 1, pageSize: 8, total: 0, items: [] })
    expect(empty.fetch.mock.calls[0]![0].toString()).toBe(
      'https://gateway.example.test/api/dashboard/manual-review?page=1&pageSize=8',
    )

    const item = mockManualReview.items[0]!
    const populated = await invoke('/api/dashboard/manual-review?page=2&pageSize=8&status=open', {
      page: 2,
      pageSize: 8,
      total: 9,
      items: [item],
    })
    expect(populated.status).toBe(200)
    expect(populated.body).toEqual({ page: 2, pageSize: 8, total: 9, items: [item] })
    expect(populated.fetch.mock.calls[0]![0].toString()).toBe(
      'https://gateway.example.test/api/dashboard/manual-review?page=2&pageSize=8&status=open',
    )
    expect(populated.fetch.mock.calls[0]![1].headers['X-Request-ID']).toBeTruthy()
    expect(populated.fetch.mock.calls[0]![1].headers.Authorization).toBe(`Bearer ${token}`)

    const invalid = await invoke('/api/dashboard/manual-review?page=1&pageSize=8', {
      page: 1,
      pageSize: 8,
      total: 1,
      items: [{ ...item, unexpectedProperty: 'must-not-be-returned' }],
    })
    expect(invalid.status).toBe(502)
    expect(invalid.body).toMatchObject({ error: { code: 'UPSTREAM_CONTRACT_ERROR' } })
    expect(JSON.stringify(invalid.body)).not.toContain('must-not-be-returned')
  })

  it('validates manual-review case detail identity and preserves upstream not-found status', async () => {
    const item = mockManualReview.items[0]!
    const payload = mockManualReviewCase
    const success = await invoke(`/api/dashboard/manual-review-case?id=${item.id}`, payload)
    expect(success.status).toBe(200)
    expect(success.body).toEqual(payload)
    expect(success.fetch.mock.calls[0]![0].toString()).toBe(
      `https://gateway.example.test/api/dashboard/manual-review/${item.id}`,
    )
    expect(success.fetch.mock.calls[0]![1].headers['X-Request-ID']).toBeTruthy()

    const mismatch = await invoke(`/api/dashboard/manual-review-case?id=${item.id}`, {
      ...payload,
      id: 'different-case',
    })
    expect(mismatch.status).toBe(502)
    expect(mismatch.body).toMatchObject({ error: { code: 'UPSTREAM_CONTRACT_ERROR' } })

    const incorrectlyWrapped = await invoke(`/api/dashboard/manual-review-case?id=${item.id}`, {
      reviewCase: payload,
    })
    expect(incorrectlyWrapped.status).toBe(502)
    expect(incorrectlyWrapped.body).toMatchObject({
      error: { code: 'UPSTREAM_CONTRACT_ERROR' },
    })

    const missing = await invoke(
      `/api/dashboard/manual-review-case?id=${item.id}`,
      { error: { code: 'NOT_FOUND', message: 'Manual-review case was not found.' } },
      'GET',
      404,
    )
    expect(missing.status).toBe(404)
    expect(missing.fetch).toHaveBeenCalledOnce()
  })

  it.each(['reconciliation', 'operations'])(
    'keeps %s locally blocked until its own response schema is verified',
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

  it('forwards paginated events and validates nullable identities and metadata', async () => {
    const event = {
      eventId: 'event-1',
      eventType: 'invoice_attempt_completed',
      timestamp: '2026-11-20T10:00:00.000Z',
      documentType: 'invoice',
      documentId: 'document-1',
      requestId: null,
      message: 'Invoice attempt completed.',
      metadata: { attemptNumber: 1, confirmed: true, optional: null },
    }
    const payload = { page: 1, pageSize: 25, total: 1, items: [event] }
    const valid = await invoke(
      '/api/dashboard/events?page=1&pageSize=25&documentType=invoice',
      payload,
    )
    expect(valid.status).toBe(200)
    expect(valid.body).toEqual(payload)
    expect(valid.fetch).toHaveBeenCalledOnce()
    expect(valid.fetch.mock.calls[0]![0].toString()).toBe(
      'https://gateway.example.test/api/dashboard/events?page=1&pageSize=25&documentType=invoice',
    )

    const invalid = await invoke('/api/dashboard/events?page=1&pageSize=25', {
      page: 1,
      pageSize: 25,
      total: 1,
      items: [{ ...event, timestamp: 2 }],
    })
    expect(invalid.status).toBe(502)
    expect(invalid.body).toMatchObject({
      error: {
        code: 'UPSTREAM_CONTRACT_ERROR',
        validationIssues: [{ path: 'items.0.timestamp', expected: 'string', actual: 'number' }],
      },
    })
  })

  it('forwards credit-note detail using the internal request ID and validates identity', async () => {
    const payload = Object.values(mockCreditNoteDetails)[0]!
    const requestId = payload.request.requestId
    const valid = await invoke(`/api/dashboard/credit-note?id=${requestId}`, payload)
    expect(valid.status).toBe(200)
    expect(valid.body).toEqual(payload)
    expect(valid.fetch.mock.calls[0]![0].pathname).toBe(`/api/dashboard/credit-notes/${requestId}`)

    const mismatch = await invoke(`/api/dashboard/credit-note?id=${requestId}`, {
      request: { ...payload.request, requestId: 'different-request' },
    })
    expect(mismatch.status).toBe(502)
    expect(mismatch.body).toMatchObject({ error: { code: 'UPSTREAM_CONTRACT_ERROR' } })
  })

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

  it('forwards invoice detail using the fiscalization request ID and validates the response identity', async () => {
    const payload = Object.values(mockInvoiceDetails)[0]!
    const id = payload.request.requestId
    const result = await invoke(`/api/dashboard/invoice?id=${encodeURIComponent(id)}`, payload)
    expect(result.status).toBe(200)
    expect(result.body).toEqual(payload)
    expect(result.fetch.mock.calls[0]![0].pathname).toBe(`/api/dashboard/invoices/${id}`)
    expect(result.fetch.mock.calls[0]![1].method).toBe('GET')
    expect(result.fetch.mock.calls[0]![1].headers.Authorization).toBe(`Bearer ${token}`)
    expect(result.fetch.mock.calls[0]![1].headers['X-Request-ID']).toBeTruthy()

    const mismatch = await invoke(`/api/dashboard/invoice?id=${encodeURIComponent(id)}`, {
      request: { ...payload.request, requestId: 'different-request' },
    })
    expect(mismatch.status).toBe(502)
    expect(mismatch.body).toMatchObject({ error: { code: 'UPSTREAM_CONTRACT_ERROR' } })

    const malformed = await invoke(`/api/dashboard/invoice?id=${encodeURIComponent(id)}`, {
      request: { ...payload.request, attemptCount: '1' },
    })
    expect(malformed.status).toBe(502)
    expect(malformed.body).toMatchObject({
      error: {
        code: 'UPSTREAM_CONTRACT_ERROR',
        validationIssues: [{ path: 'request.attemptCount', expected: 'number', actual: 'string' }],
      },
    })

    const missing = await invoke(
      `/api/dashboard/invoice?id=${encodeURIComponent(id)}`,
      { error: { code: 'NOT_FOUND', message: 'Fiscalization request was not found.' } },
      'GET',
      404,
    )
    expect(missing.status).toBe(404)
    expect(missing.fetch).toHaveBeenCalledOnce()
  })

  it('keeps the unconfirmed request alias gated', async () => {
    const payload = Object.values(mockInvoiceDetails)[0]!
    const blocked = await invoke(`/api/dashboard/request?id=${payload.request.requestId}`, payload)
    expect(blocked.status).toBe(503)
    expect(blocked.body).toMatchObject({ error: { code: 'CONTRACT_ROUTE_UNAVAILABLE' } })
    expect(blocked.fetch).not.toHaveBeenCalled()
  })

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
