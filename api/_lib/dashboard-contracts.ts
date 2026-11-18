import { z } from 'zod'
import {
  documentPageSchema,
  documentDetailSchema,
} from '../../src/features/api/document-contracts.js'
import {
  dashboardCreditNotePageSchema,
  dashboardCreditNoteQueryParamsSchema,
  dashboardInvoicePageSchema,
  dashboardInvoiceQueryParamsSchema,
  dashboardOverviewQueryParamsSchema,
  dashboardOverviewSchema,
  dashboardServiceHealthSchema,
} from '../../src/features/api/schemas.js'

// Existing reads plus four document mappings. Nested document projections are
// explicitly provisional; authenticated gateway compatibility is unverified.
export type DashboardGatewayPath =
  | '/api/dashboard/overview'
  | '/api/dashboard/invoices'
  | '/api/dashboard/credit-notes'
  | '/api/dashboard/services'
  | '/api/dashboard/documents/invoices'
  | '/api/dashboard/documents/credit-notes'
  | '/api/dashboard/documents/invoices/{id}'
  | '/api/dashboard/documents/credit-notes/{id}'
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
  unavailable?: string
  unavailableCode?: string
}

const unavailable = {
  unavailableCode: 'GATEWAY_ROUTE_UNAVAILABLE',
  unavailable: 'This resource is not enabled through the read-only dashboard gateway.',
}

export const dashboardReadRoutes: Record<string, DashboardReadRoute> = {
  invoices: {
    path: '/api/dashboard/invoices',
    query: dashboardInvoiceQueryParamsSchema,
    response: dashboardInvoicePageSchema,
  },
  'credit-notes': {
    path: '/api/dashboard/credit-notes',
    query: dashboardCreditNoteQueryParamsSchema,
    response: dashboardCreditNotePageSchema,
  },
  invoice: {
    query: dashboardIdQuery,
    ...unavailable,
  },
  'credit-note': {
    query: dashboardIdQuery,
    ...unavailable,
  },
  requests: {
    // Existing UI alias; this adds no upstream route.
    path: '/api/dashboard/invoices',
    query: dashboardInvoiceQueryParamsSchema,
    response: dashboardInvoicePageSchema,
  },
  request: {
    query: dashboardIdQuery,
    ...unavailable,
  },
  overview: {
    path: '/api/dashboard/overview',
    query: dashboardOverviewQueryParamsSchema,
    response: dashboardOverviewSchema,
  },
  services: {
    path: '/api/dashboard/services',
    query: noQuery,
    response: dashboardServiceHealthSchema,
  },
  device: {
    query: noQuery,
    ...unavailable,
  },
  capabilities: {
    query: noQuery,
    ...unavailable,
  },
  writebacks: {
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
    ...unavailable,
  },
  'manual-review': {
    query: z
      .object({ ...page, ...dates, status: z.enum(['open', 'resolved']).optional() })
      .strict()
      .superRefine(orderedDates),
    ...unavailable,
  },
  'manual-review-case': {
    query: dashboardIdQuery,
    ...unavailable,
  },
  reconciliation: {
    query: listQuery,
    ...unavailable,
  },
  events: {
    query: z
      .object({ ...page, ...documentType, ...dates })
      .strict()
      .superRefine(orderedDates),
    ...unavailable,
  },
  operations: {
    query: z.object({ ...page, ...documentType }).strict(),
    ...unavailable,
  },
  'documents/invoices': {
    path: '/api/dashboard/documents/invoices',
    query: documentQuery,
    response: documentPageSchema,
  },
  'documents/invoice': {
    path: '/api/dashboard/documents/invoices/{id}',
    query: dashboardIdQuery,
    documentDetail: true,
    response: documentDetailSchema,
  },
  'documents/credit-notes': {
    path: '/api/dashboard/documents/credit-notes',
    query: documentQuery,
    response: documentPageSchema,
  },
  'documents/credit-note': {
    path: '/api/dashboard/documents/credit-notes/{id}',
    query: dashboardIdQuery,
    documentDetail: true,
    response: documentDetailSchema,
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
