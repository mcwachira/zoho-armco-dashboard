import type { CancelReceiptResult, ReceiptState } from '../device-contracts'

export const openReceipt: ReceiptState = {
  state: 'OPEN',
  salesNumber: '00042',
  vatSubtotals: { A: '10.00', B: '0', C: '0', D: '0', E: '0' },
  checkedAt: '2026-11-17T03:00:00.000Z',
  device: { connectivity: 'connected', httpStatus: 200, resultCode: 0 },
  error: null,
}
export const closedReceipt: ReceiptState = { ...openReceipt, state: 'CLOSED', salesNumber: '00043' }
export const unknownReceipt: ReceiptState = {
  state: 'UNKNOWN',
  salesNumber: null,
  vatSubtotals: null,
  checkedAt: openReceipt.checkedAt,
  device: { connectivity: 'unavailable', httpStatus: null, resultCode: null },
  error: { code: 'READ_TIMEOUT', message: 'The current receipt could not be verified.' },
}
export const verifiedCancellation: CancelReceiptResult = {
  success: true,
  status: 'cancelled_and_verified',
  requestedAt: openReceipt.checkedAt,
  initialReceipt: openReceipt,
  cancellationCommand: {
    status: 'acknowledged',
    httpStatus: 200,
    resultCode: 0,
    ste1: null,
    ste2: null,
    fpLibErrorCode: null,
    error: null,
  },
  verification: closedReceipt,
}
export function cancellationFixture(status: CancelReceiptResult['status']): CancelReceiptResult {
  if (status === 'cancelled_and_verified') return structuredClone(verifiedCancellation)
  if (status === 'no_open_receipt')
    return {
      ...verifiedCancellation,
      status,
      initialReceipt: closedReceipt,
      cancellationCommand: null,
      verification: null,
    }
  return {
    ...structuredClone(verifiedCancellation),
    success: false,
    status,
    initialReceipt: status === 'verification_required' ? unknownReceipt : openReceipt,
    cancellationCommand:
      status === 'verification_required'
        ? null
        : status === 'cancellation_rejected'
          ? {
              status: 'rejected',
              httpStatus: 200,
              resultCode: 1,
              ste1: 4,
              ste2: null,
              fpLibErrorCode: null,
              error: {
                code: 'COMMAND_REJECTED',
                message: 'The device rejected the cancellation command.',
              },
            }
          : status === 'cancellation_outcome_unknown'
            ? {
                status: 'unknown',
                httpStatus: null,
                resultCode: null,
                ste1: null,
                ste2: null,
                fpLibErrorCode: null,
                error: {
                  code: 'COMMAND_TIMEOUT',
                  message: 'The command outcome could not be verified.',
                },
              }
            : verifiedCancellation.cancellationCommand,
    verification: status === 'receipt_still_open' ? openReceipt : unknownReceipt,
  }
}
