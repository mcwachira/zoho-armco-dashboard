import { describe, expect, it } from 'vitest'
import {
  dashboardCreditNotePageSchema,
  dashboardCreditNoteDetailSchema,
  dashboardCapabilitiesSchema,
  dashboardDeviceDiagnosticsSchema,
  dashboardInvoicePageSchema,
  dashboardInvoiceDetailSchema,
  dashboardOverviewSchema,
  dashboardServiceHealthSchema,
  deviceHealthSchema,
  readinessSchema,
} from './schemas'

describe('verified health response contracts', () => {
  it('accepts only the documented readiness statuses', () => {
    expect(readinessSchema.safeParse({ status: 'ready' }).success).toBe(true)
    expect(readinessSchema.safeParse({ status: 'not_ready' }).success).toBe(true)

    for (const status of ['healthy', 'degraded', 'ok', 'unavailable']) {
      expect(readinessSchema.safeParse({ status }).success).toBe(false)
    }
  })

  it('keeps endpoint reachability separate from physical health and fiscal readiness', () => {
    const reachableButUnverified = {
      status: 'endpoint_reachable',
      component: 'zfplabserver_endpoint',
      physicalDevice: 'unverified',
      fiscalReadiness: 'unknown',
    }
    expect(deviceHealthSchema.safeParse(reachableButUnverified).success).toBe(true)

    expect(
      deviceHealthSchema.safeParse({ ...reachableButUnverified, physicalDevice: 'healthy' })
        .success,
    ).toBe(false)
    expect(
      deviceHealthSchema.safeParse({ ...reachableButUnverified, fiscalReadiness: 'ready' }).success,
    ).toBe(false)
  })

  it('rejects an invented aggregate health response as a verified readiness or device contract', () => {
    const inventedPayload = {
      status: 'healthy',
      uptimePercent: 99.99,
      services: [{ name: 'G03', status: 'online' }],
      g03: { online: true, fiscalReady: true },
    }

    expect(readinessSchema.safeParse(inventedPayload).success).toBe(false)
    expect(deviceHealthSchema.safeParse(inventedPayload).success).toBe(false)
  })
})

describe('verified dashboard document list contracts', () => {
  it('accepts a paginated invoice snapshot with explicit unavailable nullable fields', () => {
    const parsed = dashboardInvoicePageSchema.safeParse({
      page: 1,
      pageSize: 25,
      total: 1,
      items: [
        {
          requestId: 'req-1',
          documentType: 'invoice',
          zohoDocumentId: 'zoho-1',
          documentNumber: null,
          customerName: null,
          amount: null,
          currency: null,
          fiscalizationStatus: 'OutcomeUnknown',
          transmissionStatus: null,
          reconciliationStatus: null,
          writebackStatus: 'outcome_unknown',
          confirmedReceiptEvidence: false,
          receiptNumber: null,
          qrCode: null,
          fiscalizedAt: null,
          createdAt: '2026-11-09T08:30:00.000Z',
          updatedAt: '2026-11-09T08:31:00.000Z',
          attemptCount: 1,
          lastError: null,
          correlationId: 'corr-1',
        },
      ],
    })

    expect(parsed.success).toBe(true)
  })

  it('rejects invoice list rows that omit explicit receipt confirmation state', () => {
    const item = {
      requestId: 'req-1',
      documentType: 'invoice',
      zohoDocumentId: 'zoho-1',
      documentNumber: null,
      customerName: null,
      amount: null,
      currency: null,
      fiscalizationStatus: 'Succeeded',
      transmissionStatus: 'TRANSMISSION_CONFIRMED',
      reconciliationStatus: 'accepted',
      writebackStatus: 'succeeded',
      receiptNumber: 'CU-1',
      qrCode: 'https://etims.example.test/receipt/CU-1',
      fiscalizedAt: '2026-11-09T08:31:00.000Z',
      createdAt: '2026-11-09T08:30:00.000Z',
      updatedAt: '2026-11-09T08:31:00.000Z',
      attemptCount: 1,
      lastError: null,
      correlationId: null,
    }

    expect(
      dashboardInvoicePageSchema.safeParse({
        page: 1,
        pageSize: 25,
        total: 1,
        items: [item],
      }).success,
    ).toBe(false)
  })

  it('accepts credit-note list rows without inventing missing CU evidence', () => {
    const parsed = dashboardCreditNotePageSchema.safeParse({
      page: 1,
      pageSize: 25,
      total: 1,
      items: [
        {
          requestId: 'cn-req-1',
          documentType: 'credit_note',
          zohoDocumentId: 'zoho-cn-1',
          documentNumber: 'CN-1',
          customerName: null,
          originalInvoice: {
            zohoInvoiceId: 'zoho-inv-1',
            invoiceNumber: 'INV-1',
            cuReceiptNumber: null,
          },
          amount: '1200.00',
          currency: 'KES',
          fiscalizationStatus: 'WRITEBACK_PENDING',
          transmissionStatus: null,
          reconciliationStatus: null,
          writebackStatus: 'in_progress',
          confirmedReceiptEvidence: false,
          receiptNumber: null,
          cuSerialNumber: null,
          qrCode: null,
          fiscalizedAt: null,
          createdAt: '2026-11-09T08:30:00.000Z',
          updatedAt: '2026-11-09T08:32:00.000Z',
          attemptCount: 2,
          lastError: null,
        },
      ],
    })

    expect(parsed.success).toBe(true)
  })

  it('keeps invoice writeback list filters narrower than credit-note pending state', () => {
    expect(
      dashboardInvoicePageSchema.safeParse({
        page: 1,
        pageSize: 1,
        total: 1,
        items: [],
      }).success,
    ).toBe(true)

    const pendingCreditNote = dashboardCreditNotePageSchema.safeParse({
      page: 1,
      pageSize: 1,
      total: 1,
      items: [
        {
          requestId: 'cn-pending',
          documentType: 'credit_note',
          zohoDocumentId: 'zoho-cn-pending',
          documentNumber: 'CN-PENDING',
          customerName: null,
          originalInvoice: {
            zohoInvoiceId: null,
            invoiceNumber: null,
            cuReceiptNumber: null,
          },
          amount: null,
          currency: null,
          fiscalizationStatus: 'WRITEBACK_PENDING',
          transmissionStatus: null,
          reconciliationStatus: null,
          writebackStatus: 'pending',
          confirmedReceiptEvidence: false,
          receiptNumber: null,
          cuSerialNumber: null,
          qrCode: null,
          fiscalizedAt: null,
          createdAt: '2026-11-09T08:30:00.000Z',
          updatedAt: '2026-11-09T08:31:00.000Z',
          attemptCount: 0,
          lastError: null,
        },
      ],
    })

    expect(pendingCreditNote.success).toBe(true)
  })
})

describe('verified dashboard availability contracts', () => {
  it('does not infer measured uptime or physical health from current service reachability', () => {
    const service = dashboardServiceHealthSchema.safeParse({
      availability: 'partial',
      checkedAt: '2026-11-09T08:31:00.000Z',
      gateway: { status: 'unknown', lastSuccessfulCommunicationAt: null },
      middlewareApi: { status: 'reachable', processUptimeSeconds: 125.5 },
      database: { status: 'unknown' },
      zfplabserverEndpoint: { status: 'reachable' },
      g03Communication: { status: 'unknown' },
      physicalDevice: { status: 'unverified' },
      zohoBooks: { status: 'configured_unverified' },
      etims: { status: 'unknown' },
      upstreamUptime: { status: 'unavailable', valueSeconds: null },
      observability: null,
    })

    expect(service.success).toBe(true)
    expect(
      dashboardServiceHealthSchema.safeParse({
        availability: 'partial',
        checkedAt: '2026-11-09T08:31:00.000Z',
        gateway: { status: 'unknown', lastSuccessfulCommunicationAt: null },
        middlewareApi: { status: 'reachable', processUptimeSeconds: 125.5 },
        database: { status: 'available' },
        zfplabserverEndpoint: { status: 'reachable' },
        g03Communication: { status: 'read_version_response_received' },
        physicalDevice: { status: 'healthy' },
        zohoBooks: { status: 'configured_unverified' },
        etims: { status: 'configured_unverified' },
        upstreamUptime: { status: 'unavailable', valueSeconds: null },
        observability: null,
      }).success,
    ).toBe(false)
  })

  it('keeps device endpoint reachability separate from physical readiness', () => {
    expect(
      dashboardDeviceDiagnosticsSchema.safeParse({
        availability: 'partial',
        checkedAt: '2026-11-09T08:31:00.000Z',
        endpointReachability: { status: 'reachable' },
        deviceIdentity: { status: 'unavailable', reason: 'Identity is not persisted.' },
        serialNumber: null,
        lastCommunication: { status: 'unavailable', lastCommunicationAt: null },
        physicalHealth: { status: 'unverified' },
        fiscalizationReadiness: { status: 'unknown' },
        etimsPairing: { status: 'unknown' },
        healthHistory: { status: 'unavailable' },
      }).success,
    ).toBe(true)
  })

  it('accepts explicit overview unavailability and rejects unsupported guessed aggregates', () => {
    expect(
      dashboardOverviewSchema.safeParse({
        availability: 'unavailable',
        generatedAt: '2026-11-09T08:31:00.000Z',
        reason: 'Persisted aggregate query is not configured.',
      }).success,
    ).toBe(true)
    expect(
      dashboardOverviewSchema.safeParse({
        availability: 'available',
        generatedAt: '2026-11-09T08:31:00.000Z',
        uptimePercent: 99.9,
      }).success,
    ).toBe(false)

    expect(
      dashboardOverviewSchema.safeParse({
        availability: 'available',
        generatedAt: '2026-11-09T08:31:00.000Z',
        range: {
          createdFrom: '2026-11-01T00:00:00.000Z',
          createdTo: '2026-11-09T00:00:00.000Z',
        },
        metrics: {
          invoices: {
            totalRequests: 0,
            requestsByStatus: {},
            transmissionByStatus: {},
            reconciliationByStatus: {},
            writebackByStatus: {},
            confirmedReceiptCount: 0,
          },
          creditNotes: {
            totalRequests: 0,
            requestsByState: {},
            reconciliationByStatus: {},
            writebackByStatus: {},
            confirmedReceiptCount: 0,
          },
        },
        sources: {
          invoices: { source: 'FiscalizationRecord', calculation: 'groupBy within range' },
          creditNotes: {
            source: 'ZohoCreditNoteFiscalizationRequest',
            calculation: 'groupBy within range',
          },
        },
        unavailableMetrics: ['transaction_value', 'historical_uptime'],
      }).success,
    ).toBe(true)
  })

  it('validates every capability marker without inventing a queue or event feed', () => {
    const capability = { status: 'unavailable', source: 'No persisted source is configured.' }
    expect(
      dashboardCapabilitiesSchema.safeParse({
        generatedAt: '2026-11-09T08:31:00.000Z',
        capabilities: {
          invoiceHistory: { status: 'available', source: 'Persisted invoice requests.' },
          invoiceDetails: { status: 'available', source: 'Persisted invoice details.' },
          creditNoteHistory: {
            status: 'unavailable',
            source: 'Persisted credit-note request repository.',
            reason: 'History query is not configured.',
          },
          creditNoteDetails: { status: 'available', source: 'Persisted request details.' },
          writebackListing: capability,
          manualReview: { status: 'unavailable', source: 'Manual-review repository unavailable.' },
          reconciliation: {
            status: 'partial',
            source: 'Persisted request/eTIMS evidence.',
            reason: 'No complete list is configured.',
          },
          serviceHealth: { status: 'unavailable', source: 'No snapshot supplied.' },
          deviceFleet: { status: 'unavailable', source: 'No identity/history source.' },
          queueDepth: capability,
          systemEvents: capability,
          overviewAggregates: {
            status: 'unavailable',
            source: 'No persisted aggregate query.',
            reason: 'Aggregation not configured.',
          },
        },
      }).success,
    ).toBe(true)
  })
})

describe('verified transaction detail contracts', () => {
  it('accepts invoice details only with explicit evidence and timeline fields', () => {
    expect(
      dashboardInvoiceDetailSchema.safeParse({
        request: {
          requestId: 'req-detail',
          documentType: 'invoice',
          zohoDocumentId: 'zoho-1',
          documentNumber: null,
          customerName: null,
          amount: null,
          currency: null,
          fiscalizationStatus: 'OutcomeUnknown',
          transmissionStatus: 'TRANSMISSION_PENDING',
          reconciliationStatus: 'pending',
          writebackStatus: 'not_attempted',
          confirmedReceiptEvidence: false,
          receiptNumber: null,
          qrCode: null,
          fiscalizedAt: null,
          createdAt: '2026-11-09T08:30:00.000Z',
          updatedAt: '2026-11-09T08:31:00.000Z',
          attemptCount: 0,
          lastError: null,
          correlationId: null,
          snapshot: null,
          attempts: [],
          evidence: null,
          etims: null,
          writeback: null,
          manualReview: null,
          timeline: [
            {
              event: 'request_received',
              timestamp: '2026-11-09T08:30:00.000Z',
              status: 'persisted',
            },
          ],
        },
      }).success,
    ).toBe(true)
  })

  it('accepts confirmed credit-note evidence when the persisted CU serial is unavailable', () => {
    expect(
      dashboardCreditNoteDetailSchema.safeParse({
        request: {
          requestId: 'cn-detail',
          documentType: 'credit_note',
          zohoDocumentId: 'zoho-cn-1',
          documentNumber: 'CN-1',
          customerName: null,
          originalInvoice: {
            zohoInvoiceId: 'zoho-inv-1',
            invoiceNumber: 'INV-1',
            cuReceiptNumber: null,
          },
          amount: '10.00',
          currency: 'KES',
          fiscalizationStatus: 'WRITEBACK_PENDING',
          transmissionStatus: null,
          reconciliationStatus: null,
          writebackStatus: 'pending',
          confirmedReceiptEvidence: true,
          receiptNumber: 'CU-RECEIPT-1',
          cuSerialNumber: null,
          qrCode: 'https://etims.example.test/receipt/CU-RECEIPT-1',
          fiscalizedAt: '2026-11-09T08:31:00.000Z',
          createdAt: '2026-11-09T08:30:00.000Z',
          updatedAt: '2026-11-09T08:31:00.000Z',
          attemptCount: 0,
          lastError: null,
          snapshot: {
            documentNumber: 'CN-1',
            date: '2026-11-09',
            currency: 'KES',
            subtotal: '10.00',
            taxTotal: '0.00',
            amount: '10.00',
            lines: [],
          },
          attempts: [],
          evidence: {
            receiptNumber: 'CU-RECEIPT-1',
            cuSerialNumber: null,
            qrCode: 'https://etims.example.test/receipt/CU-RECEIPT-1',
            fiscalizedAt: '2026-11-09T08:31:00.000Z',
            transmissionStatus: 'TRANSMISSION_CONFIRMED',
            persistedEvidence: true,
          },
          writeback: null,
          diagnostics: [],
        },
      }).success,
    ).toBe(true)
  })
})
