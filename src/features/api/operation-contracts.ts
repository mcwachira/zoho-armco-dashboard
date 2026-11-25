import { z } from 'zod'

// These fields are enumerated explicitly in docs/dashboard-api-contract.md.
// Status and documentType are strings because that document does not enumerate
// the values returned by this read model.
const timestamp = z.string().datetime({ offset: true })
const eventMetadataValueSchema: z.ZodType<
  string | number | boolean | null | eventMetadataValue[] | { [key: string]: eventMetadataValue }
> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(eventMetadataValueSchema),
    z.record(z.string(), eventMetadataValueSchema),
  ]),
)

/** Read-only derived event DTO. Metadata is an allowlisted JSON projection. */
export const dashboardEventSchema = z
  .object({
    eventId: z.string().min(1),
    eventType: z.string().min(1),
    timestamp,
    documentType: z.string().nullable(),
    documentId: z.string().nullable(),
    requestId: z.string().nullable(),
    message: z.string(),
    metadata: z.record(z.string(), eventMetadataValueSchema),
  })
  .strict()

type eventMetadataValue =
  string | number | boolean | null | eventMetadataValue[] | { [key: string]: eventMetadataValue }

export const dashboardEventsPageSchema = z
  .object({
    page: z.number().int().positive(),
    pageSize: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    items: z.array(dashboardEventSchema).max(100),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.items.length > value.pageSize || value.items.length > value.total)
      ctx.addIssue({ code: 'custom', message: 'Inconsistent pagination envelope.' })
  })
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
    metrics: z
      .record(z.string(), z.union([z.string(), z.number().finite(), z.boolean(), z.null()]))
      .nullable()
      .optional(),
    errorDetails: z.string().nullable().optional(),
    fieldsWritten: z.array(z.string().max(256)).nullable().optional(),
    fieldsRemaining: z.array(z.string().max(256)).nullable().optional(),
    manualInterventionRequired: z.boolean().nullable().optional(),
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

export type WritebackOperation = z.infer<typeof writebackOperationSchema>
export type WritebackOperationsPage = z.infer<typeof writebackOperationsPageSchema>
