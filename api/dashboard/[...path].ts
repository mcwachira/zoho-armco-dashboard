import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  handleDashboardRequest,
  type ApiRequest,
  type ApiResponse,
} from '../_lib/dashboard-gateway.js'

export default function dashboardApi(req: IncomingMessage, res: ServerResponse) {
  return handleDashboardRequest(req as unknown as ApiRequest, res as unknown as ApiResponse)
}
