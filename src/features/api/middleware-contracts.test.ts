import { describe, expect, it } from 'vitest'
import {
  middlewareRequestPageSchema,
  middlewareRequestQuerySchema,
  middlewareWritebackSchema,
  operationalMetricsSchema,
  dashboardInvoiceItemSchema,
  dashboardCreditNoteItemSchema,
} from './schemas'
import { mockCreditNotes, mockInvoices } from './mock-api-fixtures'

describe('published middleware operational contracts', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,unsafe',
    'file:///etc/passwd',
    'https://user:secret@example.test/receipt',
    'https://user@example.test/receipt',
    'invalid-url',
  ])('rejects unsafe fiscal links in both document registers: %s', (qrCode) => {
    expect(dashboardInvoiceItemSchema.safeParse({ ...mockInvoices[0], qrCode }).success).toBe(false)
    expect(dashboardCreditNoteItemSchema.safeParse({ ...mockCreditNotes[0], qrCode }).success).toBe(
      false,
    )
  })
  it.each(['http://example.test/receipt', 'https://example.test/receipt'])(
    'accepts web receipt links: %s',
    (qrCode) => {
      expect(dashboardInvoiceItemSchema.safeParse({ ...mockInvoices[0], qrCode }).success).toBe(
        true,
      )
    },
  )
  it('rejects unbounded telemetry names and undocumented snapshot fields', () => {
    const snapshot = {
      counters: { 'http_requests.2xx': 0 },
      jobs: {},
      httpDurationMs: {
        count: 0,
        sum: 0,
        buckets: {
          '10': 0,
          '50': 0,
          '100': 0,
          '250': 0,
          '500': 0,
          '1000': 0,
          '5000': 0,
          '+Inf': 0,
        },
      },
    }
    expect(operationalMetricsSchema.safeParse(snapshot).success).toBe(true)
    expect(
      operationalMetricsSchema.safeParse({ ...snapshot, counters: { 'http_requests.secret': 1 } })
        .success,
    ).toBe(false)
    expect(operationalMetricsSchema.safeParse({ ...snapshot, jobs: { secret: {} } }).success).toBe(
      false,
    )
    expect(
      operationalMetricsSchema.safeParse({ ...snapshot, authorization: 'secret' }).success,
    ).toBe(false)
    expect(
      operationalMetricsSchema.safeParse({
        ...snapshot,
        httpDurationMs: { ...snapshot.httpDurationMs, buckets: {} },
      }).success,
    ).toBe(false)
  })
  it('validates request history statuses and rejects unrecognized payload fields', () => {
    const row = {
      id: 'request-1',
      zohoInvoiceId: 'zoho-1',
      status: 'Pending',
      deviceOutcome: 'Pending',
      etimsOutcome: 'not_configured',
      createdAt: '2026-11-14T10:00:00Z',
      updatedAt: '2026-11-14T10:00:00Z',
      deviceAttempts: [],
    }
    expect(
      middlewareRequestPageSchema.safeParse({ page: 1, pageSize: 25, total: 1, items: [row] })
        .success,
    ).toBe(true)
    expect(
      middlewareRequestPageSchema.safeParse({
        page: 1,
        pageSize: 25,
        total: 1,
        items: [{ ...row, status: 'Completed' }],
      }).success,
    ).toBe(false)
    expect(
      middlewareRequestPageSchema.safeParse({
        page: 1,
        pageSize: 25,
        total: 1,
        items: [{ ...row, authorization: 'secret' }],
      }).success,
    ).toBe(false)
  })
  it('rejects unsupported filters and reversed date windows', () => {
    expect(middlewareRequestQuerySchema.safeParse({ search: 'INV-1' }).success).toBe(false)
    expect(
      middlewareRequestQuerySchema.safeParse({ status: 'Pending', deviceOutcome: 'Failed' })
        .success,
    ).toBe(false)
    expect(
      middlewareRequestQuerySchema.safeParse({
        createdFrom: '2026-11-14T10:00:00Z',
        createdTo: '2026-11-13T10:00:00Z',
      }).success,
    ).toBe(false)
  })
  it('keeps in-progress writeback distinct from successful field writes', () => {
    expect(
      middlewareWritebackSchema.parse({
        status: 'in_progress',
        requestId: 'request-1',
        correlationId: 'correlation-1',
        fieldsWritten: 0,
        errorCategory: null,
      }).status,
    ).toBe('in_progress')
    expect(
      middlewareWritebackSchema.parse({
        status: 'not_eligible',
        requestId: 'request-1',
        reason: 'writeback_not_started',
      }).status,
    ).toBe('not_eligible')
    expect(
      middlewareWritebackSchema.safeParse({ status: 'succeeded', requestId: 'request-1' }).success,
    ).toBe(false)
  })
})
