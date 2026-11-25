import { z } from 'zod'

export const receiptReconciliationStatuses = [
  'MATCH',
  'MISMATCH',
  'MISSING_CU_RECEIPT_NUMBER',
  'MISSING_KRA_URL',
  'INVALID_KRA_URL',
  'MISSING_INVOICE_NO',
  'NOT_AVAILABLE',
] as const
export const receiptReconciliationSchema = z.object({
  status: z.enum(receiptReconciliationStatuses),
  cuReceiptNumber: z.string().nullable(),
  invoiceNo: z.string().nullable(),
  kraUrl: z.string().nullable(),
  reason: z.string(),
})
export type ReceiptReconciliation = z.infer<typeof receiptReconciliationSchema>

/** Compare persisted identifiers as strings; never infer receipt numbers from amounts. */
export function calculateReceiptReconciliation(
  cuReceiptNumber?: string | null,
  kraUrl?: string | null,
): ReceiptReconciliation {
  const cu = typeof cuReceiptNumber === 'string' && cuReceiptNumber.trim() ? cuReceiptNumber : null
  const url = typeof kraUrl === 'string' ? kraUrl.trim() || null : null
  const safeUrl = safeVerificationUrl(url)
  const invoiceNumbers = safeUrl ? new URL(safeUrl).searchParams.getAll('invoiceNo') : []
  const invoiceNo = invoiceNumbers.length === 1 ? invoiceNumbers[0] || null : null
  const result = (
    status: ReceiptReconciliation['status'],
    reason: string,
  ): ReceiptReconciliation => ({ status, cuReceiptNumber: cu, kraUrl: url, invoiceNo, reason })

  if (!cu && !url)
    return result('NOT_AVAILABLE', 'Persisted CU receipt number and KRA URL are unavailable.')
  if (!cu)
    return result('MISSING_CU_RECEIPT_NUMBER', 'The persisted CU receipt number is unavailable.')
  if (!url) return result('MISSING_KRA_URL', 'The persisted KRA verification URL is unavailable.')
  if (!safeUrl)
    return result(
      'INVALID_KRA_URL',
      'The KRA URL must be an absolute, credential-free HTTP(S) URL.',
    )
  if (invoiceNumbers.length > 1)
    return result(
      'INVALID_KRA_URL',
      'The KRA URL has multiple invoiceNo parameters and is ambiguous.',
    )
  if (!invoiceNo?.trim())
    return result('MISSING_INVOICE_NO', 'The KRA URL has no nonempty invoiceNo query parameter.')
  return cu === invoiceNo
    ? result(
        'MATCH',
        'The CU receipt number matches the KRA URL invoiceNo, including leading zeros.',
      )
    : result('MISMATCH', 'The CU receipt number differs from the KRA URL invoiceNo.')
}

type PersistedReceiptPair = {
  cuReceiptNumber?: string | null
  kraQrUrl?: string | null
}

/** Validate middleware reconciliation; fallback uses a single persisted source pair. */
export function resolveReceiptReconciliation(value: {
  reconciliation?: ReceiptReconciliation | null
  fiscalizationRequest?:
    | (PersistedReceiptPair & {
        reconciliation?: ReceiptReconciliation | null
        deviceValues?: PersistedReceiptPair | null
        writebackValues?: PersistedReceiptPair | null
      })
    | null
}): ReceiptReconciliation {
  const fiscal = value.fiscalizationRequest
  const supplied = value.reconciliation ?? fiscal?.reconciliation
  const suppliedHasEvidence = Boolean(supplied?.cuReceiptNumber?.trim() || supplied?.kraUrl?.trim())
  if (supplied && suppliedHasEvidence) {
    const calculated = calculateReceiptReconciliation(supplied.cuReceiptNumber, supplied.kraUrl)
    if (
      supplied.status === calculated.status &&
      supplied.cuReceiptNumber === calculated.cuReceiptNumber &&
      supplied.invoiceNo === calculated.invoiceNo &&
      supplied.kraUrl === calculated.kraUrl
    )
      return supplied
    return {
      ...calculated,
      reason: `Supplied reconciliation evidence recalculated from its CU receipt number and KRA URL: ${calculated.reason}`,
    }
  }
  // Fiscalization's device response is the primary receipt evidence. The list
  // serializer may also include an older reconciliation projection whose
  // receipt fields are empty even though deviceValues contains the returned
  // CU/KRA values. Keep the pair together so values from different sources are
  // never combined.
  const device = fiscal?.deviceValues
  if (device && (device.cuReceiptNumber?.trim() || device.kraQrUrl?.trim())) {
    const result = calculateReceiptReconciliation(device.cuReceiptNumber, device.kraQrUrl)
    return {
      ...result,
      reason: `Persisted fiscalization device values: ${result.reason}`,
    }
  }
  if (supplied) {
    const calculated = calculateReceiptReconciliation(supplied.cuReceiptNumber, supplied.kraUrl)
    if (
      supplied.status === calculated.status &&
      supplied.cuReceiptNumber === calculated.cuReceiptNumber &&
      supplied.invoiceNo === calculated.invoiceNo &&
      supplied.kraUrl === calculated.kraUrl
    )
      return supplied
    return {
      ...calculated,
      reason: `Supplied reconciliation evidence recalculated from its CU receipt number and KRA URL: ${calculated.reason}`,
    }
  }
  const writeback = fiscal?.writebackValues
  // Never combine a writeback receipt with a different source's verification URL.
  const pair =
    writeback && (writeback.cuReceiptNumber?.trim() || writeback.kraQrUrl?.trim())
      ? writeback
      : fiscal
  const result = calculateReceiptReconciliation(pair?.cuReceiptNumber, pair?.kraQrUrl)
  if (result.status === 'NOT_AVAILABLE') return result
  return {
    ...result,
    reason: `${pair === writeback ? 'Persisted Zoho writeback values' : 'Persisted fiscalization summary'}: ${result.reason}`,
  }
}

export function safeVerificationUrl(value: string | null | undefined) {
  if (!value) return null
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}
