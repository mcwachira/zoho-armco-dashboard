import { z } from 'zod'
import {
  dashboardCapabilitiesSchema,
  dashboardCreditNoteDetailSchema,
  dashboardCreditNotePageSchema,
  dashboardCreditNoteQueryParamsSchema,
  dashboardDeviceDiagnosticsSchema,
  dashboardInvoiceDetailSchema,
  dashboardInvoicePageSchema,
  dashboardInvoiceQueryParamsSchema,
  dashboardManualReviewQueryParamsSchema,
  dashboardManualReviewSchema,
  dashboardOverviewQueryParamsSchema,
  dashboardOverviewSchema,
  dashboardReconciliationSchema,
  dashboardServiceHealthSchema,
  dashboardWritebacksUnavailableSchema,
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
  capabilities: dashboardCapabilitiesSchema,
  invoices: dashboardInvoicePageSchema,
  'credit-notes': dashboardCreditNotePageSchema,
  overview: dashboardOverviewSchema,
  writebacks: dashboardWritebacksUnavailableSchema,
  'manual-review': dashboardManualReviewSchema,
  reconciliation: dashboardReconciliationSchema,
  device: dashboardDeviceDiagnosticsSchema,
  services: dashboardServiceHealthSchema,
}

const querySchemas: Record<string, z.ZodType> = {
  capabilities: noQuery,
  invoices: dashboardInvoiceQueryParamsSchema,
  'credit-notes': dashboardCreditNoteQueryParamsSchema,
  overview: dashboardOverviewQueryParamsSchema,
  writebacks: noQuery,
  'manual-review': dashboardManualReviewQueryParamsSchema,
  reconciliation: noQuery,
  device: noQuery,
  services: noQuery,
}

function send(res: ApiResponse, status: number, code: string, message: string) {
  res.setHeader('Cache-Control', 'no-store')
  return res.status(status).json({ error: { code, message } })
}

function resolveUpstreamBase(raw: string | undefined): URL | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.hostname.toLowerCase() === 'g11server.tailaff2e5.ts.net' ||
      /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(url.hostname)
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
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return send(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET is supported.')

  const auth = await dependencies.authorize(req, res)
  if (!auth) return

  const requestUrl = new URL(req.url ?? '/', 'https://dashboard.invalid')
  const segments = requestUrl.pathname.split('/').filter(Boolean)
  if (segments[0] !== 'api' || segments[1] !== 'dashboard')
    return send(res, 404, 'NOT_FOUND', 'Dashboard resource was not found.')
  const parts = segments.slice(2)
  const [resource, id, ...extra] = parts
  if (!resource || extra.length || (id && !['invoices', 'credit-notes'].includes(resource)))
    return send(res, 404, 'NOT_FOUND', 'Dashboard resource was not found.')

  let decodedId = id
  if (id) {
    try {
      decodedId = decodeURIComponent(id)
    } catch {
      return send(res, 400, 'INVALID_ID', 'The dashboard record identifier is invalid.')
    }
  }
  const schema = id
    ? resource === 'invoices'
      ? dashboardInvoiceDetailSchema
      : dashboardCreditNoteDetailSchema
    : endpointSchemas[resource]
  const querySchema = id ? noQuery : querySchemas[resource]
  if (!schema || !querySchema)
    return send(res, 404, 'NOT_FOUND', 'Dashboard resource was not found.')

  const parsedQuery = parseQuery(requestUrl.searchParams)
  if (!parsedQuery) return send(res, 400, 'INVALID_QUERY', 'Query parameters must not repeat.')
  const normalizedQuery: Record<string, string | number> = { ...parsedQuery }
  for (const key of ['page', 'pageSize']) {
    if (normalizedQuery[key] === undefined) continue
    const numericValue = Number(normalizedQuery[key])
    if (!Number.isInteger(numericValue))
      return send(res, 400, 'INVALID_QUERY', 'Query parameters are invalid.')
    normalizedQuery[key] = numericValue
  }
  const queryResult = querySchema.safeParse(normalizedQuery)
  if (!queryResult.success) return send(res, 400, 'INVALID_QUERY', 'Query parameters are invalid.')

  // Keep route construction constrained to this fixed GET allowlist. No caller
  // supplied path is ever forwarded to an upstream service.
  const route = id
    ? `/api/dashboard/${resource}/${encodeURIComponent(decodedId ?? '')}`
    : `/api/dashboard/${resource}`
  if (decodedId && (decodedId.length > 100 || decodedId.includes('/') || decodedId.includes('\\')))
    return send(res, 400, 'INVALID_ID', 'The dashboard record identifier is invalid.')

  if (dependencies.env.DASHBOARD_DATA_MODE !== 'testing-api')
    return send(res, 503, 'UPSTREAM_UNCONFIGURED', 'A verified testing API is not configured.')
  const baseUrl = resolveUpstreamBase(dependencies.env.DASHBOARD_UPSTREAM_BASE_URL)
  if (!baseUrl)
    return send(res, 503, 'UPSTREAM_UNCONFIGURED', 'A valid HTTPS testing API is not configured.')

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
        ...(dependencies.env.DASHBOARD_UPSTREAM_TOKEN
          ? { Authorization: `Bearer ${dependencies.env.DASHBOARD_UPSTREAM_TOKEN}` }
          : {}),
      },
      signal: controller.signal,
      redirect: 'error',
    })
    if (!upstream.ok)
      return send(res, 502, 'UPSTREAM_UNAVAILABLE', 'The configured testing API is unavailable.')
    let payload: unknown
    try {
      payload = await readBoundedJson(upstream)
    } catch {
      return send(
        res,
        502,
        'UPSTREAM_CONTRACT_ERROR',
        'The testing API returned an invalid response.',
      )
    }
    const parsed = schema.safeParse(payload)
    if (!parsed.success)
      return send(
        res,
        502,
        'UPSTREAM_CONTRACT_ERROR',
        'The testing API response did not match the dashboard contract.',
      )
    return res.status(200).json(parsed.data)
  } catch {
    return send(
      res,
      502,
      'UPSTREAM_UNAVAILABLE',
      'The configured testing API could not be reached.',
    )
  } finally {
    clearTimeout(timeout)
  }
}
