import { z } from 'zod'
import {
  documentPageSchema,
  documentDetailSchema,
} from '../../src/features/api/document-contracts.js'
import {
  dashboardDeviceDiagnosticsSchema,
  dashboardCreditNoteDetailSchema,
  dashboardCreditNotePageSchema,
  dashboardCreditNoteQueryParamsSchema,
  dashboardInvoicePageSchema,
  dashboardInvoiceDetailSchema,
  dashboardInvoiceQueryParamsSchema,
  dashboardOverviewQueryParamsSchema,
  dashboardOverviewSchema,
  dashboardManualReviewSchema,
  dashboardServiceHealthSchema,
  manualReviewCaseResponseSchema,
} from '../../src/features/api/schemas.js'
import { writebackOperationsPageSchema } from '../../src/features/api/operation-contracts.js'

// Canonical resource names supplied by the user. Preserve the existing gateway
// namespace until the transferred route matrix resolves full external URLs.
// Fresh unsigned probes: literal roots 404, /api/dashboard-prefixed reads 401.
export const dashboardGatewayNamespace = '/api/dashboard'

// Browser routes remain independently mapped by the fixed Vercel rewrites.
export type DashboardGatewayPath =
  | '/overview'
  | '/invoices'
  | '/credit-notes'
  | '/services'
  | '/device'
  | '/writebacks'
  | '/reconciliation'
  | '/events'
  | '/operations'
  | '/documents/invoices'
  | '/documents/credit-notes'
  | '/invoices/{id}'
  | '/credit-notes/{id}'
  | '/documents/invoices/{id}'
  | '/documents/credit-notes/{id}'
  | '/manual-review'
  | '/manual-review/{id}'
const text = z.string().trim().min(1).max(128)
const timestamp = z.string().datetime({ offset: true })
export const dashboardIdQuery = z
  .object({ id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/) })
  .strict()
const noQuery = z.object({}).strict()
const page = {
  page: z.number().int().min(1).max(100).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
}
const dates = { createdFrom: timestamp.optional(), createdTo: timestamp.optional() }
function orderedDates(
  value: { createdFrom?: string; createdTo?: string; dateFrom?: string; dateTo?: string },
  context: z.RefinementCtx,
) {
  const from = value.createdFrom ?? value.dateFrom
  const to = value.createdTo ?? value.dateTo
  if (from && to && Date.parse(from) > Date.parse(to))
    context.addIssue({ code: 'custom', message: 'Date range must be ordered.' })
}
const documentQuery = z
  .object({
    page: z.number().int().positive().default(1),
    pageSize: z.number().int().min(1).max(200).default(25),
    search: text.optional(),
    status: text.optional(),
    customerId: text.optional(),
    dateFrom: timestamp.optional(),
    dateTo: timestamp.optional(),
    sortBy: text.optional(),
    sortOrder: z.enum(['A', 'D']).optional(),
  })
  .strict()
  .superRefine(orderedDates)
const documentType = { documentType: text.optional() }
const listQuery = z
  .object({ ...page, ...documentType, ...dates, status: text.optional() })
  .strict()
  .superRefine(orderedDates)

export interface DashboardReadRoute {
  path?: DashboardGatewayPath
  query: z.ZodType
  response?: z.ZodType
  documentDetail?: boolean
  requestDetail?: 'invoice' | 'credit_note'
  caseDetail?: boolean
  unavailable?: string
  unavailableCode?: string
}

const unavailable = {
  unavailableCode: 'GATEWAY_ROUTE_UNAVAILABLE',
  unavailable: 'This resource is not enabled through the read-only dashboard gateway.',
}
const detailContractPending = {
  unavailableCode: 'CONTRACT_ROUTE_UNAVAILABLE',
  unavailable:
    'The exact Public Gateway detail route and successful response require confirmation from the server audit reports. No upstream request was made.',
}

export const dashboardReadRoutes: Record<string, DashboardReadRoute> = {
  invoices: {
    path: '/invoices',
    query: dashboardInvoiceQueryParamsSchema,
    response: dashboardInvoicePageSchema,
  },
  'credit-notes': {
    path: '/credit-notes',
    query: dashboardCreditNoteQueryParamsSchema,
    response: dashboardCreditNotePageSchema,
  },
  invoice: {
    path: '/invoices/{id}',
    query: dashboardIdQuery,
    response: dashboardInvoiceDetailSchema,
    requestDetail: 'invoice',
  },
  'credit-note': {
    path: '/credit-notes/{id}',
    query: dashboardIdQuery,
    response: dashboardCreditNoteDetailSchema,
    requestDetail: 'credit_note',
    ...detailContractPending,
  },
  requests: {
    // Existing UI alias; this adds no upstream route.
    path: '/invoices',
    query: dashboardInvoiceQueryParamsSchema,
    response: dashboardInvoicePageSchema,
  },
  request: {
    path: '/invoices/{id}',
    query: dashboardIdQuery,
    response: dashboardInvoiceDetailSchema,
    requestDetail: 'invoice',
    ...detailContractPending,
  },
  overview: {
    path: '/overview',
    query: dashboardOverviewQueryParamsSchema,
    response: dashboardOverviewSchema,
  },
  services: {
    path: '/services',
    query: noQuery,
    response: dashboardServiceHealthSchema,
  },
  device: {
    path: '/device',
    query: noQuery,
    response: dashboardDeviceDiagnosticsSchema,
  },
  capabilities: {
    query: noQuery,
    ...unavailable,
  },
  writebacks: {
    path: '/writebacks',
    query: z
      .object({
        ...page,
        page: z.number().int().positive().default(1),
        ...documentType,
        ...dates,
        status: text.optional(),
      })
      .strict()
      .superRefine(orderedDates),
    response: writebackOperationsPageSchema,
  },
  'manual-review': {
    path: '/manual-review',
    query: z
      .object({
        page: z.number().int().min(1).max(100).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
        status: z.enum(['open', 'resolved']).optional(),
      })
      .strict(),
    response: dashboardManualReviewSchema,
  },
  'manual-review-case': {
    path: '/manual-review/{id}',
    query: dashboardIdQuery,
    response: manualReviewCaseResponseSchema,
    caseDetail: true,
  },
  reconciliation: {
    path: '/reconciliation',
    query: listQuery,
  },
  events: {
    path: '/events',
    query: z
      .object({ ...page, ...documentType, ...dates })
      .strict()
      .superRefine(orderedDates),
  },
  operations: {
    path: '/operations',
    query: z.object({ ...page, ...documentType }).strict(),
  },
  'documents/invoices': {
    path: '/documents/invoices',
    query: documentQuery,
    response: documentPageSchema,
  },
  'documents/invoice': {
    path: '/documents/invoices/{id}',
    query: dashboardIdQuery,
    documentDetail: true,
    response: documentDetailSchema,
    ...detailContractPending,
  },
  'documents/credit-notes': {
    path: '/documents/credit-notes',
    query: documentQuery,
    response: documentPageSchema,
  },
  'documents/credit-note': {
    path: '/documents/credit-notes/{id}',
    query: dashboardIdQuery,
    documentDetail: true,
    response: documentDetailSchema,
    ...detailContractPending,
  },
  health: {
    query: z.object({ check: z.enum(['live', 'ready']) }).strict(),
    unavailableCode: 'CONTRACT_ROUTE_UNAVAILABLE',
    unavailable:
      'The middleware dashboard contract does not authorize service-bearer access to health probes. Use the documented services endpoint.',
  },
  telemetry: {
    query: noQuery,
    unavailableCode: 'CONTRACT_ROUTE_UNAVAILABLE',
    unavailable:
      'The middleware dashboard contract does not authorize service-bearer access to integration metrics. Use the observability snapshot in services.',
  },
  writeback: {
    query: dashboardIdQuery,
    unavailableCode: 'CONTRACT_ROUTE_UNAVAILABLE',
    unavailable:
      'The middleware contract exposes writeback mutation routes and persisted request writeback details, but no independent GET writeback-detail endpoint.',
  },
}
