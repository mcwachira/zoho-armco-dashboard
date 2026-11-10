import type {
  DashboardCapabilities,
  DashboardCreditNoteDetail,
  DashboardCreditNoteItem,
  DashboardDeviceDiagnostics,
  DashboardInvoiceDetail,
  DashboardInvoiceItem,
  DashboardManualReview,
  DashboardOverview,
  DashboardReconciliation,
  DashboardServiceHealth,
} from './schemas'

/** Stable, fictional DTOs for the local-only dashboard API adapter. */
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
const today = () => new Date().toISOString().slice(0, 10)
export const mockGeneratedAt = ago(0)

export const mockInvoices: DashboardInvoiceItem[] = [
  {
    requestId: 'demo-invoice-1001',
    documentType: 'invoice',
    zohoDocumentId: 'demo-zoho-invoice-1001',
    documentNumber: 'DEMO-INV-1001',
    customerName: 'Kifaru Office Supplies (Demo)',
    amount: '184500.00',
    currency: 'KES',
    fiscalizationStatus: 'Succeeded',
    transmissionStatus: 'TRANSMISSION_CONFIRMED',
    reconciliationStatus: 'accepted',
    writebackStatus: 'succeeded',
    confirmedReceiptEvidence: true,
    receiptNumber: 'DEMO-CU-1001',
    qrCode: 'https://example.test/demo-receipt/DEMO-CU-1001',
    fiscalizedAt: ago(28),
    createdAt: ago(30),
    updatedAt: ago(27),
    attemptCount: 1,
    lastError: null,
    correlationId: 'demo-correlation-1001',
  },
  {
    requestId: 'demo-invoice-1002',
    documentType: 'invoice',
    zohoDocumentId: 'demo-zoho-invoice-1002',
    documentNumber: 'DEMO-INV-1002',
    customerName: 'Acacia Workspace (Demo)',
    amount: '76200.00',
    currency: 'KES',
    fiscalizationStatus: 'Failed',
    transmissionStatus: 'TRANSMISSION_PENDING',
    reconciliationStatus: 'reconciliation_required',
    writebackStatus: 'not_attempted',
    confirmedReceiptEvidence: false,
    receiptNumber: null,
    qrCode: null,
    fiscalizedAt: null,
    createdAt: ago(65),
    updatedAt: ago(61),
    attemptCount: 2,
    lastError: { code: 'DEMO_DEVICE_TIMEOUT', message: 'Fictional sample failure for UI preview.' },
    correlationId: 'demo-correlation-1002',
  },
  {
    requestId: 'demo-invoice-1003',
    documentType: 'invoice',
    zohoDocumentId: 'demo-zoho-invoice-1003',
    documentNumber: 'DEMO-INV-1003',
    customerName: 'Baobab Services (Demo)',
    amount: '392000.00',
    currency: 'KES',
    fiscalizationStatus: 'InProgress',
    transmissionStatus: null,
    reconciliationStatus: 'pending',
    writebackStatus: 'pending',
    confirmedReceiptEvidence: false,
    receiptNumber: null,
    qrCode: null,
    fiscalizedAt: null,
    createdAt: ago(120),
    updatedAt: ago(10),
    attemptCount: 1,
    lastError: null,
    correlationId: 'demo-correlation-1003',
  },
]

export const mockCreditNotes: DashboardCreditNoteItem[] = [
  {
    requestId: 'demo-credit-note-2001',
    documentType: 'credit_note',
    zohoDocumentId: 'demo-zoho-credit-note-2001',
    documentNumber: 'DEMO-CN-2001',
    customerName: null,
    originalInvoice: {
      zohoInvoiceId: 'demo-zoho-invoice-1001',
      invoiceNumber: 'DEMO-INV-1001',
      cuReceiptNumber: 'DEMO-CU-1001',
    },
    amount: '12500.00',
    currency: 'KES',
    fiscalizationStatus: 'COMPLETED',
    transmissionStatus: 'TRANSMISSION_CONFIRMED',
    reconciliationStatus: 'accepted',
    writebackStatus: 'succeeded',
    confirmedReceiptEvidence: true,
    receiptNumber: 'DEMO-CU-2001',
    cuSerialNumber: null,
    qrCode: 'https://example.test/demo-receipt/DEMO-CU-2001',
    fiscalizedAt: ago(180),
    createdAt: ago(185),
    updatedAt: ago(177),
    attemptCount: 1,
    lastError: null,
  },
  {
    requestId: 'demo-credit-note-2002',
    documentType: 'credit_note',
    zohoDocumentId: 'demo-zoho-credit-note-2002',
    documentNumber: 'DEMO-CN-2002',
    customerName: null,
    originalInvoice: {
      zohoInvoiceId: 'demo-zoho-invoice-1002',
      invoiceNumber: 'DEMO-INV-1002',
      cuReceiptNumber: null,
    },
    amount: '4200.00',
    currency: 'KES',
    fiscalizationStatus: 'MANUAL_REVIEW_REQUIRED',
    transmissionStatus: null,
    reconciliationStatus: 'reconciliation_required',
    writebackStatus: 'not_attempted',
    confirmedReceiptEvidence: false,
    receiptNumber: null,
    cuSerialNumber: null,
    qrCode: null,
    fiscalizedAt: null,
    createdAt: ago(220),
    updatedAt: ago(214),
    attemptCount: 2,
    lastError: { code: 'DEMO_REVIEW', message: 'Fictional sample item awaiting review.' },
  },
]

const succeededInvoiceDetail: DashboardInvoiceDetail = {
  request: {
    ...mockInvoices[0]!,
    snapshot: {
      invoice: {
        invoiceNumber: 'DEMO-INV-1001',
        date: today(),
        currency: 'KES',
        subtotal: '159051.72',
        taxTotal: '25448.28',
        total: '184500.00',
        lines: [
          {
            description: 'Sample office equipment',
            itemName: 'Sample office equipment',
            quantity: '1',
            unitPrice: '159051.72',
            lineTotal: '159051.72',
          },
        ],
      },
    },
    attempts: [
      {
        attemptNumber: 1,
        stage: 'demo_confirmation',
        outcome: 'confirmed',
        startedAt: ago(29),
        completedAt: ago(28),
        receiptNumber: 'DEMO-CU-1001',
        qrCode: 'https://example.test/demo-receipt/DEMO-CU-1001',
        issuedAt: ago(28),
        errorCode: null,
        errorMessage: null,
      },
    ],
    evidence: {
      cuSerialNumber: 'DEMO-CU-SERIAL',
      cuInvoiceNumber: 'DEMO-CU-1001',
      cuReceiptNumber: 'DEMO-CU-1001',
      qrVerificationUrl: 'https://example.test/demo-receipt/DEMO-CU-1001',
      fiscalizedAtLocal: new Date(Date.now() - 28 * 60_000).toISOString().slice(0, 19),
      timeZone: 'Africa/Nairobi',
      fiscalizedAtUtc: ago(28),
      evidenceSource: {
        cuSerialNumber: 'startup_configuration',
        cuInvoiceNumber: 'electronic_journal',
        cuReceiptNumber: 'close_receipt',
        electronicJournal: 'tremol_g03',
        qrVerificationUrl: 'close_receipt',
        fiscalizedAt: 'electronic_journal',
        transmissionStatus: 'successful_g03_receipt',
      },
    },
    etims: null,
    writeback: {
      status: 'succeeded',
      writtenCustomFieldIds: ['demo-field-1'],
      errorCategory: null,
      createdAt: ago(27),
      updatedAt: ago(27),
      completedAt: ago(27),
      retryCount: 0,
    },
    manualReview: null,
    timeline: [
      { event: 'demo_request_received', timestamp: mockInvoices[0]!.createdAt, status: 'sample' },
      { event: 'demo_receipt_confirmed', timestamp: ago(28), status: 'sample' },
      { event: 'demo_writeback_completed', timestamp: ago(27), status: 'sample' },
    ],
  },
}

const creditNoteDetail: DashboardCreditNoteDetail = {
  request: {
    ...mockCreditNotes[1]!,
    snapshot: {
      documentNumber: 'DEMO-CN-2002',
      date: today(),
      currency: 'KES',
      subtotal: '3620.69',
      taxTotal: '579.31',
      amount: '4200.00',
      lines: [
        {
          name: 'Sample returned item',
          quantity: '1',
          rate: '3620.69',
          lineAmount: '3620.69',
          taxName: 'VAT',
          taxPercentage: '16',
          unit: 'item',
        },
      ],
    },
    attempts: [
      {
        attemptNumber: 1,
        stage: 'demo_validation',
        status: 'review_required',
        startedAt: ago(219),
        completedAt: ago(216),
        errorCategory: 'DEMO_ONLY',
        errorDetails: 'Fictional sample diagnostic.',
        deviceEvidence: [],
      },
    ],
    evidence: null,
    writeback: null,
    diagnostics: [
      {
        id: 'demo-diagnostic-1',
        collectedAt: ago(216),
        kind: 'demo_note',
        classification: 'sample',
        hasPersistedEvidence: false,
      },
    ],
  },
}

export const mockInvoiceDetails: Record<string, DashboardInvoiceDetail> = {
  [mockInvoices[0]!.requestId]: succeededInvoiceDetail,
  [mockInvoices[1]!.requestId]: {
    request: {
      ...mockInvoices[1]!,
      snapshot: null,
      attempts: [],
      evidence: null,
      etims: null,
      writeback: null,
      manualReview: null,
      timeline: [
        { event: 'demo_request_received', timestamp: mockInvoices[1]!.createdAt, status: 'sample' },
      ],
    },
  },
  [mockInvoices[2]!.requestId]: {
    request: {
      ...mockInvoices[2]!,
      snapshot: null,
      attempts: [],
      evidence: null,
      etims: null,
      writeback: null,
      manualReview: null,
      timeline: [
        { event: 'demo_request_received', timestamp: mockInvoices[2]!.createdAt, status: 'sample' },
      ],
    },
  },
}

export const mockCreditNoteDetails: Record<string, DashboardCreditNoteDetail> = {
  [mockCreditNotes[0]!.requestId]: {
    request: {
      ...mockCreditNotes[0]!,
      snapshot: {
        documentNumber: 'DEMO-CN-2001',
        date: today(),
        currency: 'KES',
        subtotal: '10775.86',
        taxTotal: '1724.14',
        amount: '12500.00',
        lines: [],
      },
      attempts: [],
      evidence: {
        receiptNumber: 'DEMO-CU-2001',
        cuSerialNumber: null,
        qrCode: 'https://example.test/demo-receipt/DEMO-CU-2001',
        fiscalizedAt: ago(180),
        transmissionStatus: 'TRANSMISSION_CONFIRMED',
        persistedEvidence: true,
      },
      writeback: null,
      diagnostics: [],
    },
  },
  [mockCreditNotes[1]!.requestId]: creditNoteDetail,
}

const capability = (status: 'available' | 'partial' | 'unavailable', source: string) => ({
  status,
  source: `DEMO ONLY: ${source}`,
})

export const mockCapabilities: DashboardCapabilities = {
  generatedAt: mockGeneratedAt,
  capabilities: {
    invoiceHistory: capability('available', 'local invoice fixtures.'),
    invoiceDetails: capability('available', 'local invoice detail fixtures.'),
    creditNoteHistory: capability('available', 'local credit-note fixtures.'),
    creditNoteDetails: capability('available', 'local credit-note detail fixtures.'),
    writebackListing: capability('unavailable', 'no aggregate writeback fixture contract.'),
    manualReview: capability('partial', 'bounded local manual-review fixtures.'),
    reconciliation: capability('partial', 'detail-level sample evidence only.'),
    serviceHealth: capability('partial', 'fictional local service-health fixture.'),
    deviceFleet: capability('unavailable', 'physical device state is never simulated as verified.'),
    queueDepth: capability('unavailable', 'no queue fixture is supplied.'),
    systemEvents: capability('unavailable', 'no live event stream is simulated.'),
    overviewAggregates: capability('available', 'aggregates derived from local fixtures.'),
  },
}

export const mockOverview = (createdFrom: string, createdTo: string): DashboardOverview => {
  const invoices = mockInvoices.filter((item) => inRange(item.createdAt, createdFrom, createdTo))
  const creditNotes = mockCreditNotes.filter((item) =>
    inRange(item.createdAt, createdFrom, createdTo),
  )
  const group = (values: string[]) =>
    values.reduce<Record<string, number>>((result, value) => {
      result[value] = (result[value] ?? 0) + 1
      return result
    }, {})
  return {
    availability: 'available',
    generatedAt: mockGeneratedAt,
    range: { createdFrom, createdTo },
    metrics: {
      invoices: {
        totalRequests: invoices.length,
        requestsByStatus: group(invoices.map((item) => item.fiscalizationStatus)),
        transmissionByStatus: group(invoices.map((item) => item.transmissionStatus ?? 'unknown')),
        reconciliationByStatus: group(
          invoices.map((item) => item.reconciliationStatus ?? 'unknown'),
        ),
        writebackByStatus: group(invoices.map((item) => item.writebackStatus)),
        confirmedReceiptCount: invoices.filter((item) => item.confirmedReceiptEvidence).length,
      },
      creditNotes: {
        totalRequests: creditNotes.length,
        requestsByState: group(creditNotes.map((item) => item.fiscalizationStatus)),
        reconciliationByStatus: group(
          creditNotes.map((item) => item.reconciliationStatus ?? 'unknown'),
        ),
        writebackByStatus: group(creditNotes.map((item) => item.writebackStatus)),
        confirmedReceiptCount: creditNotes.filter((item) => item.confirmedReceiptEvidence).length,
      },
    },
    sources: {
      invoices: {
        source: 'Local demo fixtures',
        calculation: 'Fixture records within selected range',
      },
      creditNotes: {
        source: 'Local demo fixtures',
        calculation: 'Fixture records within selected range',
      },
    },
    unavailableMetrics: [
      'transaction_value',
      'processing_time_trend',
      'historical_uptime',
      'queue_depth',
      'system_event_counts',
      'manual_review_total',
    ],
  }
}

export const mockManualReview: DashboardManualReview = {
  availability: 'partial',
  page: 1,
  pageSize: 25,
  total: null,
  hasMore: false,
  items: [
    {
      caseId: 'demo-review-1',
      requestId: 'demo-credit-note-2002',
      operationId: 'demo-operation-2002',
      relatedAttemptIds: ['demo-attempt-2002-1'],
      observedState: 'MANUAL_REVIEW_REQUIRED',
      reason: 'DEMO ONLY: sample evidence requires operator review.',
      status: 'open',
      createdAt: ago(219),
      updatedAt: ago(214),
      decisions: [],
    },
  ],
}

export const mockReconciliation: DashboardReconciliation = {
  availability: 'partial',
  sources: ['DEMO ONLY: invoice and credit-note detail fixtures'],
  reason: 'This local preview has detail-level examples, not a complete reconciliation queue.',
}

export const mockDeviceDiagnostics: DashboardDeviceDiagnostics = {
  availability: 'unavailable',
  checkedAt: null,
  endpointReachability: { status: 'not_checked' },
  deviceIdentity: {
    status: 'unavailable',
    reason: 'Local demo mode does not contact or identify a fiscal device.',
  },
  serialNumber: null,
  lastCommunication: { status: 'not_checked', lastCommunicationAt: null },
  physicalHealth: { status: 'unverified' },
  fiscalizationReadiness: { status: 'unknown' },
  etimsPairing: { status: 'unknown' },
  healthHistory: { status: 'unavailable' },
}

export const mockServiceHealth: DashboardServiceHealth = {
  availability: 'partial',
  checkedAt: mockGeneratedAt,
  gateway: { status: 'unknown', lastSuccessfulCommunicationAt: null },
  middlewareApi: { status: 'reachable', processUptimeSeconds: 3600 },
  database: { status: 'unknown' },
  zfplabserverEndpoint: { status: 'unknown' },
  g03Communication: { status: 'unknown' },
  physicalDevice: { status: 'unverified' },
  zohoBooks: { status: 'unknown' },
  etims: { status: 'unknown' },
  upstreamUptime: { status: 'unavailable', valueSeconds: null },
  observability: null,
}

function inRange(value: string, from: string, to: string) {
  const timestamp = Date.parse(value)
  return timestamp >= Date.parse(from) && timestamp <= Date.parse(to)
}
