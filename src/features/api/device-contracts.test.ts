import { describe, expect, it } from 'vitest'
import {
  cancellationDescription,
  cancellationVerified,
  cancelReceiptSchema,
  receiptStateLabel,
  receiptStateSchema,
} from './device-contracts'
import {
  cancellationFixture,
  closedReceipt,
  openReceipt,
  unknownReceipt,
  verifiedCancellation,
} from './__fixtures__/g03-receipt-fixtures'

describe('confirmed G03 receipt response contract', () => {
  it.each([openReceipt, closedReceipt, unknownReceipt])(
    'preserves $state and available device diagnostics',
    (value) => {
      const result = receiptStateSchema.parse(value)
      expect(result).toEqual(value)
      expect(receiptStateLabel(result)).toBe(value.state)
    },
  )
  it('preserves leading zeros and decimal strings without rounding', () => {
    const result = receiptStateSchema.parse(openReceipt)
    expect(result.salesNumber).toBe('00042')
    expect(result.vatSubtotals?.A).toBe('10.00')
    expect(result.vatSubtotals?.B).toBe('0')
  })
  it.each([
    { ...closedReceipt, state: 'unknown' },
    { ...closedReceipt, device: { ...closedReceipt.device, resultCode: 1 } },
    { ...closedReceipt, device: { ...closedReceipt.device, connectivity: 'unavailable' } },
    { ...closedReceipt, error: { code: 'READ_FAILED', message: 'Not verified' } },
    { ...openReceipt, vatSubtotals: { ...openReceipt.vatSubtotals, A: 1 } },
    { ...openReceipt, checkedAt: 'invalid' },
    { status: 'connected', receiptOpen: true },
  ])('rejects malformed or contradictory observations %#', (value) => {
    expect(receiptStateSchema.safeParse(value).success).toBe(false)
  })
  it('never interprets missing data as CLOSED', () => {
    expect(receiptStateLabel(null)).toBe('UNKNOWN')
    expect(receiptStateLabel(undefined)).toBe('UNKNOWN')
  })
})

describe('actual cancellation outcomes', () => {
  it.each([
    'cancelled_and_verified',
    'no_open_receipt',
    'cancellation_rejected',
    'receipt_still_open',
    'verification_required',
    'cancellation_outcome_unknown',
  ] as const)('accepts %s without promoting unverified outcomes', (status) => {
    const result = cancelReceiptSchema.parse(cancellationFixture(status))
    expect(result.status).toBe(status)
    expect(cancellationVerified(result)).toBe(status === 'cancelled_and_verified')
    expect(cancellationDescription(result)).toBeTruthy()
  })
  it.each([
    { success: false },
    { initialReceipt: closedReceipt },
    { cancellationCommand: null },
    { cancellationCommand: { ...verifiedCancellation.cancellationCommand, resultCode: 1 } },
    { verification: null },
    { verification: openReceipt },
    { verification: unknownReceipt },
    { status: 'receipt_still_open' },
  ])('rejects an unverified successful cancellation %#', (override) => {
    expect(cancelReceiptSchema.safeParse({ ...verifiedCancellation, ...override }).success).toBe(
      false,
    )
  })
  it('rejects an already-closed claim for an initially OPEN receipt', () => {
    expect(
      cancelReceiptSchema.safeParse({
        ...cancellationFixture('no_open_receipt'),
        initialReceipt: openReceipt,
      }).success,
    ).toBe(false)
  })
  it('strips unlisted response properties rather than exposing provider internals', () => {
    const parsed = cancelReceiptSchema.parse({
      ...verifiedCancellation,
      authorization: 'private',
      stack: 'internal',
    })
    expect(parsed).not.toHaveProperty('authorization')
    expect(parsed).not.toHaveProperty('stack')
  })
})
