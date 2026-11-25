import { describe, expect, it } from 'vitest'
import { documentListPath } from './document-contracts'
import { provisionalFiscalizationSchema } from './document-provisional'
import {
  calculateReceiptReconciliation,
  resolveReceiptReconciliation,
  safeVerificationUrl,
} from './reconciliation-contracts'

const receipt = '0110162170000105405'
const url = `https://itax.kra.go.ke/KRA-Portal/invoiceChk.htm?actionCode=loadPage&invoiceNo=${receipt}`

describe('CU/KRA receipt reconciliation', () => {
  it('preserves leading zeros and never rounds long receipt identifiers', () => {
    expect(calculateReceiptReconciliation(receipt, url)).toMatchObject({
      status: 'MATCH',
      cuReceiptNumber: receipt,
      invoiceNo: receipt,
      kraUrl: url,
    })
    expect(calculateReceiptReconciliation(receipt.slice(1), url).status).toBe('MISMATCH')
    expect(
      calculateReceiptReconciliation(
        '90071992547409931234',
        'https://example.test/?invoiceNo=90071992547409931235',
      ).status,
    ).toBe('MISMATCH')
  })

  it.each([` ${receipt}`, `${receipt} `, ` ${receipt} `])(
    'preserves nonblank receipt whitespace for exact comparison: %j',
    (cuReceiptNumber) => {
      expect(calculateReceiptReconciliation(cuReceiptNumber, url)).toMatchObject({
        status: 'MISMATCH',
        cuReceiptNumber,
        invoiceNo: receipt,
      })
      expect(
        calculateReceiptReconciliation(
          cuReceiptNumber,
          `https://example.test/?invoiceNo=${encodeURIComponent(cuReceiptNumber)}`,
        ),
      ).toMatchObject({ status: 'MATCH', cuReceiptNumber, invoiceNo: cuReceiptNumber })
    },
  )

  it.each([
    [undefined, undefined, 'NOT_AVAILABLE'],
    ['', '  ', 'NOT_AVAILABLE'],
    ['  ', url, 'MISSING_CU_RECEIPT_NUMBER'],
    [null, url, 'MISSING_CU_RECEIPT_NUMBER'],
    [receipt, null, 'MISSING_KRA_URL'],
    [receipt, 'not a URL', 'INVALID_KRA_URL'],
    [receipt, '/relative?invoiceNo=123', 'INVALID_KRA_URL'],
    [receipt, 'javascript:alert(1)', 'INVALID_KRA_URL'],
    [receipt, 'https://user:password@example.test/?invoiceNo=123', 'INVALID_KRA_URL'],
    [receipt, 'https://example.test/', 'MISSING_INVOICE_NO'],
    [receipt, 'https://example.test/?invoiceNo=', 'MISSING_INVOICE_NO'],
    [receipt, 'https://example.test/?invoiceNo=%20', 'MISSING_INVOICE_NO'],
    [receipt, 'https://example.test/?invoiceNo=other', 'MISMATCH'],
  ])('classifies %s with %s as %s', (cu, kraUrl, status) => {
    const result = calculateReceiptReconciliation(cu, kraUrl)
    expect(result.status).toBe(status)
    expect(result.reason).toBeTruthy()
  })

  it('uses URL query parsing rather than fragments, path text or partial parameter names', () => {
    expect(
      calculateReceiptReconciliation(
        receipt,
        `https://example.test/?invoiceNo=%30${receipt.slice(1)}`,
      ).status,
    ).toBe('MATCH')
    expect(
      calculateReceiptReconciliation(receipt, `https://example.test/#invoiceNo=${receipt}`).status,
    ).toBe('MISSING_INVOICE_NO')
    expect(
      calculateReceiptReconciliation(receipt, `https://example.test/?otherinvoiceNo=${receipt}`)
        .status,
    ).toBe('MISSING_INVOICE_NO')
  })

  it('rejects duplicate invoiceNo parameters even when their values match', () => {
    for (const duplicate of [receipt, 'different']) {
      expect(
        calculateReceiptReconciliation(receipt, `${url}&invoiceNo=${duplicate}`),
      ).toMatchObject({
        status: 'INVALID_KRA_URL',
        invoiceNo: null,
      })
    }
  })

  it('extracts the URL invoice number even when the CU number is missing', () => {
    expect(calculateReceiptReconciliation(null, url)).toMatchObject({
      status: 'MISSING_CU_RECEIPT_NUMBER',
      invoiceNo: receipt,
    })
  })
})

describe('persisted reconciliation source resolution', () => {
  const fiscal = { cuReceiptNumber: receipt, kraQrUrl: url }

  it('reuses middleware results before considering dashboard fallback', () => {
    const supplied = { ...calculateReceiptReconciliation(receipt, url), reason: 'Server evidence' }
    expect(
      resolveReceiptReconciliation({ reconciliation: supplied, fiscalizationRequest: {} }),
    ).toBe(supplied)
    expect(
      resolveReceiptReconciliation({
        fiscalizationRequest: { ...fiscal, reconciliation: supplied },
      }),
    ).toBe(supplied)
  })

  it('preserves populated server reconciliation before using device-value fallback', () => {
    const supplied = {
      ...calculateReceiptReconciliation(receipt, url),
      reason: 'Persisted server reconciliation',
    }
    expect(
      resolveReceiptReconciliation({
        reconciliation: supplied,
        fiscalizationRequest: {
          deviceValues: { cuReceiptNumber: 'different', kraQrUrl: url },
        },
      }),
    ).toBe(supplied)
  })

  it.each([
    {
      status: 'MATCH' as const,
      cuReceiptNumber: receipt.slice(1),
      invoiceNo: receipt,
      kraUrl: url,
      expectedStatus: 'MISMATCH',
      expectedInvoiceNo: receipt,
    },
    {
      status: 'MISMATCH' as const,
      cuReceiptNumber: receipt,
      invoiceNo: receipt,
      kraUrl: url,
      expectedStatus: 'MATCH',
      expectedInvoiceNo: receipt,
    },
    {
      status: 'MATCH' as const,
      cuReceiptNumber: receipt,
      invoiceNo: 'spoofed-invoice-number',
      kraUrl: url,
      expectedStatus: 'MATCH',
      expectedInvoiceNo: receipt,
    },
    {
      status: 'MATCH' as const,
      cuReceiptNumber: receipt,
      invoiceNo: receipt,
      kraUrl: 'not a URL',
      expectedStatus: 'INVALID_KRA_URL',
      expectedInvoiceNo: null,
    },
    {
      status: 'MATCH' as const,
      cuReceiptNumber: receipt,
      invoiceNo: receipt,
      kraUrl: 'https://example.test/',
      expectedStatus: 'MISSING_INVOICE_NO',
      expectedInvoiceNo: null,
    },
    {
      status: 'MATCH' as const,
      cuReceiptNumber: ` ${receipt} `,
      invoiceNo: receipt,
      kraUrl: url,
      expectedStatus: 'MISMATCH',
      expectedInvoiceNo: receipt,
    },
  ])('recalculates inconsistent supplied evidence: %j', (scenario) => {
    const { expectedStatus, expectedInvoiceNo, ...evidence } = scenario
    const supplied = { ...evidence, reason: 'Misleading supplied reason' }
    for (const input of [
      { reconciliation: supplied, fiscalizationRequest: fiscal },
      { fiscalizationRequest: { ...fiscal, reconciliation: supplied } },
    ]) {
      const result = resolveReceiptReconciliation(input)
      expect(result).toMatchObject({
        status: expectedStatus,
        invoiceNo: expectedInvoiceNo,
        cuReceiptNumber: supplied.cuReceiptNumber,
        kraUrl: supplied.kraUrl,
      })
      expect(result.reason).toContain('Supplied reconciliation evidence recalculated')
      expect(result.reason).not.toContain(supplied.reason)
    }
  })

  it('does not fill missing supplied evidence from other persisted sources', () => {
    const supplied = {
      status: 'MATCH' as const,
      cuReceiptNumber: receipt,
      invoiceNo: receipt,
      kraUrl: null,
      reason: 'Unverified supplied match',
    }
    expect(
      resolveReceiptReconciliation({
        reconciliation: supplied,
        fiscalizationRequest: { ...fiscal, writebackValues: fiscal },
      }),
    ).toMatchObject({
      status: 'MISSING_KRA_URL',
      cuReceiptNumber: receipt,
      kraUrl: null,
      invoiceNo: null,
    })
  })

  it('uses persisted writeback values before generic fiscal values', () => {
    const writeback = resolveReceiptReconciliation({
      fiscalizationRequest: {
        ...fiscal,
        writebackValues: { cuReceiptNumber: 'different', kraQrUrl: url },
      },
    })
    expect(writeback.status).toBe('MISMATCH')
    expect(writeback.reason).toContain('Persisted Zoho writeback values')
    const summary = resolveReceiptReconciliation({ fiscalizationRequest: fiscal })
    expect(summary.status).toBe('MATCH')
    expect(summary.reason).toContain('Persisted fiscalization summary')
  })

  it('never fills missing writeback evidence from another provenance', () => {
    expect(
      resolveReceiptReconciliation({
        fiscalizationRequest: {
          ...fiscal,
          writebackValues: { cuReceiptNumber: receipt },
        },
      }).status,
    ).toBe('MISSING_KRA_URL')
    expect(
      resolveReceiptReconciliation({
        fiscalizationRequest: {
          ...fiscal,
          writebackValues: { kraQrUrl: url },
        },
      }).status,
    ).toBe('MISSING_CU_RECEIPT_NUMBER')
  })

  it('handles empty optional projections and rejects numeric receipt coercion', () => {
    expect(resolveReceiptReconciliation({}).status).toBe('NOT_AVAILABLE')
    expect(resolveReceiptReconciliation({ fiscalizationRequest: null }).status).toBe(
      'NOT_AVAILABLE',
    )
    expect(
      resolveReceiptReconciliation({
        fiscalizationRequest: {
          ...fiscal,
          writebackValues: { cuReceiptNumber: '', kraQrUrl: null },
        },
      }).status,
    ).toBe('MATCH')
    const parsed = provisionalFiscalizationSchema.parse({ cuReceiptNumber: 123, kraQrUrl: url })
    expect(resolveReceiptReconciliation({ fiscalizationRequest: parsed }).status).toBe(
      'MISSING_CU_RECEIPT_NUMBER',
    )
  })

  it('retains invalid URL evidence as inert text while denying a hyperlink', () => {
    const parsed = provisionalFiscalizationSchema.parse({
      cuReceiptNumber: receipt,
      kraQrUrl: 'javascript:alert(1)',
    })
    expect(resolveReceiptReconciliation({ fiscalizationRequest: parsed }).status).toBe(
      'INVALID_KRA_URL',
    )
    expect(parsed.kraQrUrl).toBe('javascript:alert(1)')
    expect(safeVerificationUrl(parsed.kraQrUrl)).toBeNull()
    expect(safeVerificationUrl('https://user:password@example.test/')).toBeNull()
    expect(safeVerificationUrl(url)).toBe(url)
  })

  it('keeps the reconciliation filter out of upstream document requests', () => {
    expect(documentListPath('invoice', { reconciliationStatus: 'MISMATCH', search: 'INV' })).toBe(
      '/api/dashboard/documents/invoices?page=1&pageSize=25&search=INV',
    )
    expect(documentListPath('credit_note', { reconciliationStatus: 'MISSING_KRA_URL' })).toBe(
      '/api/dashboard/documents/credit-notes?page=1&pageSize=25',
    )
  })
})
