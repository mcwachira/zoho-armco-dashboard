import {
  handleDashboardWritebackRequest,
  type ApiRequest,
  type ApiResponse,
} from '../../../_lib/dashboard-gateway.js'

export default function invoiceWriteback(req: ApiRequest, res: ApiResponse) {
  return handleDashboardWritebackRequest(req, res, 'invoice')
}
