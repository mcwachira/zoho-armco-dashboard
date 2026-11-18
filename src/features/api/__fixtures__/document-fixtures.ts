// Synthetic UI/test fixtures for PROVISIONAL bindings; not middleware samples.
// This module is imported only by tests. Never used as a production fallback.
export const invoiceDocumentFixture = {
  invoice_id: 'fixture-invoice-42',
  invoice_number: 'UI-INV-0042',
  customer_id: 'fixture-customer',
  customer_name: 'UI fixture customer',
  status: 'paid',
  date: '2026-11-10',
  due_date: '2026-11-30',
  currency_code: 'KES',
  sub_total: '100.00',
  discount_total: '0.00',
  tax_total: '16.00',
  adjustment: '0.00',
  total: '116.00',
  balance: '0.00',
  reference_number: 'UI fixture reference',
  notes: 'UI fixture notes',
  billing_address: { address: 'UI fixture street', city: 'Nairobi' },
  line_items: [
    {
      name: 'UI fixture item',
      description: 'UI fixture description',
      quantity: '2',
      rate: '50.00',
      discount_amount: '0.00',
      tax_name: 'UI fixture tax',
      tax_percentage: '16',
      tax_amount: '16.00',
      item_total: '116.00',
    },
  ],
  taxes: [{ tax_name: 'UI fixture tax', tax_percentage: '16', tax_amount: '16.00' }],
}
export const creditNoteDocumentFixture = {
  creditnote_id: 'fixture-credit-note-42',
  creditnote_number: 'UI-CN-0042',
  customer_name: 'UI fixture customer',
  status: 'open',
  date: '2026-11-11',
  currency_code: 'KES',
  total: '50.00',
}
export const fiscalizationFixture = {
  requestId: 'fixture-request-42',
  status: 'FIXTURE_REVIEW_PENDING',
  executionStatus: 'FIXTURE_EXECUTION_STATUS',
  cuReceiptNumber: 'UI-FIXTURE-RECEIPT',
  kraQrUrl: 'https://verification.example.test/fixture',
  fiscalizedAt: '2026-11-10T10:30:00Z',
  deviceResult: 'UI fixture device result',
  errorCode: 'UI_FIXTURE_ERROR',
  errorMessage: 'UI fixture error detail',
  attempts: [
    {
      attemptNumber: 7,
      status: 'FIXTURE_ATTEMPT_STATUS',
      startedAt: '2026-11-10T10:29:00Z',
      completedAt: '2026-11-10T10:30:00Z',
      deviceResult: 'UI fixture attempt result',
      errorCode: 'UI_FIXTURE_ATTEMPT_ERROR',
    },
  ],
}
export function documentPageFixture(items: unknown[], extra: Record<string, unknown> = {}) {
  return { page: 1, pageSize: 25, total: null, hasMore: false, items, ...extra }
}

export const reconciledReceiptFixture = {
  cuReceiptNumber: '0110162170000105405',
  kraQrUrl:
    'https://itax.kra.go.ke/KRA-Portal/invoiceChk.htm?actionCode=loadPage&invoiceNo=0110162170000105405',
}

/** Synthetic evidence with deliberately distinct source, snapshot and device values. */
export const detailedFiscalizationFixture = {
  ...fiscalizationFixture,
  ...reconciledReceiptFixture,
  deviceOutcome: 'OutcomeUnknown',
  kraTransmissionStatus: 'FIXTURE_TRANSMISSION_PENDING',
  writebackStatus: 'FIXTURE_WRITEBACK_RESULT',
  receiptConfirmed: false,
  submittedAt: '2026-11-10T10:28:00Z',
  startedAt: '2026-11-10T10:29:00Z',
  completedAt: '2026-11-10T10:30:00Z',
  snapshot: {
    capturedAt: '2026-11-10T10:28:30Z',
    lineItems: [
      {
        name: 'Snapshot item before device commands',
        itemId: 'snapshot-item-1',
        quantity: '3',
        unitPrice: '40.00',
        taxClass: 'A',
        hsCode: '1234.56',
        hsName: 'Snapshot HS description',
      },
    ],
  },
  commandSequence: [
    {
      command: 'FixtureRegisterItem',
      arguments: { itemName: 'Actual device item argument', taxClass: 'A', price: '41.00' },
      response: '<Res Code="0"><Res Name="FixtureDeviceValue" Value="DEVICE-REPLY" /></Res>',
    },
  ],
  deviceValues: {
    cuSerialNumber: 'DEVICE-SERIAL',
    cuReceiptNumber: '000DEVICE-RECEIPT',
    kraTransmissionResult: 'Actual device transmission response',
  },
  writebackValues: {
    cuSerialNumber: 'WRITEBACK-SERIAL',
    cuReceiptNumber: '000WRITEBACK-RECEIPT',
    result: 'Persisted Zoho writeback response',
  },
  attempts: [
    {
      attemptNumber: 7,
      status: 'FIXTURE_ATTEMPT_STATUS',
      errorCode: 'FIXTURE_ATTEMPT_DEVICE_ERROR',
      errorMessage: 'Actual attempt failure evidence',
      commandSequence: [
        {
          command: 'FixtureAttemptCommand',
          arguments: { salesNumber: '000' },
          response: '<Res Code="42">Fixture attempt device failure</Res>',
          errorCode: 'FIXTURE_COMMAND_ERROR',
          errorMessage: 'Persisted command error',
        },
      ],
    },
  ],
}
