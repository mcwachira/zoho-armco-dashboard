import { z } from 'zod'

// These fields are enumerated explicitly in docs/dashboard-api-contract.md.
// Status and documentType are strings because that document does not enumerate
// the values returned by this read model.
const timestamp = z.string().datetime({ offset: true })
export const writebackOperationSchema = z
  .object({
    writebackId: z.string().min(1),
    documentType: z.string().min(1),
    documentId: z.string().min(1),
    requestId: z.string().nullable(),
    status: z.string().min(1),
    errorCategory: z.string().nullable(),
    retryCount: z.number().int().nonnegative(),
    providerExchangeCount: z.number().int().nonnegative(),
    nextRetryAt: timestamp.nullable(),
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: timestamp.nullable(),
  })
  .strict()

export const writebackOperationsPageSchema = z
  .object({
    page: z.number().int().positive(),
    pageSize: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    items: z.array(writebackOperationSchema).max(100),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.items.length > value.pageSize || value.items.length > value.total)
      ctx.addIssue({ code: 'custom', message: 'Inconsistent pagination envelope.' })
  })

export type WritebackOperationsPage = z.infer<typeof writebackOperationsPageSchema>
