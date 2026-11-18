import { describe, expect, it } from 'vitest'
import { documentDetailSchema, documentPageSchema } from './document-contracts'
import {
  zohoCreditNoteDetailSample,
  zohoCreditNoteListSample,
  zohoInvoiceDetailSample,
  zohoInvoiceListSample,
} from './__fixtures__/zoho-response-samples'
import {
  documentAmount,
  documentDate,
  documentNumber,
  provisionalFiscalizationSchema,
  provisionalZohoDocumentSchema,
  zohoId,
} from './document-provisional'

// Independent synthetic examples of the existing provisional projection.
// These are not captured middleware DTOs and do not establish live compatibility.
const syntheticDocuments = [
  {
    kind: 'invoice' as const,
    id: '000-invoice-42',
    number: 'INV-00042',
    document: {
      invoice_id: '000-invoice-42',
      invoice_number: 'INV-00042',
      customer_name: 'Synthetic invoice customer',
      status: 'partially_paid',
      currency_code: 'KES',
      total: '9007199254740993.123400',
      balance: '10.0000',
      line_items: [
        {
          name: 'Synthetic invoice line',
          quantity: '2.5000',
          rate: '40.0000',
          discount: '5%',
          discount_amount: '5.0000',
          tax_name: 'Synthetic invoice VAT',
          tax_percentage: '16.0000',
          tax_amount: '15.2000',
          item_total: '110.2000',
          privateLineField: 'withheld',
        },
      ],
      taxes: [
        {
          tax_name: 'Synthetic invoice VAT',
          tax_percentage: '16.0000',
          tax_amount: '15.2000',
          privateTaxField: 'withheld',
        },
      ],
      privateDocumentField: 'withheld',
    },
  },
  {
    kind: 'credit_note' as const,
    id: '000-credit-17',
    number: 'CN-00017',
    document: {
      creditnote_id: '000-credit-17',
      creditnote_number: 'CN-00017',
      invoice_id: '000-original-invoice',
      invoice_number: 'INV-00009',
      customer_name: 'Synthetic credit customer',
      status: 'open',
      currency_code: 'KES',
      sub_total: '25.0000',
      discount_total: '1.0000',
      tax_total: '3.8400',
      total: '27.8400',
      line_items: [
        {
          name: 'Synthetic credit line',
          quantity: '0.5000',
          rate: '50.0000',
          discount_amount: '1.0000',
          tax_name: 'Synthetic credit VAT',
          tax_percentage: '16.0000',
          tax_amount: '3.8400',
          item_total: '27.8400',
          privateLineField: 'withheld',
        },
      ],
      taxes: [
        {
          tax_name: 'Synthetic credit VAT',
          tax_percentage: '16.0000',
          tax_amount: '3.8400',
          privateTaxField: 'withheld',
        },
      ],
      privateDocumentField: 'withheld',
    },
  },
]

describe('synthetic provisional document projection, not verified middleware DTO mapping', () => {
  it.each(syntheticDocuments)(
    'preserves $kind identity, decimal precision and provided tax evidence in lists and details',
    ({ kind, id, number, document }) => {
      const page = documentPageSchema.parse({
        page: 1,
        pageSize: 25,
        total: null,
        hasMore: false,
        items: [{ ...document, fiscalizationRequest: null }],
      })
      const detail = documentDetailSchema.parse({
        documentType: kind,
        zohoDocumentId: id,
        document,
        fiscalizationRequest: null,
      })
      const { fiscalizationRequest, ...row } = page.items[0]!
      expect(row).toEqual(detail.document)
      expect(fiscalizationRequest).toBeNull()
      expect(zohoId(row, kind)).toBe(id)
      expect(documentNumber(row, kind)).toBe(number)
      expect(row.total).toBe(document.total)
      expect(row.line_items?.[0]).toMatchObject({
        quantity: document.line_items[0].quantity,
        rate: document.line_items[0].rate,
        discount_amount: document.line_items[0].discount_amount,
        tax_percentage: document.line_items[0].tax_percentage,
        tax_amount: document.line_items[0].tax_amount,
      })
      expect(row.taxes?.[0]).toEqual({
        tax_name: document.taxes[0].tax_name,
        tax_percentage: document.taxes[0].tax_percentage,
        tax_amount: document.taxes[0].tax_amount,
      })
      expect(JSON.stringify(row)).not.toContain('private')
      if (kind === 'credit_note') {
        expect(row.invoice_id).toBe('000-original-invoice')
        expect(row.invoice_number).toBe('INV-00009')
      }
    },
  )

  it('keeps absent source fields unavailable instead of assigning zero or a status', () => {
    const document = provisionalZohoDocumentSchema.parse({})
    expect(document).toEqual({})
    expect(documentAmount(document.total)).toBe('—')
    expect(documentAmount(document.tax_total)).toBe('—')
    expect(document.status).toBeUndefined()
    expect(document.line_items).toBeUndefined()
    expect(document.taxes).toBeUndefined()
  })

  it('retains explicit null optional fields without deriving amounts or invoice links', () => {
    const source = {
      customer_name: null,
      invoice_id: null,
      invoice_number: null,
      total: null,
      sub_total: null,
      tax_total: null,
      line_items: null,
      taxes: null,
      billing_address: null,
    }
    const document = provisionalZohoDocumentSchema.parse(source)
    expect(document).toEqual(source)
    expect(documentAmount(document.total)).toBe('—')
    expect(zohoId(document, 'invoice')).toBeUndefined()
  })

  it('accepts supplied numeric amounts while refusing scalar coercion and unsupported values', () => {
    const document = provisionalZohoDocumentSchema.parse({
      invoice_id: 1.5,
      status: false,
      total: 116.5,
      sub_total: Number.POSITIVE_INFINITY,
      balance: { amount: 10 },
      discount_total: false,
      line_items: [{ quantity: 2, rate: '50.0000', tax_amount: true }],
      taxes: [{ tax_name: 16, tax_percentage: 16, tax_amount: '16.0000' }],
    })
    expect(zohoId(document, 'invoice')).toBeUndefined()
    expect(document.status).toBeUndefined()
    expect(document.total).toBe(116.5)
    expect(document.sub_total).toBeUndefined()
    expect(document.balance).toBeUndefined()
    expect(document.discount_total).toBeUndefined()
    expect(document.line_items?.[0]).toMatchObject({ quantity: 2, rate: '50.0000' })
    expect(document.line_items?.[0]?.tax_amount).toBeUndefined()
    expect(document.taxes?.[0]).toMatchObject({ tax_percentage: 16, tax_amount: '16.0000' })
    expect(document.taxes?.[0]?.tax_name).toBeUndefined()
  })

  it.each([
    { line_items: {}, taxes: {} },
    { line_items: [null], taxes: [null] },
    { line_items: ['unsupported'], taxes: ['unsupported'] },
  ])('leaves incompatible line and tax containers unavailable: %j', (source) => {
    const document = provisionalZohoDocumentSchema.parse({ ...source, total: '116.0000' })
    expect(document.line_items).toBeUndefined()
    expect(document.taxes).toBeUndefined()
    expect(document.total).toBe('116.0000')
    expect(document.tax_total).toBeUndefined()
  })

  it('keeps empty arrays distinct from unavailable arrays', () => {
    const document = provisionalZohoDocumentSchema.parse({ line_items: [], taxes: [] })
    expect(document.line_items).toEqual([])
    expect(document.taxes).toEqual([])
  })

  it('does not coerce numerical receipt identifiers into strings', () => {
    const fiscal = provisionalFiscalizationSchema.parse({
      cuReceiptNumber: 42,
      deviceValues: { cuReceiptNumber: 42 },
      writebackValues: { cuReceiptNumber: '00042' },
    })
    expect(fiscal.cuReceiptNumber).toBeUndefined()
    expect(fiscal.deviceValues?.cuReceiptNumber).toBeUndefined()
    expect(fiscal.writebackValues?.cuReceiptNumber).toBe('00042')
  })

  it('formats a supplied large decimal string without rounding or deriving tax', () => {
    expect(documentAmount('9007199254740993.123400')).toBe('9,007,199,254,740,993.123400')
    expect(documentAmount('0.0000')).toBe('0.0000')
    expect(documentAmount('-27.8400')).toBe('-27.8400')
  })
})

describe('user-provided Zoho examples inside the existing dashboard envelopes', () => {
  // Only provider fields are evidenced by the samples. These explicit dashboard
  // wrappers test our projection, not a captured or authenticated middleware join.
  it.each([
    {
      kind: 'invoice' as const,
      id: '982000000567114',
      document: zohoInvoiceDetailSample.invoice,
    },
    {
      kind: 'credit_note' as const,
      id: '90300000072369',
      document: zohoCreditNoteDetailSample.creditnote,
    },
  ])('preserves $kind source identity and list/detail consistency', ({ kind, id, document }) => {
    const detail = documentDetailSchema.parse({
      documentType: kind,
      zohoDocumentId: id,
      document,
      fiscalizationRequest: null,
    })
    const page = documentPageSchema.parse({
      page: 1,
      pageSize: 25,
      total: null,
      hasMore: false,
      items: [{ ...document, fiscalizationRequest: null }],
    })
    const { fiscalizationRequest, ...row } = page.items[0]!
    expect(row).toEqual(detail.document)
    expect(zohoId(row, kind)).toBe(id)
    expect(row.billing_address?.zip).toBe('94588')
    expect(fiscalizationRequest).toBeNull()
  })

  it('preserves invoice numeric identifiers losslessly and displays the supplied monetary fields', () => {
    const document = provisionalZohoDocumentSchema.parse(zohoInvoiceDetailSample.invoice)
    expect(document.invoice_id).toBe('982000000567114')
    expect(document.customer_id).toBe('982000000567001')
    expect(document.line_items?.[0]?.item_id).toBe('982000000030049')
    expect(document).toMatchObject({
      invoice_number: 'INV-00003',
      status: 'draft',
      customer_name: 'Bowman & Co',
      date: '2013-11-17',
      due_date: '2013-12-03',
      currency_code: 'USD',
      total: 10000,
      balance: 40.6,
      sub_total: 10000,
      tax_total: 22.6,
      adjustment: 0,
      discount: 0,
      is_discount_before_tax: true,
      discount_type: 'item_level',
      is_inclusive_tax: false,
    })
    expect(document.line_items?.[0]).toMatchObject({
      name: 'Hard Drive',
      quantity: 1,
      rate: 120,
      discount_amount: 0,
      discount: 0,
      tax_name: 'VAT',
      tax_id: '982000000557028',
      tax_percentage: 12.5,
      item_total: 120,
    })
    // The sample tax breakdown does not equal tax_total. Do not recalculate it.
    expect(document.taxes).toEqual([{ tax_name: 'VAT', tax_amount: 19.13 }])
    expect(document.line_items?.[0]?.tax_amount).toBeUndefined()
    expect(document.discount_total).toBeUndefined()
  })

  it('preserves credit-note invoice allocations and different supplied tax evidence without inference', () => {
    const document = provisionalZohoDocumentSchema.parse(zohoCreditNoteDetailSample.creditnote)
    expect(document).toMatchObject({
      creditnote_id: '90300000072369',
      creditnote_number: 'CN-29',
      status: 'draft',
      customer_id: '903000000000099',
      customer_name: 'Bowman Furniture',
      reference_number: 'INV-384',
      total: 450,
      balance: 10,
      currency_code: 'USD',
      invoices: [{ invoice_id: '90300000079426', invoice_number: 'INV-384', amount: 450 }],
    })
    expect(document.taxes).toEqual([
      { tax_id: '903000000000356', tax_name: 'Basic Tax', tax_amount: '2.50' },
    ])
    expect(document.line_items?.[0]).toMatchObject({
      item_id: '90300000081501',
      name: 'Basic Monthly',
      quantity: 1,
      tax_id: '903000000000356',
    })
    expect(document.line_items?.[0]?.rate).toBeUndefined()
    expect(document.line_items?.[0]?.item_total).toBeUndefined()
    expect(document.line_items?.[0]?.tax_name).toBeUndefined()
    expect(document.line_items?.[0]?.tax_percentage).toBeUndefined()
    expect(document.line_items?.[0]?.tax_amount).toBeUndefined()
    expect(document.sub_total).toBeUndefined()
    expect(document.tax_total).toBeUndefined()
    expect(document.discount_total).toBeUndefined()
    expect(documentAmount(document.tax_total)).toBe('—')
    expect(document.invoice_id).toBeUndefined()
    expect(document.discount).toBeUndefined()
    expect(document.is_discount_before_tax).toBeUndefined()
    expect(document.discount_type).toBeUndefined()
    expect(document.is_inclusive_tax).toBeUndefined()
  })

  it('retains updated_time and accepts supplied compact timestamp offsets for Nairobi display', () => {
    const invoice = provisionalZohoDocumentSchema.parse(zohoInvoiceDetailSample.invoice)
    const creditNote = provisionalZohoDocumentSchema.parse(zohoCreditNoteDetailSample.creditnote)
    expect(creditNote.updated_time).toBe('2016-06-05T02:30:08-0700')
    expect(creditNote.last_modified_time).toBeUndefined()
    expect(documentDate(invoice.created_time, true)).toBe(
      documentDate('2013-11-18T02:17:40-08:00', true),
    )
    expect(documentDate(invoice.created_time, true)).not.toBe('—')
    expect(documentDate(creditNote.updated_time, true)).toBe(
      documentDate('2016-06-05T02:30:08-07:00', true),
    )
  })

  it.each([zohoInvoiceDetailSample, zohoCreditNoteDetailSample])(
    'does not treat a raw provider detail wrapper as a dashboard detail response: %#',
    (source) => {
      expect(documentDetailSchema.safeParse(source).success).toBe(false)
    },
  )

  it.each([zohoInvoiceListSample, zohoCreditNoteListSample])(
    'does not reinterpret a raw provider list wrapper as verified dashboard pagination: %#',
    (source) => {
      expect(documentPageSchema.safeParse(source).success).toBe(false)
    },
  )

  it('projects supplied list entries without inventing detail-only lines, taxes or invoice links', () => {
    const invoice = provisionalZohoDocumentSchema.parse(zohoInvoiceListSample.invoices[0])
    const creditNote = provisionalZohoDocumentSchema.parse(zohoCreditNoteListSample.creditnotes)
    expect(invoice.invoice_id).toBe('982000000567114')
    expect(invoice.invoice_number).toBe('INV-00003')
    expect(creditNote.creditnote_id).toBe('90300000072369')
    expect(creditNote.creditnote_number).toBe('CN-29')
    expect(invoice.status).toBe('draft')
    expect(creditNote.status).toBe('draft')
    for (const document of [invoice, creditNote]) {
      expect(document.line_items).toBeUndefined()
      expect(document.taxes).toBeUndefined()
      expect(document.sub_total).toBeUndefined()
      expect(document.tax_total).toBeUndefined()
      expect(document.invoices).toBeUndefined()
    }
    expect(creditNote.invoice_id).toBeUndefined()
    expect(creditNote.invoice_number).toBeUndefined()
    expect(creditNote.reference_number).toBe('INV-384')
  })

  it('refuses unsafe or fractional numerical document IDs instead of rounding them', () => {
    for (const invoice_id of [Number.MAX_SAFE_INTEGER + 1, 42.5, -1]) {
      const document = provisionalZohoDocumentSchema.parse({ invoice_id })
      expect(document.invoice_id).toBeUndefined()
      expect(zohoId(document, 'invoice')).toBeUndefined()
    }
    const leadingZero = provisionalZohoDocumentSchema.parse({ invoice_id: '000982000000567114' })
    expect(zohoId(leadingZero, 'invoice')).toBe('000982000000567114')
  })
})
