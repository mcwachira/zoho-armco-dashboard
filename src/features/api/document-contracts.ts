import { z } from 'zod'

export type DocumentKind = 'invoice' | 'credit_note'

/** Only the fields and limits explicitly published in the local contract. */
export const documentQuerySchema = z
  .object({
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(200).default(25),
    search: z.string().trim().min(1).optional(),
    status: z.string().trim().min(1).optional(),
    customerId: z.string().trim().min(1).optional(),
    dateFrom: z.string().datetime({ offset: true }).optional(),
    dateTo: z.string().datetime({ offset: true }).optional(),
    sortBy: z.string().trim().min(1).optional(),
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
    if (value !== undefined) search.set(name, String(value))
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

// The contract publishes envelope metadata but omits exact row/detail DTOs.
// Accepting arbitrary records would weaken validation and expose provider data.
// An accidental successful response must therefore fail closed until that
// contract gap is filled. Gateway errors remain visible through getJson.
export const undocumentedDocumentResponseSchema = z.never()
