import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { dashboardGatewayNamespace, dashboardReadRoutes } from './dashboard-contracts.js'
import type { DocumentDetail } from '../../src/features/api/document-contracts.js'
import { cancelReceiptSchema, receiptStateSchema } from '../../src/features/api/device-contracts.js'
import { writebackRecoverySchema } from '../../src/features/api/writeback-recovery-contracts.js'
import {
  requireDashboardSession,
  type DashboardSession,
  type VercelRequest,
  type VercelResponse,
} from './auth.js'

export interface ApiRequest {
  url?: string
  method?: string
  body?: unknown
  headers: Record<string, string | string[] | undefined>
}
export interface ApiResponse {
  status: (code: number) => ApiResponse
  json: (body: unknown) => void
  setHeader: (name: string, value: string | string[]) => ApiResponse
}

function send(
  res: ApiResponse,
  status: number,
  code: string,
  message: string,
  requestId: string,
  upstreamStatus?: number,
) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Request-ID', requestId)
  return res.status(status).json({ error: { code, message, requestId, upstreamStatus } })
}

function resolveUpstreamBase(env: Record<string, string | undefined>): URL | null {
  const raw = env.DASHBOARD_UPSTREAM_BASE_URL
  if (!raw) return null
  try {
    const url = new URL(raw)
    // The only HTTP exception is the explicitly configured desktop test server.
    // Hosted functions and production processes must always use HTTPS.
    const localIntegration =
      env.NODE_ENV !== 'production' && !env.VERCEL && url.origin === 'http://127.0.0.1:3004'
    if (
      (url.protocol !== 'https:' && !localIntegration) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      (!localIntegration && /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(url.hostname))
    )
      return null
    return url
  } catch {
    return null
  }
}

function parseQuery(search: URLSearchParams) {
  const query: Record<string, string> = {}
  for (const [key, value] of search) {
    if (key in query) return null
    query[key] = value
  }
  return query
}

async function readBoundedJson(
  response: Response,
  signal: AbortSignal,
  maxBytes = 1_048_576,
): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel()
    throw new Error('Upstream response too large')
  }
  if (!response.body) throw new Error('Upstream body missing')
  const reader = response.body.getReader()
  const abortRead = () => void reader.cancel().catch(() => undefined)
  signal.addEventListener('abort', abortRead, { once: true })
  const chunks: Uint8Array[] = []
  let received = 0
  try {
    if (signal.aborted) throw new Error('Upstream request timed out')
    while (true) {
      const { done, value } = await reader.read()
      if (signal.aborted) throw new Error('Upstream request timed out')
      if (done) break
      received += value.byteLength
      if (received > maxBytes) {
        await reader.cancel()
        throw new Error('Upstream response too large')
      }
      chunks.push(value)
    }
  } finally {
    signal.removeEventListener('abort', abortRead)
    reader.releaseLock()
  }
  const body = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(body)) as unknown
}

export interface GatewayDependencies {
  authorize: (req: ApiRequest, res: ApiResponse) => DashboardSession | null
  fetch: typeof fetch
  env: Record<string, string | undefined>
}

const defaultDependencies: GatewayDependencies = {
  authorize: (req, res) =>
    requireDashboardSession(req as VercelRequest, res as unknown as VercelResponse, [
      'admin',
      'operator',
      'viewer',
    ]),
  fetch,
  env: process.env,
}

export async function handleDashboardRequest(
  req: ApiRequest,
  res: ApiResponse,
  dependencies: GatewayDependencies = defaultDependencies,
) {
  let requestId = randomUUID() as string
  const reply = (status: number, code: string, message: string, upstreamStatus?: number) =>
    send(res, status, code, message, requestId, upstreamStatus)
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Request-ID', requestId)
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return reply(405, 'METHOD_NOT_ALLOWED', 'Only GET is supported.')
  }

  const auth = await dependencies.authorize(req, res)
  if (!auth) return

  let requestUrl: URL
  try {
    if (!req.url?.startsWith('/api/dashboard/') || req.url.length > 8192 || req.url.includes('#'))
      return reply(400, 'INVALID_QUERY', 'The dashboard request URL is invalid.')
    requestUrl = new URL(req.url ?? '/', 'https://dashboard.invalid')
    if (requestUrl.pathname !== req.url.split('?')[0])
      return reply(400, 'INVALID_QUERY', 'The dashboard request URL is invalid.')
  } catch {
    return reply(400, 'INVALID_QUERY', 'The dashboard request URL is invalid.')
  }
  // Preserve the exact local resource name. Collapsing empty segments would
  // accept unsupported duplicate/trailing slash paths as an allowed resource.
  const resource = requestUrl.pathname.slice('/api/dashboard/'.length)
  const definition = Object.prototype.hasOwnProperty.call(dashboardReadRoutes, resource)
    ? dashboardReadRoutes[resource]
    : undefined
  if (!definition) return reply(404, 'NOT_FOUND', 'Dashboard resource was not found.')

  const parsedQuery = parseQuery(requestUrl.searchParams)
  if (!parsedQuery) return reply(400, 'INVALID_QUERY', 'Query parameters must not repeat.')
  const normalizedQuery: Record<string, string | number> = { ...parsedQuery }
  for (const key of ['page', 'pageSize']) {
    if (normalizedQuery[key] === undefined) continue
    // Accept decimal integers only. Number() alone also accepts whitespace,
    // exponents and hexadecimal values that are not valid pagination inputs.
    const rawValue = normalizedQuery[key]
    if (typeof rawValue !== 'string' || !/^\d+$/.test(rawValue))
      return reply(400, 'INVALID_QUERY', 'Query parameters are invalid.')
    const numericValue = Number(rawValue)
    if (!Number.isSafeInteger(numericValue))
      return reply(400, 'INVALID_QUERY', 'Query parameters are invalid.')
    normalizedQuery[key] = numericValue
  }
  const queryResult = definition.query.safeParse(normalizedQuery)
  if (!queryResult.success) return reply(400, 'INVALID_QUERY', 'Query parameters are invalid.')

  if (definition.unavailable || !definition.path)
    return reply(
      503,
      definition.unavailableCode ?? 'CONTRACT_SCHEMA_UNAVAILABLE',
      definition.unavailableCode === 'GATEWAY_ROUTE_UNAVAILABLE'
        ? `The dashboard has no confirmed Public Gateway contract for ${resource}. No upstream request was made.`
        : (definition.unavailable ?? 'This gateway resource is unavailable.'),
    )
  const schema = definition.response
  if (!schema)
    return reply(
      503,
      'CONTRACT_SCHEMA_UNAVAILABLE',
      `The Public Gateway route for ${resource} is configured, but its response schema is not available to the dashboard. No upstream request was made.`,
    )

  // Keep route construction constrained to this fixed GET allowlist. No caller
  // supplied path is ever forwarded to an upstream service.
  const baseUrl = resolveUpstreamBase(dependencies.env)
  if (!baseUrl)
    return reply(503, 'UPSTREAM_UNCONFIGURED', 'Configure the HTTPS dashboard gateway origin.')
  const token = dependencies.env.DASHBOARD_UPSTREAM_TOKEN
  // RFC 6750 bearer syntax; reject whitespace/control characters rather than
  // silently changing the configured credential.
  if (!token || !/^[A-Za-z0-9._~+/-]+=*$/.test(token))
    return reply(
      503,
      'UPSTREAM_UNCONFIGURED',
      'Configure the dedicated dashboard service credential.',
    )

  const documentId = (queryResult.data as { id?: string }).id
  const upstreamPath =
    definition.documentDetail || definition.requestDetail || definition.caseDetail
      ? definition.path.replace('{id}', encodeURIComponent(documentId!))
      : definition.path
  const target = new URL(dashboardGatewayNamespace + upstreamPath, baseUrl)
  const protectedValues = [
    token,
    baseUrl.origin,
    baseUrl.hostname,
    dependencies.env.DASHBOARD_SESSION_SECRET,
    dependencies.env.GOOGLE_CLIENT_SECRET,
  ].filter((value): value is string => Boolean(value))
  const containsProtectedData = (value: unknown) => {
    const serialized = JSON.stringify(value)
    return protectedValues.some((secret) =>
      [secret, encodeURIComponent(secret)].some((candidate) =>
        serialized.includes(JSON.stringify(candidate).slice(1, -1)),
      ),
    )
  }
  for (const [key, value] of Object.entries(
    queryResult.data as Record<string, string | number | undefined>,
  )) {
    if (value === undefined || key === 'id' || key === 'check') continue
    target.searchParams.set(key, String(value))
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const upstream = await dependencies.fetch(target, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Request-ID': requestId,
      },
      signal: controller.signal,
      redirect: 'error',
      cache: 'no-store',
    })
    const upstreamId =
      upstream.headers.get('x-request-id') ?? upstream.headers.get('x-correlation-id')
    const retainRequestId = (value: unknown) => {
      if (
        typeof value === 'string' &&
        /^[A-Za-z0-9._:-]{1,128}$/.test(value) &&
        !containsProtectedData(value)
      ) {
        requestId = value
        res.setHeader('X-Request-ID', requestId)
      }
    }
    retainRequestId(upstreamId)
    if (!upstream.ok) {
      let code = 'UPSTREAM_UNAVAILABLE'
      try {
        const body = await readBoundedJson(upstream, controller.signal, 16_384)
        const error = z
          .object({
            code: z.string().optional(),
            requestId: z.string().optional(),
            request_id: z.string().optional(),
            correlationId: z.string().optional(),
            error: z
              .union([
                z.string(),
                z.object({
                  code: z.string().optional(),
                  requestId: z.string().optional(),
                  correlationId: z.string().optional(),
                }),
              ])
              .optional(),
          })
          .safeParse(body)
        const candidate = error.success
          ? typeof error.data.error === 'string'
            ? error.data.error
            : (error.data.error?.code ?? error.data.code)
          : undefined
        if (!upstreamId && error.success) {
          const nested = typeof error.data.error === 'object' ? error.data.error : undefined
          retainRequestId(
            nested?.requestId ??
              nested?.correlationId ??
              error.data.requestId ??
              error.data.correlationId ??
              error.data.request_id,
          )
        }
        if (
          candidate &&
          /^[A-Z][A-Z0-9_]{0,79}$/.test(candidate) &&
          !containsProtectedData(candidate)
        )
          code = candidate
      } catch {
        /* Do not expose arbitrary upstream bodies or internal diagnostics. */
      }
      if (controller.signal.aborted) throw new Error('Upstream request timed out')
      const authFailure = upstream.status === 401 || upstream.status === 403
      const status = authFailure ? 502 : upstream.status >= 400 ? upstream.status : 502
      const message =
        code === 'DASHBOARD_AUTH_DISABLED'
          ? 'Middleware dashboard authentication is disabled.'
          : authFailure
            ? 'The middleware gateway rejected the dashboard service credential.'
            : `The middleware gateway returned HTTP ${upstream.status}.`
      return reply(status, code, message, upstream.status)
    }
    let payload: unknown
    try {
      payload = await readBoundedJson(upstream, controller.signal)
    } catch {
      if (controller.signal.aborted) throw new Error('Upstream request timed out')
      return reply(
        502,
        'UPSTREAM_CONTRACT_ERROR',
        'The middleware gateway returned invalid or oversized JSON.',
      )
    }
    const parsed = schema.safeParse(payload)
    if (!parsed.success)
      return reply(
        502,
        'UPSTREAM_CONTRACT_ERROR',
        'The middleware response did not match the dashboard contract.',
      )
    if (definition.requestDetail) {
      const detail = parsed.data as { request: { requestId: string; documentType: string } }
      if (
        detail.request.requestId !== documentId ||
        detail.request.documentType !== definition.requestDetail
      )
        return reply(
          502,
          'UPSTREAM_CONTRACT_ERROR',
          'The middleware returned a different request identity.',
        )
    }
    if (definition.caseDetail) {
      const detail = parsed.data as { id: string }
      if (detail.id !== documentId)
        return reply(
          502,
          'UPSTREAM_CONTRACT_ERROR',
          'The middleware returned a different manual-review case identity.',
        )
    }
    if (definition.documentDetail) {
      const detail = parsed.data as DocumentDetail
      const expectedType = resource === 'documents/invoice' ? 'invoice' : 'credit_note'
      const sourceId =
        expectedType === 'invoice' ? detail.document.invoice_id : detail.document.creditnote_id
      if (
        detail.zohoDocumentId !== documentId ||
        detail.documentType !== expectedType ||
        (sourceId != null && sourceId !== documentId)
      )
        return reply(
          502,
          'UPSTREAM_CONTRACT_ERROR',
          'The middleware returned a different document identity.',
        )
    }
    if (resource === 'overview') {
      const overview = parsed.data as {
        availability: string
        range?: { createdFrom: string; createdTo: string }
      }
      const requestedRange = queryResult.data as { createdFrom: string; createdTo: string }
      // The upstream can normalize offsets, but must describe the same instants.
      // Valid JSON for another window must not be presented as selected-range data.
      if (
        overview.availability === 'available' &&
        (!overview.range ||
          Date.parse(overview.range.createdFrom) !== Date.parse(requestedRange.createdFrom) ||
          Date.parse(overview.range.createdTo) !== Date.parse(requestedRange.createdTo))
      )
        return reply(
          502,
          'UPSTREAM_CONTRACT_ERROR',
          'The middleware overview did not match the requested date range.',
        )
    }
    const requestedPage = queryResult.data as { page?: number; pageSize?: number }
    const returnedPage = parsed.data as {
      page?: number
      pageSize?: number
      total?: number
      items?: unknown[]
    }
    if (
      requestedPage.page !== undefined &&
      (returnedPage.page !== requestedPage.page ||
        returnedPage.pageSize !== requestedPage.pageSize ||
        !Array.isArray(returnedPage.items) ||
        returnedPage.items.length > (returnedPage.pageSize ?? 0) ||
        (typeof returnedPage.total === 'number' &&
          returnedPage.items.length >
            Math.max(
              0,
              returnedPage.total - (requestedPage.page - 1) * (returnedPage.pageSize ?? 0),
            )))
    )
      return reply(
        502,
        'UPSTREAM_CONTRACT_ERROR',
        'The middleware pagination did not match the requested page.',
      )
    // A schema-valid response must still never echo the server-held credential.
    // Fail closed instead of returning a partially redacted operational record.
    if (containsProtectedData(parsed.data))
      return reply(
        502,
        'UPSTREAM_CONTRACT_ERROR',
        'The middleware response contained protected authentication data.',
      )
    return res.status(upstream.status).json(parsed.data)
  } catch {
    if (controller.signal.aborted)
      return reply(504, 'UPSTREAM_TIMEOUT', 'The middleware gateway request timed out.')
    return reply(
      502,
      'UPSTREAM_UNAVAILABLE',
      'The middleware gateway could not be reached or timed out.',
    )
  } finally {
    clearTimeout(timeout)
  }
}

/** Explicit mapping from the existing verified dashboard role model. */
export const middlewareRoles = {
  admin: 'administrator',
  operator: 'operations',
  viewer: 'viewer',
} as const

export function relayUserId(email: string, env: Record<string, string | undefined>): string | null {
  try {
    const entries: unknown = JSON.parse(env.DASHBOARD_USER_IDS ?? '')
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return null
    const users = new Map<string, string>()
    const ids = new Set<string>()
    for (const [key, value] of Object.entries(entries)) {
      const normalizedEmail = key.trim().toLowerCase()
      if (
        !normalizedEmail.includes('@') ||
        users.has(normalizedEmail) ||
        typeof value !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ||
        ids.has(value)
      )
        return null
      users.set(normalizedEmail, value)
      ids.add(value)
    }
    return users.get(email.toLowerCase()) ?? null
  } catch {
    return null
  }
}

/** Fixed G03 receipt read and explicitly confirmed cancellation relay. */
export async function handleG03Request(
  req: ApiRequest,
  res: ApiResponse,
  dependencies: GatewayDependencies = defaultDependencies,
) {
  let requestId: string = randomUUID()
  const reply = (status: number, code: string, message: string, upstreamStatus?: number) =>
    send(res, status, code, message, requestId, upstreamStatus)
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Request-ID', requestId)

  const read = req.url === '/api/device/g03/current-receipt'
  const cancel = req.url === '/api/device/g03/cancel-receipt'
  if (!read && !cancel) return reply(404, 'NOT_FOUND', 'Device resource was not found.')
  const method = cancel ? 'POST' : 'GET'
  if (req.method !== method) {
    res.setHeader('Allow', method)
    return reply(405, 'METHOD_NOT_ALLOWED', 'This device route requires ' + method + '.')
  }

  const session = await dependencies.authorize(req, res)
  if (!session) return
  if (cancel && session.role !== 'admin')
    return reply(
      403,
      'FORBIDDEN',
      'Administrator permission is required to cancel an open G03 receipt.',
    )
  if (cancel) {
    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([key, value]) => [key.toLowerCase(), value]),
    )
    const origin = headers.origin
    const contentType = Array.isArray(headers['content-type'])
      ? headers['content-type'][0]
      : headers['content-type']
    const fetchSite = headers['sec-fetch-site']
    const body = req.body
    const emptyObject =
      body !== null &&
      typeof body === 'object' &&
      !Array.isArray(body) &&
      Object.keys(body).length === 0
    if (
      origin !== dependencies.env.DASHBOARD_AUTH_URL ||
      (fetchSite !== undefined && fetchSite !== 'same-origin') ||
      typeof contentType !== 'string' ||
      contentType.split(';', 1)[0]!.trim().toLowerCase() !== 'application/json' ||
      !emptyObject
    )
      return reply(400, 'INVALID_REQUEST', 'The G03 cancellation request is invalid.')
  }
  const role = Object.prototype.hasOwnProperty.call(middlewareRoles, session.role)
    ? middlewareRoles[session.role]
    : undefined
  if (!role) return reply(403, 'FORBIDDEN', 'An authenticated dashboard user is required.')

  const userId = relayUserId(session.email, dependencies.env)
  if (!userId)
    return reply(
      503,
      'DASHBOARD_IDENTITY_UNCONFIGURED',
      'Configure DASHBOARD_USER_IDS with trusted internal IDs for approved users.',
    )
  const base = resolveUpstreamBase(dependencies.env)
  if (!base)
    return reply(
      503,
      'UPSTREAM_UNCONFIGURED',
      'Configure DASHBOARD_UPSTREAM_BASE_URL as the HTTPS public gateway origin.',
    )
  const token = dependencies.env.DASHBOARD_UPSTREAM_TOKEN
  if (!token || !/^[A-Za-z0-9._~+/-]+=*$/.test(token))
    return reply(
      503,
      'UPSTREAM_UNCONFIGURED',
      'Configure DASHBOARD_UPSTREAM_TOKEN on the dashboard server.',
    )

  const protectedValues = [
    token,
    base.origin,
    base.hostname,
    dependencies.env.DASHBOARD_SESSION_SECRET,
    dependencies.env.GOOGLE_CLIENT_SECRET,
    dependencies.env.DASHBOARD_USER_IDS,
  ].filter((value): value is string => Boolean(value))
  const protectedData = (value: unknown) => {
    const serialized = JSON.stringify(value)
    return protectedValues.some((secret) =>
      [secret, encodeURIComponent(secret)].some((candidate) =>
        serialized.includes(JSON.stringify(candidate).slice(1, -1)),
      ),
    )
  }
  const internalDiagnostic = (value: unknown): boolean => {
    if (typeof value === 'string')
      return /\bTraceback\b|node_modules|[A-Z]:\\|\/(?:home|var|etc)\/|\bat\s+\S+\s+\([^)]*:\d+:\d+\)/i.test(
        value,
      )
    if (Array.isArray(value)) return value.some(internalDiagnostic)
    return (
      value !== null && typeof value === 'object' && Object.values(value).some(internalDiagnostic)
    )
  }
  const retainId = (value: unknown) => {
    if (
      typeof value === 'string' &&
      /^[A-Za-z0-9._:-]{1,128}$/.test(value) &&
      !protectedData(value)
    ) {
      requestId = value
      res.setHeader('X-Request-ID', requestId)
    }
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), cancel ? 20_000 : 8_000)
  try {
    const upstream = await dependencies.fetch(
      new URL(
        cancel
          ? '/integrations/device/g03/cancel-receipt'
          : '/integrations/device/g03/current-receipt',
        base,
      ),
      {
        method: cancel ? 'POST' : 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer ' + token,
          'x-dashboard-user-id': userId,
          'x-dashboard-role': role,
          'X-Request-ID': requestId,
          ...(cancel ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(cancel ? { body: '{}' } : {}),
        signal: controller.signal,
        redirect: 'error',
        cache: 'no-store',
      },
    )
    const upstreamRequestId =
      upstream.headers.get('x-request-id') ?? upstream.headers.get('x-correlation-id')
    retainId(upstreamRequestId)
    let payload: unknown
    try {
      payload = await readBoundedJson(upstream, controller.signal, 262_144)
    } catch {
      if (controller.signal.aborted) throw new Error('Timed out')
      return reply(
        502,
        'UPSTREAM_CONTRACT_ERROR',
        'The device gateway returned invalid or oversized JSON.',
      )
    }
    const result = cancel
      ? cancelReceiptSchema.safeParse(payload)
      : receiptStateSchema.safeParse(payload)
    if (result.success && (upstream.ok || cancel)) {
      if (protectedData(result.data) || internalDiagnostic(result.data))
        return reply(
          502,
          'UPSTREAM_CONTRACT_ERROR',
          'The device response contained protected server data.',
        )
      return res.status(upstream.status).json(result.data)
    }
    if (upstream.ok)
      return reply(
        502,
        'UPSTREAM_CONTRACT_ERROR',
        'The device response did not match the confirmed receipt contract.',
      )

    const errorEnvelope = z
      .object({
        code: z.string().optional(),
        message: z.string().optional(),
        requestId: z.string().optional(),
        request_id: z.string().optional(),
        error: z
          .union([
            z.string(),
            z.object({
              code: z.string().optional(),
              message: z.string().optional(),
              requestId: z.string().optional(),
            }),
          ])
          .optional(),
      })
      .safeParse(payload)
    let code = 'UPSTREAM_UNAVAILABLE'
    let message = 'The device gateway returned HTTP ' + upstream.status + '.'
    if (errorEnvelope.success) {
      const value = errorEnvelope.data
      const nested = typeof value.error === 'object' ? value.error : undefined
      if (!upstreamRequestId) retainId(nested?.requestId ?? value.requestId ?? value.request_id)
      const candidate = nested?.code ?? value.code
      const detail = nested?.message ?? value.message
      if (candidate && /^[A-Z][A-Z0-9_]{0,79}$/.test(candidate) && !protectedData(candidate)) {
        code = candidate
        if (
          detail &&
          detail.length <= 500 &&
          !protectedData(detail) &&
          !/[\r\n<>]|\bstack\b|\btraceback\b|node_modules|[A-Z]:\\|\/(?:home|var|etc)\//i.test(
            detail,
          )
        )
          message = detail
      }
    }
    // A middleware credential failure must not expire the valid local login.
    return reply(
      upstream.status === 401 || upstream.status < 400 ? 502 : upstream.status,
      code,
      message,
      upstream.status,
    )
  } catch {
    return controller.signal.aborted
      ? reply(
          504,
          'UPSTREAM_TIMEOUT',
          'The device operation timed out; its outcome is not confirmed. Refresh the receipt state.',
        )
      : reply(
          502,
          'UPSTREAM_UNAVAILABLE',
          'The device gateway could not be reached. The operation outcome is not confirmed.',
        )
  } finally {
    clearTimeout(timeout)
  }
}

/** Fixed request-scoped Zoho writeback relay; never uses the read service bearer. */
export async function handleDashboardWritebackRequest(
  req: ApiRequest,
  res: ApiResponse,
  documentType: 'invoice' | 'credit_note',
  dependencies: GatewayDependencies = defaultDependencies,
) {
  let requestId: string = randomUUID()
  const reply = (status: number, code: string, message: string, upstreamStatus?: number) =>
    send(res, status, code, message, requestId, upstreamStatus)
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Request-ID', requestId)

  const routeBase = `/api/dashboard/writebacks/${documentType === 'invoice' ? 'invoices' : 'credit-notes'}/`
  let requestUrl: URL
  try {
    if (!req.url?.startsWith(routeBase) || req.url.length > 512 || req.url.includes('#'))
      return reply(400, 'INVALID_REQUEST', 'The writeback request URL is invalid.')
    requestUrl = new URL(req.url, 'https://dashboard.invalid')
    if (requestUrl.search || requestUrl.pathname !== req.url)
      return reply(400, 'INVALID_REQUEST', 'The writeback request URL is invalid.')
  } catch {
    return reply(400, 'INVALID_REQUEST', 'The writeback request URL is invalid.')
  }
  const requestIdFromPath = requestUrl.pathname.slice(routeBase.length)
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(requestIdFromPath))
    return reply(400, 'INVALID_REQUEST', 'The fiscalization request ID is invalid.')

  const method = req.method
  if (method !== 'GET' && method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return reply(405, 'METHOD_NOT_ALLOWED', 'Only GET and POST are supported for writeback.')
  }

  const session = await dependencies.authorize(req, res)
  if (!session) return
  if (session.role !== 'admin' && session.role !== 'operator')
    return reply(403, 'FORBIDDEN', 'Administrator or operations permission is required.')

  if (method === 'POST') {
    const headers = Object.fromEntries(
      Object.entries(req.headers).map(([key, value]) => [key.toLowerCase(), value]),
    )
    const origin = headers.origin
    const fetchSite = headers['sec-fetch-site']
    const body = req.body
    const emptyBody =
      body === undefined ||
      body === null ||
      (typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0)
    if (
      origin !== dependencies.env.DASHBOARD_AUTH_URL ||
      (fetchSite !== undefined && fetchSite !== 'same-origin') ||
      !emptyBody
    )
      return reply(400, 'INVALID_REQUEST', 'The writeback recovery request is invalid.')
  }

  const role = middlewareRoles[session.role]
  const userId = relayUserId(session.email, dependencies.env)
  if (!userId)
    return reply(
      503,
      'DASHBOARD_IDENTITY_UNCONFIGURED',
      'Configure DASHBOARD_USER_IDS with a trusted operator ID for this user.',
    )
  const base = resolveUpstreamBase(dependencies.env)
  if (!base)
    return reply(503, 'UPSTREAM_UNCONFIGURED', 'Configure the HTTPS public gateway origin.')
  const writebackToken = dependencies.env.DASHBOARD_WRITEBACK_SERVICE_BEARER_TOKEN
  if (!writebackToken || !/^[A-Za-z0-9._~+/-]+=*$/.test(writebackToken))
    return reply(
      503,
      'WRITEBACK_CREDENTIAL_UNCONFIGURED',
      'Configure DASHBOARD_WRITEBACK_SERVICE_BEARER_TOKEN on the dashboard server.',
    )

  const protectedValues = [
    writebackToken,
    dependencies.env.DASHBOARD_UPSTREAM_TOKEN,
    base.origin,
    base.hostname,
    dependencies.env.DASHBOARD_SESSION_SECRET,
    dependencies.env.GOOGLE_CLIENT_SECRET,
    dependencies.env.DASHBOARD_USER_IDS,
    userId,
  ].filter((value): value is string => Boolean(value))
  const containsProtectedData = (value: unknown) => {
    const serialized = JSON.stringify(value)
    return protectedValues.some((secret) =>
      [secret, encodeURIComponent(secret)].some((candidate) =>
        serialized.includes(JSON.stringify(candidate).slice(1, -1)),
      ),
    )
  }
  const retainRequestId = (value: unknown) => {
    if (
      typeof value === 'string' &&
      /^[A-Za-z0-9._:-]{1,128}$/.test(value) &&
      !containsProtectedData(value)
    ) {
      requestId = value
      res.setHeader('X-Request-ID', requestId)
    }
  }

  const target = new URL(
    `/api/dashboard/writebacks/${documentType === 'invoice' ? 'invoices' : 'credit-notes'}/${encodeURIComponent(requestIdFromPath)}`,
    base,
  )
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), method === 'POST' ? 25_000 : 8_000)
  try {
    const upstream = await dependencies.fetch(target, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${writebackToken}`,
        'x-dashboard-user-id': userId,
        'x-dashboard-role': role,
        'X-Request-ID': requestId,
      },
      signal: controller.signal,
      redirect: 'error',
      cache: 'no-store',
    })
    retainRequestId(
      upstream.headers.get('x-request-id') ?? upstream.headers.get('x-correlation-id'),
    )
    let payload: unknown
    try {
      payload = await readBoundedJson(upstream, controller.signal, 262_144)
    } catch {
      if (controller.signal.aborted) throw new Error('Upstream timed out')
      return reply(
        502,
        'UPSTREAM_CONTRACT_ERROR',
        'The writeback gateway returned invalid or oversized JSON.',
      )
    }

    if (upstream.ok) {
      const parsed = writebackRecoverySchema.safeParse(payload)
      if (!parsed.success || parsed.data.requestId !== requestIdFromPath)
        return reply(
          502,
          'UPSTREAM_CONTRACT_ERROR',
          'The writeback gateway response did not match the request contract.',
        )
      if (!upstream.headers.get('x-request-id') && !upstream.headers.get('x-correlation-id'))
        retainRequestId(parsed.data.correlationId)
      if (containsProtectedData(parsed.data))
        return reply(
          502,
          'UPSTREAM_CONTRACT_ERROR',
          'The writeback gateway response contained protected server data.',
        )
      return res.status(upstream.status).json(parsed.data)
    }

    const errorSchema = z.object({
      error: z
        .union([
          z.string(),
          z.object({
            code: z.string().optional(),
            message: z.string().optional(),
            requestId: z.string().optional(),
            correlationId: z.string().optional(),
          }),
        ])
        .optional(),
      code: z.string().optional(),
      message: z.string().optional(),
      requestId: z.string().optional(),
      correlationId: z.string().optional(),
      request_id: z.string().optional(),
    })
    const parsedError = errorSchema.safeParse(payload)
    const nested =
      parsedError.success && parsedError.data.error && typeof parsedError.data.error === 'object'
        ? parsedError.data.error
        : undefined
    if (parsedError.success && !upstream.headers.has('x-request-id'))
      retainRequestId(
        nested?.requestId ??
          nested?.correlationId ??
          parsedError.data.requestId ??
          parsedError.data.correlationId ??
          parsedError.data.request_id,
      )
    const rawCode =
      parsedError.success && typeof parsedError.data.error === 'string'
        ? parsedError.data.error
        : (nested?.code ?? (parsedError.success ? parsedError.data.code : undefined))
    const rawMessage =
      nested?.message ?? (parsedError.success ? parsedError.data.message : undefined)
    const safeCode =
      rawCode && /^[A-Z][A-Z0-9_]{0,79}$/.test(rawCode) && !containsProtectedData(rawCode)
        ? rawCode
        : 'WRITEBACK_GATEWAY_ERROR'
    const safeMessage =
      rawMessage &&
      rawMessage.length <= 500 &&
      !containsProtectedData(rawMessage) &&
      !/[\r\n<>]|\bstack\b|\btraceback\b|node_modules|[A-Z]:\\|\/(?:home|var|etc)\//i.test(
        rawMessage,
      )
        ? rawMessage
        : `The writeback gateway returned HTTP ${upstream.status}.`
    const status = upstream.status === 401 ? 502 : upstream.status
    return reply(status, safeCode, safeMessage, upstream.status)
  } catch {
    return controller.signal.aborted
      ? reply(504, 'UPSTREAM_TIMEOUT', 'The writeback request timed out; refresh its status.')
      : reply(502, 'UPSTREAM_UNAVAILABLE', 'The writeback gateway could not be reached.')
  } finally {
    clearTimeout(timeout)
  }
}
