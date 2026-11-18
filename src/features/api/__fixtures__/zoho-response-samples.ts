/**
 * Reduced user-provided Zoho provider examples, received 2026-11-17.
 * Unneeded contact/address/customer-tax data is omitted. These retain the supplied
 * field types and nesting, including inconsistent or absent source totals.
 * They are NOT authenticated middleware responses and contain no fiscal join.
 * Production code must never import these fixtures or use them as fallback data.
 */
export const zohoInvoiceDetailSample = {
  code: 0,
  message: 'success',
  invoice: {
    invoice_id: 982000000567114,
    invoice_number: 'INV-00003',
    status: 'draft',
    customer_id: 982000000567001,
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
    line_items: [
      {
        item_id: 982000000030049,
        name: 'Hard Drive',
        description: '500GB, USB 2.0 interface 1400 rpm, protective hard case.',
        quantity: 1,
        rate: 120,
        discount_amount: 0,
        discount: 0,
        tax_name: 'VAT',
        tax_id: 982000000557028,
        tax_percentage: 12.5,
        item_total: 120,
      },
    ],
    taxes: [{ tax_name: 'VAT', tax_amount: 19.13 }],
    billing_address: { zip: 94588 },
    created_time: '2013-11-18T02:17:40-0800',
    last_modified_time: '2013-11-18T02:02:51-0800',
    notes: 'Looking forward for your business.',
    terms: 'Terms & Conditions apply',
  },
}

export const zohoCreditNoteDetailSample = {
  code: 0,
  message: 'success',
  creditnote: {
    creditnote_id: '90300000072369',
    creditnote_number: 'CN-29',
    status: 'draft',
    customer_id: '903000000000099',
    customer_name: 'Bowman Furniture',
    date: '2016-06-05',
    reference_number: 'INV-384',
    total: 450,
    balance: 10,
    currency_code: 'USD',
    line_items: [
      {
        item_id: '90300000081501',
        name: 'Basic Monthly',
        description: 'prorated amount for items',
        quantity: 1,
        tax_id: '903000000000356',
      },
    ],
    invoices: [{ invoice_id: '90300000079426', invoice_number: 'INV-384', amount: 450 }],
    taxes: [{ tax_id: '903000000000356', tax_name: 'Basic Tax', tax_amount: '2.50' }],
    created_time: '2016-06-05T02:30:08-0700',
    updated_time: '2016-06-05T02:30:08-0700',
    billing_address: { zip: 94588 },
    notes: 'Offer for the referral',
    terms: '',
  },
}

export const zohoInvoiceListSample = {
  code: 0,
  message: 'success',
  invoices: [
    {
      invoice_id: 982000000567114,
      customer_id: 982000000567001,
      customer_name: 'Bowman & Co',
      status: 'draft',
      invoice_number: 'INV-00003',
      date: '2013-11-17',
      due_date: '2013-12-03',
      currency_code: 'USD',
      total: 10000,
      balance: 40.6,
      created_time: '2013-11-18T02:17:40-0800',
      last_modified_time: '2013-11-18T02:02:51-0800',
    },
  ],
  // The supplied example uses an array here. Do not silently reinterpret it.
  page_context: [{ page: 1, per_page: 10, has_more_page: false }],
}

export const zohoCreditNoteListSample = {
  code: 0,
  message: 'success',
  // The supplied example has a single object and no pagination metadata.
  // Whether the live provider/middleware always returns this shape is unknown.
  creditnotes: {
    creditnote_id: '90300000072369',
    creditnote_number: 'CN-29',
    status: 'draft',
    reference_number: 'INV-384',
    date: '2016-06-05',
    total: 450,
    balance: 10,
    customer_id: '903000000000099',
    customer_name: 'Bowman Furniture',
    currency_code: 'USD',
    created_time: '2016-06-05T02:30:08-0700',
    last_modified_time: '2016-06-05T02:30:08-0700',
  },
}
