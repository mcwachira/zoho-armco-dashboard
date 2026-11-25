import { describe, expect, it } from 'vitest'
import { dashboardEventsPageSchema, writebackOperationsPageSchema } from './operation-contracts'

const writeback = {
  writebackId: 'writeback-test-1',
  documentType: 'credit_note',
  documentId: 'zoho-credit-note-test-1',
  requestId: null,
  status: 'failed',
  errorCategory: null,
  retryCount: 1,
  providerExchangeCount: 2,
  nextRetryAt: null,
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
  completedAt: null,
}

describe('operational response contracts', () => {
  it('accepts events with nullable identifiers, structured metadata, and pagination', () => {
    expect(
      dashboardEventsPageSchema.safeParse({
        page: 1,
        pageSize: 25,
        total: 1,
        items: [
          {
            eventId: 'event-1',
            eventType: 'attempt_failed',
            timestamp: '2026-11-20T10:00:00.000Z',
            documentType: null,
            documentId: null,
            requestId: null,
            message: 'Attempt failed.',
            metadata: { attempts: [1, 2], details: { verified: false } },
          },
        ],
      }).success,
    ).toBe(true)
    expect(
      dashboardEventsPageSchema.safeParse({ page: 1, pageSize: 25, total: 0, items: [] }).success,
    ).toBe(true)
    expect(
      dashboardEventsPageSchema.safeParse({
        page: 1,
        pageSize: 25,
        total: 1,
        items: [{ eventId: 'event-1' }],
      }).success,
    ).toBe(false)
  })

  it('accepts older writeback rows and nullable or optional extended DTO fields', () => {
    expect(
      writebackOperationsPageSchema.safeParse({
        page: 1,
        pageSize: 1,
        total: 1,
        items: [writeback],
      }).success,
    ).toBe(true)
    expect(
      writebackOperationsPageSchema.safeParse({
        page: 1,
        pageSize: 1,
        total: 1,
        items: [
          {
            ...writeback,
            metrics: null,
            errorDetails: null,
            fieldsWritten: null,
            fieldsRemaining: ['CU receipt number'],
            manualInterventionRequired: null,
          },
        ],
      }).success,
    ).toBe(true)
    expect(
      writebackOperationsPageSchema.safeParse({
        page: 1,
        pageSize: 1,
        total: 1,
        items: [{ ...writeback, fieldsRemaining: 'CU receipt number' }],
      }).success,
    ).toBe(false)
  })
})
