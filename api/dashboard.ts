import { randomUUID } from 'node:crypto'
import { dashboardReadRoutes } from './_lib/dashboard-contracts.js'
import {
  handleDashboardRequest,
  type ApiRequest,
  type ApiResponse,
} from './_lib/dashboard-gateway.js'

/** Fixed rewrites share one function; resource paths never select an upstream URL. */
export default async function dashboard(req: ApiRequest, res: ApiResponse) {
  const url = new URL(req.url ?? '/', 'https://dashboard.invalid')
  const resources = url.searchParams.getAll('dashboardResource')
  if (
    resources.length !== 1 ||
    !Object.prototype.hasOwnProperty.call(dashboardReadRoutes, resources[0])
  ) {
    const requestId = randomUUID()
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Request-ID', requestId)
    return res.status(400).json({
      error: { code: 'INVALID_QUERY', message: 'The dashboard resource is invalid.', requestId },
    })
  }
  // Remove only the explicit fixed-rewrite selector. All application query
  // parameters, including unknown and duplicate keys, reach the strict validator.
  url.searchParams.delete('dashboardResource')

  // Vercel exposes captured dynamic rewrite parameters on req.query. Depending
  // on the function routing path, the rewritten URL can omit the destination
  // query substitution even though the original route parameter is available.
  // Normalize only these two fixed document routes; the gateway still receives
  // the validated identifier in its path, never as a query parameter.
  const routeParameter =
    resources[0] === 'documents/invoice'
      ? 'invoiceId'
      : resources[0] === 'documents/credit-note'
        ? 'creditNoteId'
        : undefined
  if (routeParameter) {
    const ids = url.searchParams.getAll('id')
    const routeIds = url.searchParams.getAll(routeParameter)
    if (ids.length === 0) {
      const candidates: Array<string | string[] | undefined> = [
        ...routeIds,
        req.query?.[routeParameter],
        req.query?.id,
      ]
      const presentCandidates = candidates.filter((value) => value !== undefined)
      const fallbackId =
        presentCandidates.length > 0 &&
        presentCandidates.every((value) => typeof value === 'string') &&
        presentCandidates.every((value) => value === presentCandidates[0])
          ? (presentCandidates[0] as string)
          : undefined
      if (fallbackId !== undefined) url.searchParams.set('id', fallbackId)
    }
    // Vercel may retain the captured source parameter alongside the explicit
    // destination `id`. Remove it only when it is one unambiguous match.
    const normalizedIds = url.searchParams.getAll('id')
    if (normalizedIds.length === 1 && routeIds.length === 1 && routeIds[0] === normalizedIds[0]) {
      url.searchParams.delete(routeParameter)
    }
  }
  return handleDashboardRequest(
    {
      method: req.method,
      headers: req.headers,
      body: req.body,
      url: `/api/dashboard/${resources[0]}${url.search}`,
    },
    res,
  )
}
