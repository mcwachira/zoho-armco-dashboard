import {
  handleDashboardWritebackRequest,
  type ApiRequest,
  type ApiResponse,
} from '../../../_lib/dashboard-gateway.js'

export default function creditNoteWriteback(req: ApiRequest, res: ApiResponse) {
  return handleDashboardWritebackRequest(req, res, 'credit_note')
}
