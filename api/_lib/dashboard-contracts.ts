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
  dashboardOverviewQueryParamsSchema,
  dashboardOverviewSchema,
  dashboardServiceHealthSchema,
} from '../../src/features/api/schemas.js'
import { writebackOperationsPageSchema } from '../../src/features/api/operation-contracts.js'

// The local middleware contract owns paths and queries. Existing verified DTOs
// are reused; missing DTO definitions deliberately do not become permissive JSON.
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
  path: string
  query: z.ZodType
  response?: z.ZodType
  detail?: 'invoice' | 'credit-note'
  unavailable?: string
  unavailableCode?: string
}

const missingDocumentDto =
  'The middleware contract documents this Zoho register/detail endpoint but does not specify its JSON field names and response DTO. No document data can be safely validated until that contract is supplied.'
const missingOperationDto =
  'The middleware contract documents this endpoint but does not specify its record response DTO. No operational records can be safely validated until that contract is supplied.'

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
    path: '/api/dashboard/invoices/{id}',
    query: dashboardIdQuery,
    response: dashboardInvoiceDetailSchema,
    detail: 'invoice',
  },
  'credit-note': {
    path: '/api/dashboard/credit-notes/{id}',
    query: dashboardIdQuery,
    response: dashboardCreditNoteDetailSchema,
    detail: 'credit-note',
  },
  requests: {
    path: '/api/dashboard/invoices',
    query: dashboardInvoiceQueryParamsSchema,
    response: dashboardInvoicePageSchema,
  },
  request: {
    path: '/api/dashboard/invoices/{id}',
    query: dashboardIdQuery,
    response: dashboardInvoiceDetailSchema,
    detail: 'invoice',
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
    path: '/api/dashboard/device',
    query: noQuery,
    response: dashboardDeviceDiagnosticsSchema,
  },
  capabilities: {
    path: '/api/dashboard/capabilities',
    query: noQuery,
    response: dashboardCapabilitiesSchema,
  },
  writebacks: {
    path: '/api/dashboard/writebacks',
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
    path: '/api/dashboard/manual-review',
    query: z
      .object({ ...page, ...dates, status: z.enum(['open', 'resolved']).optional() })
      .strict()
      .superRefine(orderedDates),
    unavailable: missingOperationDto,
  },
  'manual-review-case': {
    path: '/api/dashboard/manual-review/{id}',
    query: dashboardIdQuery,
    unavailable: missingOperationDto,
  },
  reconciliation: {
    path: '/api/dashboard/reconciliation',
    query: listQuery,
    unavailable: missingOperationDto,
  },
  events: {
    path: '/api/dashboard/events',
    query: z
      .object({ ...page, ...documentType, ...dates })
      .strict()
      .superRefine(orderedDates),
    unavailable: missingOperationDto,
  },
  operations: {
    path: '/api/dashboard/operations',
    query: z.object({ ...page, ...documentType }).strict(),
    unavailable: missingOperationDto,
  },
  'documents/invoices': {
    path: '/api/dashboard/documents/invoices',
    query: documentQuery,
    unavailable: missingDocumentDto,
  },
  'documents/invoice': {
    path: '/api/dashboard/documents/invoices/{id}',
    query: dashboardIdQuery,
    unavailable: missingDocumentDto,
  },
  'documents/credit-notes': {
    path: '/api/dashboard/documents/credit-notes',
    query: documentQuery,
    unavailable: missingDocumentDto,
  },
  'documents/credit-note': {
    path: '/api/dashboard/documents/credit-notes/{id}',
    query: dashboardIdQuery,
    unavailable: missingDocumentDto,
  },
  health: {
    path: '',
    query: z.object({ check: z.enum(['live', 'ready']) }).strict(),
    unavailableCode: 'CONTRACT_ROUTE_UNAVAILABLE',
    unavailable:
      'The middleware dashboard contract does not authorize service-bearer access to health probes. Use the documented services endpoint.',
  },
  telemetry: {
    path: '',
    query: noQuery,
    unavailableCode: 'CONTRACT_ROUTE_UNAVAILABLE',
    unavailable:
      'The middleware dashboard contract does not authorize service-bearer access to integration metrics. Use the observability snapshot in services.',
  },
  writeback: {
    path: '',
    query: dashboardIdQuery,
    unavailableCode: 'CONTRACT_ROUTE_UNAVAILABLE',
    unavailable:
      'The middleware contract exposes writeback mutation routes and persisted request writeback details, but no independent GET writeback-detail endpoint.',
  },
}

export const fiscalizeBodySchema = z
  .object({
    org_id: text,
    document_type: z.enum(['INVOICE', 'CREDIT_NOTE']),
    document_id: text,
    source: z.literal('ZOHO_BOOKS_BUTTON'),
  })
  .strict()
export const emptyBodySchema = z.object({}).strict()

export const dashboardActionRoutes = {
  'actions/fiscalize': {
    path: '/api/dashboard/actions/fiscalize',
    query: noQuery,
    body: fiscalizeBodySchema,
  },
  'actions/invoice-writeback': {
    path: '/api/dashboard/actions/invoices/{id}/writeback',
    query: dashboardIdQuery,
    body: emptyBodySchema,
  },
  'actions/credit-note-writeback': {
    path: '/api/dashboard/actions/credit-notes/{id}/writeback',
    query: dashboardIdQuery,
    body: emptyBodySchema,
  },
} as const
