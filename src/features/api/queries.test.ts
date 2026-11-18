import { describe, expect, it, vi } from 'vitest'
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

  it('enforces documented manual-review paging and forwards its status/date filters', () => {
    expect(() => buildDashboardManualReviewPath({ page: 101 })).toThrow()
    expect(() => buildDashboardManualReviewPath({ status: 'closed' } as never)).toThrow()
    const query = new URLSearchParams(
      buildDashboardManualReviewPath({
        status: 'open',
        createdFrom: '2026-01-01T00:00:00Z',
        createdTo: '2026-11-15T23:59:59Z',
      }).split('?')[1],
    )
    expect(query.get('status')).toBe('open')
    expect(query.get('createdFrom')).toBe('2026-01-01T00:00:00Z')
    expect(() =>
      buildDashboardManualReviewPath({
        createdFrom: '2026-11-15T00:00:00Z',
        createdTo: '2026-11-14T00:00:00Z',
      }),
    ).toThrow()
  })
})

describe('Overview calendar date serialization', () => {
  it('encodes Nairobi midnight and the final millisecond without shifting selected dates', () => {
    const path = buildDashboardOverviewPath({
      createdFrom: '2026-11-01',
      createdTo: '2026-11-18',
    })
    expect(path).toBe(
      '/api/dashboard/overview?createdFrom=2026-11-01T00%3A00%3A00.000%2B03%3A00&createdTo=2026-11-18T23%3A59%3A59.999%2B03%3A00',
    )
    const query = new URL(path, 'https://dashboard.test').searchParams
    expect([...query.keys()]).toEqual(['createdFrom', 'createdTo'])
    expect(query.get('createdFrom')).toBe('2026-11-01T00:00:00.000+03:00')
    expect(query.get('createdTo')).toBe('2026-11-18T23:59:59.999+03:00')
    // These are the UTC instants of the selected Nairobi calendar boundaries.
    expect(new Date(query.get('createdFrom')!).toISOString()).toBe('2026-10-31T21:00:00.000Z')
    expect(new Date(query.get('createdTo')!).toISOString()).toBe('2026-11-18T20:59:59.999Z')
  })

  it.each(['America/Los_Angeles', 'Asia/Tokyo', 'UTC'])(
    'does not use the host timezone (%s) to interpret calendar inputs',
    (timeZone) => {
      vi.stubEnv('TZ', timeZone)
      try {
        const path = buildDashboardOverviewPath({
          createdFrom: '2026-01-01',
          createdTo: '2026-01-01',
        })
        const query = new URL(path, 'https://dashboard.test').searchParams
        expect(query.get('createdFrom')).toBe('2026-01-01T00:00:00.000+03:00')
        expect(query.get('createdTo')).toBe('2026-01-01T23:59:59.999+03:00')
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it('accepts a leap day and preserves the entire day', () => {
    const path = buildDashboardOverviewPath({
      createdFrom: '2024-02-29',
      createdTo: '2024-02-29',
    })
    const query = new URL(path, 'https://dashboard.test').searchParams
    expect(query.get('createdFrom')).toBe('2024-02-29T00:00:00.000+03:00')
    expect(query.get('createdTo')).toBe('2024-02-29T23:59:59.999+03:00')
  })

  it.each([
    ['2026-11-01T12:34:56.789Z', '2026-11-18T12:34:56.789Z'],
    ['2026-11-01T09:15:00.123+03:00', '2026-11-18T17:45:00.456+03:00'],
    ['2026-11-01T09:15:00.123-07:00', '2026-11-18T17:45:00.456-07:00'],
  ])('preserves existing datetime values %s to %s', (createdFrom, createdTo) => {
    const path = buildDashboardOverviewPath({ createdFrom, createdTo })
    const query = new URL(path, 'https://dashboard.test').searchParams
    expect(query.get('createdFrom')).toBe(createdFrom)
    expect(query.get('createdTo')).toBe(createdTo)
  })

  it.each([
    ['2026-11-19', '2026-11-18'],
    ['2026-02-30', '2026-11-18'],
    ['2026-11-01', '2026-02-29'],
    ['2026-13-01', '2026-11-18'],
    ['2026-11-1', '2026-11-18'],
    ['2026-11-01T00:00:00', '2026-11-18T23:59:59'],
    ['', '2026-11-18'],
    ['2026-11-01', ''],
    [undefined, '2026-11-18'],
    ['2026-11-01', undefined],
  ])('rejects invalid or missing bounds (%s, %s)', (createdFrom, createdTo) => {
    expect(() => buildDashboardOverviewPath({ createdFrom, createdTo } as never)).toThrow()
  })

  it('validates mixed calendar/datetime bounds by their actual instants', () => {
    expect(() =>
      buildDashboardOverviewPath({
        createdFrom: '2026-11-01',
        createdTo: '2026-11-01T00:00:00Z',
      }),
    ).not.toThrow()
    expect(() =>
      buildDashboardOverviewPath({
        createdFrom: '2026-11-01',
        createdTo: '2026-10-31T20:59:59.999Z',
      }),
    ).toThrow()
    expect(() =>
      buildDashboardOverviewPath({
        createdFrom: '2025-01-01',
        createdTo: '2026-11-18',
      }),
    ).toThrow()
    expect(() =>
      buildDashboardOverviewPath({
        createdFrom: '2026-11-01',
        createdTo: '2026-11-18',
        unexpected: 'ignored',
      } as never),
    ).toThrow()
  })
})
