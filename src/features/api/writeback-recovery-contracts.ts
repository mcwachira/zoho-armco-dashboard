import { z } from 'zod'
import { dashboardWritebackOperationStatusSchema } from './schemas.js'

const timestamp = z.string().datetime({ offset: true })
const message = z.string().max(4_000)
const lastErrorSchema = z
  .object({
    code: z.string().max(128).optional(),
    category: z.string().max(128).optional(),
    message,
  })
  .nullable()

/** Allowlisted, request-scoped writeback result fields returned by the gateway. */
export const writebackRecoverySchema = z.object({
  status: dashboardWritebackOperationStatusSchema,
  requestId: z.string().min(1).max(128),
  invoiceId: z.string().nullable().optional(),
  creditNoteId: z.string().nullable().optional(),
  zohoDocumentId: z.string().nullable().optional(),
  correlationId: z.string().max(128).nullable().optional(),
  fieldsWritten: z.array(z.string().max(256)).optional(),
  updatedFields: z.array(z.string().max(256)).optional(),
  writtenCustomFieldIds: z.array(z.string().max(256)).optional(),
  remainingFields: z.array(z.string().max(256)).optional(),
  retryCount: z.number().int().nonnegative().optional(),
  lastAttemptAt: timestamp.nullable().optional(),
  nextRetryAt: timestamp.nullable().optional(),
  errorCategory: z.string().max(128).nullable().optional(),
  lastError: z.union([message, lastErrorSchema]).optional(),
  manualInterventionRequired: z.boolean().optional(),
  manualAttentionRequired: z.boolean().optional(),
})

export type WritebackRecovery = z.infer<typeof writebackRecoverySchema>
