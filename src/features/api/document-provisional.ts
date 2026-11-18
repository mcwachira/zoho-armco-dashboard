import { z } from 'zod'
import { receiptReconciliationSchema } from './reconciliation-contracts.js'

/**
 * Narrow source bindings include user-provided Zoho response samples.
 * Their presence in actual middleware responses remains unverified. Unknown
 * fields are stripped at the BFF; missing/unsupported values stay unavailable.
 * No history DTO, monetary calculation or receipt inference is used here.
 * See docs/DOCUMENT-API-INTEGRATION.md for the confirmation checklist.
 */
const text = z.string().max(10_000).nullish().catch(undefined)
// Provider IDs may be safe JSON integers. Fiscal receipt identifiers stay strings.
const sourceId = z
  .union([
    z.string().max(10_000),
    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).transform(String),
  ])
  .nullish()
  .catch(undefined)
const value = z
  .union([z.string().max(10_000), z.number().finite()])
  .nullish()
  .catch(undefined)
// Retain bounded source text so reconciliation distinguishes invalid from absent.
// Rendering validates hyperlinks separately with safeVerificationUrl.
const verificationUrlText = z.string().max(2048).nullish().catch(undefined)

const tax = z.object({ tax_id: sourceId, tax_name: text, tax_percentage: value, tax_amount: value })
const line = z.object({
  item_id: sourceId,
  sku: text,
  unit: text,
  hs_code: text,
  hs_name: text,
  line_subtotal: value,
  name: text,
  description: text,
  quantity: value,
  rate: value,
  discount: value,
  discount_amount: value,
  tax_id: sourceId,
  tax_name: text,
  tax_percentage: value,
  tax_amount: value,
  item_total: value,
})
const address = z.object({
  attention: text,
  address: text,
  street2: text,
  city: text,
  state: text,
  zip: sourceId,
  country: text,
})
export const provisionalZohoDocumentSchema = z.object({
  invoice_id: sourceId,
  invoice_number: text,
  creditnote_id: sourceId,
  creditnote_number: text,
  customer_id: sourceId,
  customer_name: text,
  created_time: text,
  last_modified_time: text,
  updated_time: text,
  date: text,
  due_date: text,
  currency_code: text,
  status: text,
  total: value,
  balance: value,
  sub_total: value,
  discount_total: value,
  discount: value,
  discount_type: text,
  is_discount_before_tax: z.boolean().nullish().catch(undefined),
  is_inclusive_tax: z.boolean().nullish().catch(undefined),
  tax_total: value,
  adjustment: value,
  reference_number: text,
  notes: text,
  terms: text,
  billing_address: address.nullish().catch(undefined),
  line_items: z.array(line).max(2000).nullish().catch(undefined),
  taxes: z.array(tax).max(100).nullish().catch(undefined),
  invoices: z
    .array(z.object({ invoice_id: sourceId, invoice_number: text, amount: value }))
    .max(2000)
    .nullish()
    .catch(undefined),
})

// These are provisional field names, including the nested attempt projection.
// Presence is never treated as confirmed fiscalization or receipt provenance.
const attempt = z.object({
  attemptNumber: value,
  status: text,
  startedAt: text,
  completedAt: text,
  deviceResult: text,
  errorCode: text,
  errorMessage: text,
  commandSequence: z
    .array(
      z.object({
        command: text,
        arguments: z.record(z.string(), value).optional(),
        response: text,
        errorCode: text,
        errorMessage: text,
      }),
    )
    .max(1000)
    .nullish(),
})
export const provisionalFiscalizationSchema = z.object({
  requestId: text,
  status: text,
  executionStatus: text,
  deviceOutcome: text,
  kraTransmissionStatus: text,
  writebackStatus: text,
  submittedAt: text,
  startedAt: text,
  completedAt: text,
  receiptConfirmed: z.boolean().nullish(),
  requiresManualReview: z.boolean().nullish(),
  cuSerialNumber: text,
  reconciliation: receiptReconciliationSchema.nullish(),
  snapshot: z
    .object({
      capturedAt: text,
      lineItems: z
        .array(
          z.object({
            name: text,
            description: text,
            itemId: text,
            quantity: value,
            unitPrice: value,
            taxClass: text,
            hsCode: text,
            hsName: text,
            exemptionNum: text,
          }),
        )
        .max(2000)
        .nullish(),
    })
    .nullish(),
  commandSequence: z
    .array(
      z.object({
        command: text,
        arguments: z.record(z.string(), value).optional(),
        response: text,
        errorCode: text,
        errorMessage: text,
      }),
    )
    .max(1000)
    .nullish(),
  deviceValues: z
    .object({
      cuSerialNumber: text,
      cuReceiptNumber: text,
      kraQrUrl: text,
      fiscalizedAt: text,
      kraTransmissionResult: text,
    })
    .nullish(),
  writebackValues: z
    .object({
      cuSerialNumber: text,
      cuReceiptNumber: text,
      kraQrUrl: text,
      fiscalizedAt: text,
      result: text,
    })
    .nullish(),
  cuReceiptNumber: text,
  kraQrUrl: verificationUrlText,
  fiscalizedAt: text,
  deviceResult: text,
  errorCode: text,
  errorMessage: text,
  attempts: z.array(attempt).max(1000).nullish().catch(undefined),
})
export const provisionalDocumentRowSchema = provisionalZohoDocumentSchema.extend({
  reconciliation: receiptReconciliationSchema.nullish(),
  fiscalizationRequest: provisionalFiscalizationSchema.nullable().optional(),
})
export type ProvisionalDocument = z.infer<typeof provisionalZohoDocumentSchema>
export type ProvisionalDocumentRow = z.infer<typeof provisionalDocumentRowSchema>
export type ProvisionalFiscalization = z.infer<typeof provisionalFiscalizationSchema>

export function documentNumber(document: ProvisionalDocument, kind: 'invoice' | 'credit_note') {
  return kind === 'invoice' ? document.invoice_number : document.creditnote_number
}
export function zohoId(document: ProvisionalDocument, kind: 'invoice' | 'credit_note') {
  const id = kind === 'invoice' ? document.invoice_id : document.creditnote_id
  return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id) ? id : undefined
}

/** Preserve decimal strings without binary-float rounding or currency guessing. */
export function documentAmount(input: unknown) {
  if (typeof input !== 'string' && typeof input !== 'number') return '—'
  const raw = String(input)
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return '—'
  const [integer, fraction] = raw.split('.')
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction === undefined ? '' : `.${fraction}`}`
}
export function documentDate(input: unknown, time = false) {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(input)) return '—'
  // Zoho source timestamps include compact offsets such as -0800.
  const normalized = time ? input.replace(/([+-]\d{2})(\d{2})$/, '$1:$2') : input
  if (time && !z.string().datetime({ offset: true }).safeParse(normalized).success) return '—'
  const date = new Date(normalized)
  if (!Number.isFinite(date.getTime())) return '—'
  if (!time && date.toISOString().slice(0, 10) !== input.slice(0, 10)) return '—'
  return new Intl.DateTimeFormat('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: time ? 'Africa/Nairobi' : 'UTC',
    ...(time ? ({ hour: '2-digit', minute: '2-digit', timeZoneName: 'short' } as const) : {}),
  }).format(date)
}
