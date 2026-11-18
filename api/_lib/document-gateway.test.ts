import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiRequest, ApiResponse } from './dashboard-gateway'
import type { DashboardRole } from './auth'
import type { DocumentDetail, DocumentPage } from '../../src/features/api/document-contracts'
import {
  zohoInvoiceDetailSample,
  zohoCreditNoteDetailSample,
} from '../../src/features/api/__fixtures__/zoho-response-samples'

const origin = 'https://document-gateway.example.test'
const credential = 'fixture-only-document-service-bearer'
const secret = 'fixture-only-document-session-secret-at-least-32-bytes'
const email = 'document-reader@example.test'
const entryPoints: Record<
  string,
  () => Promise<{ default: (req: ApiRequest, res: ApiResponse) => Promise<unknown> }>
> = {
  'documents/invoices': () => import('../_dashboard/documents/invoices'),
  'documents/credit-notes': () => import('../_dashboard/documents/credit-notes'),
  'documents/invoice': () => import('../_dashboard/documents/invoice'),
  'documents/credit-note': () => import('../_dashboard/documents/credit-note'),
}
const cases = [
  {
    resource: 'documents/invoices',
    query:
      'page=2&pageSize=200&search=fixture%20search&status=fixture-status&customerId=fixture-customer&dateFrom=2026-11-01T00%3A00%3A00Z&dateTo=2026-11-15T00%3A00%3A00Z&sortBy=date&sortOrder=D',
    path: '/api/dashboard/documents/invoices',
  },
  {
    resource: 'documents/credit-notes',
    query:
      'page=2&pageSize=200&search=fixture%20search&status=fixture-status&customerId=fixture-customer&dateFrom=2026-11-01T00%3A00%3A00Z&dateTo=2026-11-15T00%3A00%3A00Z&sortBy=date&sortOrder=A',
    path: '/api/dashboard/documents/credit-notes',
  },
  {
    resource: 'documents/invoice',
    query: 'id=fixture-invoice-42',
    path: '/api/dashboard/documents/invoices/fixture-invoice-42',
  },
  {
    resource: 'documents/credit-note',
    query: 'id=fixture-credit-note-42',
    path: '/api/dashboard/documents/credit-notes/fixture-credit-note-42',
  },
]

function cookie(role: DashboardRole = 'viewer') {
  const value = Buffer.from(
    JSON.stringify({ email, role, expiresAt: Date.now() + 60_000 }),
  ).toString('base64url')
  return `__Host-dashboard_session=${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`
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
  resource: string,
  query: string,
  options: { method?: string; headers?: ApiRequest['headers'] } = {},
) {
  const module = await entryPoints[resource]!()
  const handler = module.default as (req: ApiRequest, res: ApiResponse) => Promise<unknown>
  const response = responseMock()
  await handler(
    {
      method: options.method ?? 'GET',
      url: `/api/dashboard/${resource}${query ? `?${query}` : ''}`,
      headers: options.headers ?? { cookie: cookie() },
    },
    response.res,
  )
  return response
}

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('VERCEL', '1')
  vi.stubEnv('DASHBOARD_AUTH_URL', 'https://dashboard.example.test')
  vi.stubEnv('DASHBOARD_SESSION_SECRET', secret)
  vi.stubEnv('GOOGLE_CLIENT_ID', 'fixture-document-google-client')
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'fixture-document-google-client-secret')
  vi.stubEnv('DASHBOARD_ALLOWED_USERS', JSON.stringify({ [email]: 'viewer' }))
  vi.stubEnv('DASHBOARD_UPSTREAM_BASE_URL', origin)
  vi.stubEnv('DASHBOARD_UPSTREAM_TOKEN', credential)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('confirmed document BFF transport with pending response DTOs', () => {
  it.each(cases)(
    'protects $resource with the real session verifier',
    async ({ resource, query }) => {
      const upstream = vi.fn()
      vi.stubGlobal('fetch', upstream)
      const response = await invoke(resource, query, { headers: {} })
      expect(response.status()).toBe(401)
      expect(upstream).not.toHaveBeenCalled()
    },
  )

  describe.each(['viewer', 'operator', 'admin'] satisfies DashboardRole[])(
    '%s read role',
    (role) => {
      it.each(cases)(
        'forwards the exact GET path and validated query for $resource',
        async ({ resource, query, path }) => {
          vi.stubEnv('DASHBOARD_ALLOWED_USERS', JSON.stringify({ [email]: role }))
          const isList = resource.endsWith('invoices') || resource.endsWith('credit-notes')
          const identity = resource.includes('credit-note')
            ? { creditnote_id: 'fixture-credit-note-42', creditnote_number: 'UI-CN-0042' }
            : { invoice_id: 'fixture-invoice-42', invoice_number: 'UI-INV-0042' }
          const document = {
            ...identity,
            customer_name: 'UI fixture',
            customer_pin: 'SYNTHETIC-WITHHELD-CUSTOMER-PIN',
            privateProviderField: 'withheld',
          }
          const payload = isList
            ? {
                page: 2,
                pageSize: 200,
                total: null,
                hasMore: true,
                items: [
                  {
                    ...document,
                    fiscalizationRequest: null,
                  },
                ],
              }
            : {
                documentType: resource.endsWith('invoice') ? 'invoice' : 'credit_note',
                zohoDocumentId: new URLSearchParams(query).get('id'),
                document,
                fiscalizationRequest: null,
              }
          const upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)))
          vi.stubGlobal('fetch', upstream)
          const response = await invoke(resource, query, {
            headers: {
              cookie: cookie(role),
              authorization: 'Bearer browser-override',
              'x-upstream-url': 'https://attacker.example.test',
              'x-role': 'admin',
            },
          })
          expect(upstream).toHaveBeenCalledOnce()
          const [target, init] = upstream.mock.calls[0]!
          expect(target.origin).toBe(origin)
          expect(target.pathname).toBe(path)
          expect(Object.fromEntries(target.searchParams)).toEqual(
            resource.endsWith('invoices') || resource.endsWith('credit-notes')
              ? Object.fromEntries(new URLSearchParams(query))
              : {},
          )
          expect(init).toMatchObject({
            method: 'GET',
            redirect: 'error',
            cache: 'no-store',
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${credential}`,
              'X-Request-ID': expect.any(String),
            },
          })
          expect(Object.keys(init.headers).sort()).toEqual([
            'Accept',
            'Authorization',
            'X-Request-ID',
          ])
          expect(response.status()).toBe(200)
          expect(response.body()).toMatchObject(
            isList
              ? { page: 2, hasMore: true, items: [{ ...identity, fiscalizationRequest: null }] }
              : { fiscalizationRequest: null, document: identity },
          )
          expect(response.headers['cache-control']).toBe('no-store')
          expect(JSON.stringify(response.body())).not.toContain(credential)
          expect(JSON.stringify(response.body())).not.toContain('privateProviderField')
          expect(JSON.stringify(response.body())).not.toContain('customer_pin')
          expect(JSON.stringify(response.body())).not.toContain('SYNTHETIC-WITHHELD-CUSTOMER-PIN')
        },
      )
    },
  )

  it.each(cases)(
    'checks the current server allowlist role for $resource',
    async ({ resource, query }) => {
      vi.stubEnv('DASHBOARD_ALLOWED_USERS', JSON.stringify({ [email]: 'operator' }))
      const upstream = vi.fn()
      vi.stubGlobal('fetch', upstream)
      const response = await invoke(resource, query, {
        headers: { cookie: cookie('viewer'), 'x-role': 'operator' },
      })
      expect(response.status()).toBe(403)
      expect(upstream).not.toHaveBeenCalled()
    },
  )

  it.each(cases)(
    'requires server-only configuration for $resource',
    async ({ resource, query }) => {
      vi.stubEnv('DASHBOARD_UPSTREAM_TOKEN', '')
      const upstream = vi.fn()
      vi.stubGlobal('fetch', upstream)
      const response = await invoke(resource, query, {
        headers: { cookie: cookie(), authorization: `Bearer ${credential}` },
      })
      expect(response.status()).toBe(503)
      expect(response.body()).toMatchObject({ error: { code: 'UPSTREAM_UNCONFIGURED' } })
      expect(upstream).not.toHaveBeenCalled()
    },
  )

  it.each(cases)(
    'rejects mutations to $resource without forwarding',
    async ({ resource, query }) => {
      const upstream = vi.fn()
      vi.stubGlobal('fetch', upstream)
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const response = await invoke(resource, query, { method })
        expect(response.status()).toBe(405)
        expect(response.headers.allow).toBe('GET')
      }
      expect(upstream).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['documents/invoices', 'page=0'],
    ['documents/credit-notes', 'pageSize=201'],
    ['documents/invoices', 'page=1e2'],
    ['documents/invoices', 'page=1&page=2'],
    ['documents/credit-notes', 'sortOrder=desc'],
    ['documents/credit-notes', 'status='],
    ['documents/invoices', 'dateFrom=2026-11-15T00:00:00Z&dateTo=2026-11-01T00:00:00Z'],
    ['documents/invoices', 'url=https://attacker.example.test'],
    ['documents/credit-notes', 'authorization=browser-token'],
    ['documents/invoice', 'id=..'],
    ['documents/invoice', 'id=..%2Fservices'],
    ['documents/invoice', 'id=%252Fservices'],
    ['documents/credit-note', 'id=https%3A%2F%2Fattacker.example.test'],
    ['documents/credit-note', 'id=a%3Fb'],
    ['documents/credit-note', 'id=a&id=b'],
    ['documents/invoice', 'id=valid&sortBy=date'],
    ['documents/invoice', ''],
  ])('rejects invalid input on %s: %s', async (resource, query) => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const response = await invoke(resource, query)
    expect(response.status()).toBe(400)
    expect(upstream).not.toHaveBeenCalled()
  })

  it.each(cases)(
    'keeps meaningful safe gateway errors for $resource',
    async ({ resource, query }) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const upstream = vi.fn()
      vi.stubGlobal('fetch', upstream)
      for (const status of [400, 401, 403, 404, 502, 503, 504]) {
        upstream.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              error: {
                code: 'DOCUMENT_READ_FAILED',
                message: `${credential} ${origin}`,
                requestId: 'fixture-document-request',
              },
            }),
            { status },
          ),
        )
        const response = await invoke(resource, query)
        expect(response.status()).toBe(status === 401 || status === 403 ? 502 : status)
        expect(response.body()).toMatchObject({
          error: {
            code: 'DOCUMENT_READ_FAILED',
            upstreamStatus: status,
            requestId: 'fixture-document-request',
          },
        })
        expect(JSON.stringify(response.body())).not.toContain(credential)
        expect(JSON.stringify(response.body())).not.toContain(origin)
      }
      expect(log).not.toHaveBeenCalled()
    },
  )

  it.each(cases)('bounds an upstream timeout on $resource', async ({ resource, query }) => {
    vi.useFakeTimers()
    const upstream = vi.fn(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('fixture-timeout')))
        }),
    )
    vi.stubGlobal('fetch', upstream)
    const pending = invoke(resource, query)
    await vi.waitFor(() => expect(upstream).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(8000)
    const response = await pending
    expect(response.status()).toBe(504)
    expect(response.body()).toMatchObject({ error: { code: 'UPSTREAM_TIMEOUT' } })
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(cases)(
    'rejects malformed success envelopes for $resource',
    async ({ resource, query }) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ items: [], document: {} })))
      const response = await invoke(resource, query)
      expect(response.status()).toBe(502)
      expect(response.body()).toMatchObject({ error: { code: 'UPSTREAM_CONTRACT_ERROR' } })
    },
  )

  it('rejects a different document ID without exposing document data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          documentType: 'invoice',
          zohoDocumentId: 'fixture-wrong-id',
          document: { customer_name: 'withheld customer' },
          fiscalizationRequest: null,
        }),
      ),
    )
    const response = await invoke('documents/invoice', 'id=fixture-invoice-42')
    expect(response.status()).toBe(502)
    expect(JSON.stringify(response.body())).not.toContain('withheld customer')
  })

  describe.each([
    { resource: 'documents/invoice', kind: 'invoice', field: 'invoice_id' },
    { resource: 'documents/credit-note', kind: 'credit_note', field: 'creditnote_id' },
  ])('$resource identity correspondence', ({ resource, kind, field }) => {
    it.each(['wrong-type', 'wrong-source-id'])(
      'rejects a schema-valid %s without exposing document data',
      async (mismatch) => {
        vi.stubGlobal(
          'fetch',
          vi.fn().mockResolvedValue(
            Response.json({
              documentType: mismatch === 'wrong-type' ? 'another_document_type' : kind,
              zohoDocumentId: 'requested-document',
              document: {
                [field]: mismatch === 'wrong-source-id' ? 'another-document' : 'requested-document',
                customer_name: 'withheld mismatched customer',
              },
              fiscalizationRequest: null,
            }),
          ),
        )
        const response = await invoke(resource, 'id=requested-document')
        expect(response.status()).toBe(502)
        expect(response.body()).toMatchObject({ error: { code: 'UPSTREAM_CONTRACT_ERROR' } })
        expect(JSON.stringify(response.body())).not.toContain('withheld mismatched customer')
      },
    )

    it.each([null, undefined])('retains an unavailable optional source ID (%s)', async (id) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          Response.json({
            documentType: kind,
            zohoDocumentId: 'requested-document',
            document: { [field]: id },
            fiscalizationRequest: null,
          }),
        ),
      )
      const response = await invoke(resource, 'id=requested-document')
      expect(response.status()).toBe(200)
      expect(response.body()).toMatchObject({
        documentType: kind,
        zohoDocumentId: 'requested-document',
      })
    })
  })

  it.each([credential, origin, secret])(
    'rejects protected values in projected document fields %#',
    async (protectedValue) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          Response.json({
            documentType: 'invoice',
            zohoDocumentId: 'fixture-invoice-42',
            document: { notes: protectedValue },
            fiscalizationRequest: null,
          }),
        ),
      )
      const response = await invoke('documents/invoice', 'id=fixture-invoice-42')
      expect(response.status()).toBe(502)
      expect(JSON.stringify(response.body())).not.toContain(protectedValue)
    },
  )

  it('rejects success pagination that differs from the request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          page: 9,
          pageSize: 25,
          total: null,
          hasMore: false,
          items: [],
        }),
      ),
    )
    const response = await invoke('documents/invoices', 'page=1&pageSize=25')
    expect(response.status()).toBe(502)
    expect(response.body()).toMatchObject({ error: { code: 'UPSTREAM_CONTRACT_ERROR' } })
  })
})

describe('authenticated document projection of user-supplied Zoho response samples', () => {
  it.each([
    { resource: 'documents/invoices', kind: 'invoice', isList: true },
    { resource: 'documents/invoice', kind: 'invoice', isList: false },
    { resource: 'documents/credit-notes', kind: 'credit_note', isList: true },
    { resource: 'documents/credit-note', kind: 'credit_note', isList: false },
  ])(
    'preserves source data and the dashboard envelope on $resource',
    async ({ resource, kind, isList }) => {
      const source =
        kind === 'invoice' ? zohoInvoiceDetailSample.invoice : zohoCreditNoteDetailSample.creditnote
      const id =
        kind === 'invoice'
          ? String(zohoInvoiceDetailSample.invoice.invoice_id)
          : zohoCreditNoteDetailSample.creditnote.creditnote_id
      const payload = isList
        ? {
            page: 1,
            pageSize: 25,
            total: null,
            hasMore: false,
            items: [{ ...source, fiscalizationRequest: null }],
          }
        : {
            documentType: kind,
            zohoDocumentId: id,
            document: source,
            fiscalizationRequest: null,
          }
      const upstream = vi.fn().mockResolvedValue(Response.json(payload))
      vi.stubGlobal('fetch', upstream)
      const response = await invoke(resource, isList ? 'page=1&pageSize=25' : `id=${id}`)
      expect(response.status()).toBe(200)
      const body = response.body()
      const document = isList ? (body as DocumentPage).items[0]! : (body as DocumentDetail).document
      expect(Object.keys(body as object).sort()).toEqual(Object.keys(payload).sort())
      if (isList) {
        const page = body as DocumentPage
        expect(page).toMatchObject({ page: 1, pageSize: 25, total: null, hasMore: false })
        expect(page.items[0]?.fiscalizationRequest).toBeNull()
      } else {
        expect(body).toMatchObject({
          documentType: kind,
          zohoDocumentId: id,
          fiscalizationRequest: null,
        })
      }
      if (kind === 'invoice') {
        expect(document).toMatchObject({
          invoice_id: '982000000567114',
          customer_id: '982000000567001',
          total: 10000,
          balance: 40.6,
          sub_total: 10000,
          tax_total: 22.6,
          line_items: [{ item_id: '982000000030049', rate: 120, tax_percentage: 12.5 }],
          taxes: [{ tax_name: 'VAT', tax_amount: 19.13 }],
        })
        expect(typeof document.taxes?.[0]?.tax_amount).toBe('number')
        expect(typeof document.line_items?.[0]?.tax_percentage).toBe('number')
        expect(document.line_items?.[0]?.tax_amount).toBeUndefined()
      } else {
        expect(document).toMatchObject({
          creditnote_id: '90300000072369',
          total: 450,
          balance: 10,
          invoices: [{ invoice_id: '90300000079426', invoice_number: 'INV-384', amount: 450 }],
          taxes: [{ tax_id: '903000000000356', tax_name: 'Basic Tax', tax_amount: '2.50' }],
          line_items: [{ item_id: '90300000081501', quantity: 1, tax_id: '903000000000356' }],
        })
        expect(typeof document.taxes?.[0]?.tax_amount).toBe('string')
        expect(document.sub_total).toBeUndefined()
        expect(document.tax_total).toBeUndefined()
        expect(document.line_items?.[0]?.rate).toBeUndefined()
        expect(document.line_items?.[0]?.item_total).toBeUndefined()
        expect(document.line_items?.[0]?.tax_percentage).toBeUndefined()
        expect(document.line_items?.[0]?.tax_amount).toBeUndefined()
      }
      expect(upstream).toHaveBeenCalledOnce()
      const [, init] = upstream.mock.calls[0]!
      expect(init).toMatchObject({
        method: 'GET',
        headers: { Authorization: `Bearer ${credential}` },
      })
      expect(response.headers['cache-control']).toBe('no-store')
      expect(JSON.stringify(body)).not.toContain(credential)
    },
  )

  it.each([
    ['documents/invoice', zohoInvoiceDetailSample],
    ['documents/credit-note', zohoCreditNoteDetailSample],
  ])(
    'rejects a raw provider wrapper on %s without changing the dashboard envelope',
    async (resource, sample) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(sample)))
      const response = await invoke(resource, 'id=sample-document')
      expect(response.status()).toBe(502)
      expect(response.body()).toMatchObject({ error: { code: 'UPSTREAM_CONTRACT_ERROR' } })
    },
  )

  it('leaves an unsafe numeric document ID unavailable instead of returning a rounded ID', async () => {
    const unsafeId = Number.MAX_SAFE_INTEGER + 1
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          page: 1,
          pageSize: 25,
          total: null,
          hasMore: false,
          items: [
            {
              ...zohoInvoiceDetailSample.invoice,
              invoice_id: unsafeId,
              fiscalizationRequest: null,
            },
          ],
        }),
      ),
    )
    const response = await invoke('documents/invoices', 'page=1&pageSize=25')
    expect(response.status()).toBe(200)
    const page = response.body() as DocumentPage
    expect(page.items[0]?.invoice_id).toBeUndefined()
    expect(JSON.stringify(page)).not.toContain(`"invoice_id":"${unsafeId}"`)
  })

  it('continues to reject numeric CU receipt coercion independently of source ID conversion', async () => {
    const id = String(zohoInvoiceDetailSample.invoice.invoice_id)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          documentType: 'invoice',
          zohoDocumentId: id,
          document: zohoInvoiceDetailSample.invoice,
          fiscalizationRequest: {
            cuReceiptNumber: 123,
            kraQrUrl: 'https://itax.kra.go.ke/?invoiceNo=000123',
          },
        }),
      ),
    )
    const response = await invoke('documents/invoice', `id=${id}`)
    expect(response.status()).toBe(200)
    const detail = response.body() as DocumentDetail
    expect(detail.document.invoice_id).toBe(id)
    expect(detail.fiscalizationRequest?.cuReceiptNumber).toBeUndefined()
    expect(detail.fiscalizationRequest?.kraQrUrl).toBe('https://itax.kra.go.ke/?invoiceNo=000123')
  })
})
