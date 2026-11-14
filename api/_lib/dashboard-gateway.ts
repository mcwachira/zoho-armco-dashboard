import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  dashboardCreditNotePageSchema,
  dashboardCreditNoteQueryParamsSchema,
  dashboardInvoicePageSchema,
  dashboardInvoiceQueryParamsSchema,
  dashboardOverviewQueryParamsSchema,
  dashboardOverviewSchema,
  dashboardServiceHealthSchema,
} from '../../src/features/api/schemas.js'
import {
  requireDashboardSession,
  type DashboardSession,
  type VercelRequest,
  type VercelResponse,
} from './auth.js'

export interface ApiRequest {
  url?: string
  method?: string
  headers: Record<string, string | string[] | undefined>
}
export interface ApiResponse {
  status: (code: number) => ApiResponse
  json: (body: unknown) => void
  setHeader: (name: string, value: string | string[]) => ApiResponse
}

const noQuery = z.object({}).strict()
const endpointSchemas: Record<string, z.ZodType> = {
  invoices: dashboardInvoicePageSchema,
  'credit-notes': dashboardCreditNotePageSchema,
  overview: dashboardOverviewSchema,
  services: dashboardServiceHealthSchema,
}

const querySchemas: Record<string, z.ZodType> = {
  invoices: dashboardInvoiceQueryParamsSchema,
  'credit-notes': dashboardCreditNoteQueryParamsSchema,
  overview: dashboardOverviewQueryParamsSchema,
  services: noQuery,
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

async function readBoundedJson(response: Response, maxBytes = 1_048_576): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes)
    throw new Error('Upstream response too large')
  if (!response.body) throw new Error('Upstream body missing')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > maxBytes) {
      await reader.cancel()
      throw new Error('Upstream response too large')
    }
    chunks.push(value)
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
    requireDashboardSession(req as VercelRequest, res as unknown as VercelResponse),
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
  if (req.method !== 'GET') return reply(405, 'METHOD_NOT_ALLOWED', 'Only GET is supported.')

  const auth = await dependencies.authorize(req, res)
  if (!auth) return

  const requestUrl = new URL(req.url ?? '/', 'https://dashboard.invalid')
  const segments = requestUrl.pathname.split('/').filter(Boolean)
  if (segments[0] !== 'api' || segments[1] !== 'dashboard')
    return reply(404, 'NOT_FOUND', 'Dashboard resource was not found.')
  const parts = segments.slice(2)
  const [resource] = parts
  if (!resource || parts.length !== 1)
    return reply(404, 'NOT_FOUND', 'Dashboard resource was not found.')
  const schema = Object.hasOwn(endpointSchemas, resource) ? endpointSchemas[resource] : undefined
  const querySchema = Object.hasOwn(querySchemas, resource) ? querySchemas[resource] : undefined
  if (!schema || !querySchema) return reply(404, 'NOT_FOUND', 'Dashboard resource was not found.')

  const parsedQuery = parseQuery(requestUrl.searchParams)
  if (!parsedQuery) return reply(400, 'INVALID_QUERY', 'Query parameters must not repeat.')
  const normalizedQuery: Record<string, string | number> = { ...parsedQuery }
  for (const key of ['page', 'pageSize']) {
    if (normalizedQuery[key] === undefined) continue
    const numericValue = Number(normalizedQuery[key])
    if (!Number.isInteger(numericValue))
      return reply(400, 'INVALID_QUERY', 'Query parameters are invalid.')
    normalizedQuery[key] = numericValue
  }
  const queryResult = querySchema.safeParse(normalizedQuery)
  if (!queryResult.success) return reply(400, 'INVALID_QUERY', 'Query parameters are invalid.')

  // Keep route construction constrained to this fixed GET allowlist. No caller
  // supplied path is ever forwarded to an upstream service.
  const route = `/api/dashboard/${resource}`
  const baseUrl = resolveUpstreamBase(dependencies.env)
  if (!baseUrl)
    return reply(503, 'UPSTREAM_UNCONFIGURED', 'Configure the HTTPS dashboard gateway origin.')
  const token = dependencies.env.DASHBOARD_UPSTREAM_TOKEN?.trim()
  if (!token || /\s/.test(token))
    return reply(
      503,
      'UPSTREAM_UNCONFIGURED',
      'Configure the dedicated dashboard service credential.',
    )

  const target = new URL(route, baseUrl)
  for (const [key, value] of Object.entries(
    queryResult.data as Record<string, string | number | undefined>,
  )) {
    if (value === undefined) continue
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
    })
    const upstreamId =
      upstream.headers.get('x-request-id') ?? upstream.headers.get('x-correlation-id')
    const retainRequestId = (value: unknown) => {
      if (
        typeof value === 'string' &&
        /^[A-Za-z0-9._:-]{1,128}$/.test(value) &&
        !value.includes(token)
      ) {
        requestId = value
        res.setHeader('X-Request-ID', requestId)
      }
    }
    retainRequestId(upstreamId)
    if (!upstream.ok) {
      let code = 'UPSTREAM_UNAVAILABLE'
      try {
        const body = await readBoundedJson(upstream, 16_384)
        const error = z
          .object({
            code: z.string().optional(),
            requestId: z.string().optional(),
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
              error.data.correlationId,
          )
        }
        if (candidate && /^[A-Z][A-Z0-9_]{0,79}$/.test(candidate) && !candidate.includes(token))
          code = candidate
      } catch {
        /* Do not expose arbitrary upstream bodies or internal diagnostics. */
      }
      const authFailure = upstream.status === 401 || upstream.status === 403
      const status = authFailure
        ? 502
        : [400, 404, 429, 503].includes(upstream.status)
          ? upstream.status
          : 502
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
      payload = await readBoundedJson(upstream)
    } catch {
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
    return res.status(200).json(parsed.data)
  } catch {
    return reply(
      502,
      'UPSTREAM_UNAVAILABLE',
      'The middleware gateway could not be reached or timed out.',
    )
  } finally {
    clearTimeout(timeout)
  }
}
