import { z } from 'zod'

export const g03ReceiptIntegration = {
  monitoringAvailable: true,
  cancellationAvailable: true,
  reason: null,
} as const

const text = z.string().max(20_000)
const code = z.union([z.number().int(), z.string().max(128)]).nullish()
const deviceError = z.object({ code: z.string().max(128), message: text })
const amount = z
  .string()
  .regex(/^-?\d+(?:\.\d+)?$/)
  .max(128)

export const receiptStateSchema = z
  .object({
    state: z.enum(['OPEN', 'CLOSED', 'UNKNOWN']),
    salesNumber: text.nullable(),
    vatSubtotals: z.object({ A: amount, B: amount, C: amount, D: amount, E: amount }).nullable(),
    checkedAt: z.string().datetime({ offset: true }),
    device: z.object({
      connectivity: z.enum(['connected', 'unavailable', 'unknown']),
      httpStatus: z.number().int().nullish(),
      resultCode: z.number().int().nullish(),
    }),
    error: deviceError.nullable(),
  })
  .superRefine((state, context) => {
    if (
      state.state !== 'UNKNOWN' &&
      (state.device.connectivity !== 'connected' ||
        state.error !== null ||
        (state.device.httpStatus != null && state.device.httpStatus !== 200) ||
        (state.device.resultCode != null && state.device.resultCode !== 0))
    )
      context.addIssue({
        code: 'custom',
        message: 'A known receipt state requires a successful device observation.',
      })
  })

export type ReceiptState = z.infer<typeof receiptStateSchema>

export function receiptStateLabel(
  state: ReceiptState | null | undefined,
): 'OPEN' | 'CLOSED' | 'UNKNOWN' {
  if (!state || state.error || state.device?.connectivity !== 'connected') return 'UNKNOWN'
  return state.state
}

const cancellationCommandSchema = z.object({
  status: z.string().min(1).max(128),
  httpStatus: z.number().int().nullish(),
  resultCode: z.number().int().nullish(),
  ste1: code,
  ste2: code,
  fpLibErrorCode: code,
  error: deviceError.nullable(),
})

const cancellationBaseSchema = z.object({
  success: z.boolean(),
  status: z.enum([
    'no_open_receipt',
    'cancelled_and_verified',
    'cancellation_rejected',
    'receipt_still_open',
    'verification_required',
    'cancellation_outcome_unknown',
  ]),
  requestedAt: z.string().datetime({ offset: true }),
  initialReceipt: receiptStateSchema,
  cancellationCommand: cancellationCommandSchema.nullable(),
  verification: receiptStateSchema.nullable(),
})

type Cancellation = z.infer<typeof cancellationBaseSchema>

export function cancellationVerified(result: Cancellation) {
  return (
    result.success &&
    result.status === 'cancelled_and_verified' &&
    receiptStateLabel(result.initialReceipt) === 'OPEN' &&
    result.cancellationCommand?.status === 'acknowledged' &&
    result.cancellationCommand.resultCode === 0 &&
    result.cancellationCommand.error === null &&
    receiptStateLabel(result.verification) === 'CLOSED'
  )
}

export const cancelReceiptSchema = cancellationBaseSchema.superRefine((result, context) => {
  if (result.status === 'cancelled_and_verified' && !cancellationVerified(result))
    context.addIssue({
      code: 'custom',
      message: 'Cancellation requires acknowledgement and independently verified CLOSED state.',
    })
  if (
    result.status === 'no_open_receipt' &&
    (!result.success ||
      receiptStateLabel(result.initialReceipt) !== 'CLOSED' ||
      result.cancellationCommand?.status === 'acknowledged')
  )
    context.addIssue({
      code: 'custom',
      message:
        'Already-closed results require an initial CLOSED observation and no acknowledged cancellation.',
    })
  if (result.success && !['cancelled_and_verified', 'no_open_receipt'].includes(result.status))
    context.addIssue({
      code: 'custom',
      message: 'An unconfirmed cancellation cannot claim success.',
    })
})

export type CancelReceiptResult = z.infer<typeof cancelReceiptSchema>

export function cancellationDescription(result: Cancellation) {
  switch (result.status) {
    case 'cancelled_and_verified':
      return 'Open receipt cancelled and independently verified CLOSED.'
    case 'no_open_receipt':
      return 'The receipt was already CLOSED. No cancellation command was sent.'
    case 'cancellation_rejected':
      return 'The device rejected cancellation. Closure is not confirmed.'
    case 'receipt_still_open':
      return 'The verification read reports OPEN. Cancellation did not close the receipt.'
    case 'verification_required':
      return 'The receipt state could not be verified. Inspect the device diagnostics.'
    case 'cancellation_outcome_unknown':
      return 'The cancellation outcome is unknown. Read the device state before taking further action.'
  }
}
