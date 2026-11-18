import { z } from 'zod'
import {
  receiptReconciliationSchema,
  receiptReconciliationStatuses,
} from './reconciliation-contracts.js'
import {
  provisionalDocumentRowSchema,
  provisionalFiscalizationSchema,
  provisionalZohoDocumentSchema,
} from './document-provisional.js'

export type DocumentKind = 'invoice' | 'credit_note'

/** Only the fields and limits explicitly published in the local contract. */
export const documentQuerySchema = z
  .object({
    page: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1),
    pageSize: z.number().int().min(1).max(200).default(25),
    search: z.string().trim().min(1).max(128).optional(),
    status: z.string().trim().min(1).max(128).optional(),
    reconciliationStatus: z.enum(receiptReconciliationStatuses).optional(),
    customerId: z.string().trim().min(1).max(128).optional(),
    dateFrom: z.string().datetime({ offset: true }).optional(),
    dateTo: z.string().datetime({ offset: true }).optional(),
    sortBy: z.string().trim().min(1).max(128).optional(),
    sortOrder: z.enum(['A', 'D']).optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.dateFrom || !value.dateTo || Date.parse(value.dateFrom) <= Date.parse(value.dateTo),
    {
      message: 'The start date must be before the end date.',
      path: ['dateTo'],
    },
  )

export type DocumentQuery = z.input<typeof documentQuerySchema>

export function documentListPath(kind: DocumentKind, params: DocumentQuery = {}) {
  const values = documentQuerySchema.parse(params)
  const search = new URLSearchParams()
  for (const [name, value] of Object.entries(values)) {
    // Reconciliation is a current-page dashboard filter, not a verified remote query.
    if (value !== undefined && name !== 'reconciliationStatus') search.set(name, String(value))
  }
  return `/api/dashboard/documents/${kind === 'invoice' ? 'invoices' : 'credit-notes'}?${search}`
}

export function documentDetailPath(kind: DocumentKind, id: string) {
  if (!id.trim()) throw new Error('A Zoho document ID is required.')
  return `/api/dashboard/documents/${kind === 'invoice' ? 'invoice' : 'credit-note'}?${new URLSearchParams({ id: id.trim() })}`
}

/** A reliable count cannot be derived from any individual live register page. */
export function documentPagination(metadata: {
  page: number
  pageSize: number
  total: null
  hasMore: boolean
}) {
  return {
    previousPage: metadata.page > 1 ? metadata.page - 1 : null,
    nextPage: metadata.hasMore ? metadata.page + 1 : null,
    totalLabel: 'Total unavailable from Zoho Books',
  }
}

// Confirmed envelopes; nested optional projections are explicitly provisional.
export const documentPageSchema = z.object({
  page: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  pageSize: z.number().int().min(1).max(200),
  total: z.number().int().nonnegative().nullable(),
  hasMore: z.boolean(),
  items: z.array(provisionalDocumentRowSchema).max(200),
})
export const documentDetailSchema = z.object({
  documentType: z.string().min(1),
  zohoDocumentId: z.string().min(1),
  document: provisionalZohoDocumentSchema,
  fiscalizationRequest: provisionalFiscalizationSchema.nullable(),
  reconciliation: receiptReconciliationSchema.nullish(),
})
export type DocumentPage = z.infer<typeof documentPageSchema>
export type DocumentDetail = z.infer<typeof documentDetailSchema>
