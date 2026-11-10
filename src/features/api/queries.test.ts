import { describe, expect, it } from 'vitest'
import { apiQueryKeys } from './queryKeys'
import {
  buildDashboardCreditNoteListPath,
  buildDashboardInvoiceListPath,
  buildDashboardManualReviewPath,
  buildDashboardOverviewPath,
  toQueryString,
} from './queries'

describe('dashboard API query contracts', () => {
  it('serializes provided pagination, search, status and date filters only', () => {
    expect(
      toQueryString({
        page: 2,
        pageSize: 50,
        search: 'CN/2026 #7',
        status: 'OutcomeUnknown',
        createdFrom: '2026-11-01T00:00:00.000Z',
        createdTo: undefined,
      }),
    ).toBe(
      '?page=2&pageSize=50&search=CN%2F2026+%237&status=OutcomeUnknown&createdFrom=2026-11-01T00%3A00%3A00.000Z',
    )
  })

  it('uses separate query cache entries for different filters and pages', () => {
    const pageOne = apiQueryKeys.dashboardInvoices({ page: 1, status: 'Pending' })
    const pageTwo = apiQueryKeys.dashboardInvoices({ page: 2, status: 'Pending' })
    const failed = apiQueryKeys.dashboardInvoices({ page: 1, status: 'Failed' })

    expect(pageOne).not.toEqual(pageTwo)
    expect(pageOne).not.toEqual(failed)
  })

  it('builds the invoice list request with verified filters and bounded pagination', () => {
    const path = buildDashboardInvoiceListPath({
      page: 2,
      pageSize: 50,
      search: ' INV-42 ',
      status: 'Failed',
      transmissionStatus: 'TRANSMISSION_PENDING',
      createdFrom: '2026-11-01T00:00:00.000Z',
    })
    const query = new URLSearchParams(path.split('?')[1])

    expect(path).toContain('/api/dashboard/invoices?')
    expect(Object.fromEntries(query)).toEqual({
      page: '2',
      pageSize: '50',
      search: 'INV-42',
      createdFrom: '2026-11-01T00:00:00.000Z',
      status: 'Failed',
      transmissionStatus: 'TRANSMISSION_PENDING',
    })
  })

  it('builds credit-note filters without adding unsupported invoice parameters', () => {
    const path = buildDashboardCreditNoteListPath({
      page: 1,
      pageSize: 25,
      state: 'WRITEBACK_PENDING',
      reconciliationState: 'RECONCILIATION_REQUIRED',
      writebackState: 'PENDING',
    })

    expect(path).toContain('/api/dashboard/credit-notes?')
    expect(new URLSearchParams(path.split('?')[1]).get('state')).toBe('WRITEBACK_PENDING')
    expect(new URLSearchParams(path.split('?')[1]).get('writebackState')).toBe('PENDING')
    expect(new URLSearchParams(path.split('?')[1]).has('status')).toBe(false)
  })

  it('supports the invoice pending alias without changing the persisted not-attempted status', () => {
    expect(
      buildDashboardInvoiceListPath({
        page: 1,
        pageSize: 25,
        writebackStatus: 'pending',
      }),
    ).toContain('writebackStatus=pending')
  })

  it('uses required bounded date filters for overview and default pagination for manual review', () => {
    expect(
      buildDashboardOverviewPath({
        createdFrom: '2026-11-01T00:00:00.000Z',
        createdTo: '2026-11-09T00:00:00.000Z',
      }),
    ).toContain('/api/dashboard/overview?createdFrom=')
    expect(buildDashboardManualReviewPath({})).toBe(
      '/api/dashboard/manual-review?page=1&pageSize=25',
    )
  })

  it('rejects unsupported invoice query keys and date windows beyond the backend limit', () => {
    expect(() =>
      buildDashboardInvoiceListPath({
        page: 1,
        pageSize: 25,
        status: 'Failed',
        unknownFilter: 'fake',
      } as never),
    ).toThrow()

    expect(() =>
      buildDashboardOverviewPath({
        createdFrom: '2025-10-01T00:00:00.000Z',
        createdTo: '2026-11-09T00:00:00.000Z',
      }),
    ).toThrow()
  })
})
