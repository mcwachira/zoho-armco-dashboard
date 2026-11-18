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
