import type { ZodType } from 'zod'
import { ApiError } from '@/lib/api/client'
import {
  dashboardCapabilitiesSchema,
  dashboardCreditNoteDetailSchema,
  dashboardCreditNotePageSchema,
  dashboardDeviceDiagnosticsSchema,
  dashboardInvoiceDetailSchema,
  dashboardInvoicePageSchema,
  dashboardManualReviewSchema,
  dashboardOverviewSchema,
  dashboardReconciliationSchema,
  dashboardServiceHealthSchema,
  dashboardWritebacksUnavailableSchema,
} from './schemas'
import {
  mockCapabilities,
  mockCreditNoteDetails,
  mockCreditNotes,
  mockDeviceDiagnostics,
  mockInvoiceDetails,
  mockInvoices,
  mockManualReview,
  mockOverview,
  mockReconciliation,
  mockServiceHealth,
} from './mock-api-fixtures'

/** Only local Vite development may use fixture-backed API responses. */
export const localMockApiEnabled = import.meta.env.DEV && import.meta.env.VITE_DATA_MODE === 'mock'

type PageQuery = {
  page: number
  pageSize: number
  search?: string
  createdFrom?: string
  createdTo?: string
}

function parsePageQuery(url: URL): PageQuery {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.max(1, Math.min(100, Number(url.searchParams.get('pageSize')) || 25))
  return {
    page,
    pageSize,
    ...(url.searchParams.get('search') ? { search: url.searchParams.get('search')! } : {}),
    ...(url.searchParams.get('createdFrom')
      ? { createdFrom: url.searchParams.get('createdFrom')! }
      : {}),
    ...(url.searchParams.get('createdTo') ? { createdTo: url.searchParams.get('createdTo')! } : {}),
  }
}

function isWithinRange(value: string, from?: string, to?: string) {
  const timestamp = Date.parse(value)
  return (!from || timestamp >= Date.parse(from)) && (!to || timestamp <= Date.parse(to))
}

function includesSearch(record: object, search?: string) {
  return !search || JSON.stringify(record).toLowerCase().includes(search.toLowerCase())
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const offset = (page - 1) * pageSize
  return { page, pageSize, total: items.length, items: items.slice(offset, offset + pageSize) }
}

function mockResponse(path: string): unknown {
  const url = new URL(path, 'http://local-dashboard.invalid')
  const route = url.pathname

  if (route === '/api/dashboard/capabilities') return mockCapabilities
  if (route === '/api/dashboard/invoices') {
    const query = parsePageQuery(url)
    const items = mockInvoices.filter(
      (item) =>
        includesSearch(item, query.search) &&
        isWithinRange(item.createdAt, query.createdFrom, query.createdTo) &&
        (!url.searchParams.has('status') ||
          item.fiscalizationStatus === url.searchParams.get('status')) &&
        (!url.searchParams.has('transmissionStatus') ||
          item.transmissionStatus === url.searchParams.get('transmissionStatus')) &&
        (!url.searchParams.has('reconciliationStatus') ||
          item.reconciliationStatus === url.searchParams.get('reconciliationStatus')) &&
        (!url.searchParams.has('writebackStatus') ||
          item.writebackStatus === url.searchParams.get('writebackStatus')),
    )
    return paginate(items, query.page, query.pageSize)
  }
  const invoiceDetail = route.match(/^\/api\/dashboard\/invoices\/([^/]+)$/)
  if (invoiceDetail) return mockInvoiceDetails[decodeURIComponent(invoiceDetail[1]!)]

  if (route === '/api/dashboard/credit-notes') {
    const query = parsePageQuery(url)
    const items = mockCreditNotes.filter(
      (item) =>
        includesSearch(item, query.search) &&
        isWithinRange(item.createdAt, query.createdFrom, query.createdTo) &&
        (!url.searchParams.has('state') ||
          item.fiscalizationStatus === url.searchParams.get('state')) &&
        (!url.searchParams.has('reconciliationState') ||
          item.reconciliationStatus === url.searchParams.get('reconciliationState')) &&
        (!url.searchParams.has('writebackState') ||
          item.writebackStatus.toUpperCase() === url.searchParams.get('writebackState')),
    )
    return paginate(items, query.page, query.pageSize)
  }
  const creditNoteDetail = route.match(/^\/api\/dashboard\/credit-notes\/([^/]+)$/)
  if (creditNoteDetail) return mockCreditNoteDetails[decodeURIComponent(creditNoteDetail[1]!)]

  if (route === '/api/dashboard/overview') {
    const createdFrom = url.searchParams.get('createdFrom')
    const createdTo = url.searchParams.get('createdTo')
    if (!createdFrom || !createdTo) {
      throw new ApiError('The local dashboard overview requires a date range.', 400)
    }
    return mockOverview(createdFrom, createdTo)
  }
  if (route === '/api/dashboard/writebacks') {
    return {
      availability: 'unavailable',
      reason: 'DEMO ONLY: no independent writeback collection fixture is defined.',
    }
  }
  if (route === '/api/dashboard/manual-review') {
    const query = parsePageQuery(url)
    const offset = (query.page - 1) * query.pageSize
    const reviewItems = mockManualReview.availability === 'partial' ? mockManualReview.items : []
    const items = reviewItems.slice(offset, offset + query.pageSize)
    return {
      availability: 'partial',
      page: query.page,
      pageSize: query.pageSize,
      total: null,
      hasMore: offset + items.length < reviewItems.length,
      items,
    }
  }
  if (route === '/api/dashboard/reconciliation') return mockReconciliation
  if (route === '/api/dashboard/device') return mockDeviceDiagnostics
  if (route === '/api/dashboard/services') return mockServiceHealth

  throw new ApiError('The local dashboard mock route was not found.', 404)
}

/** Route dashboard reads to local fixture responses without invoking browser fetch. */
export async function getMockDashboardJson<T>(
  path: string,
  schema: ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!localMockApiEnabled) {
    throw new ApiError(
      'Local dashboard fixtures are available only in Vite development mock mode.',
      403,
    )
  }
  if (signal?.aborted) throw new ApiError('Request was cancelled.', undefined, 'cancelled')
  const payload = mockResponse(path)
  if (payload === undefined)
    throw new ApiError('The local dashboard mock record was not found.', 404)
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    throw new ApiError(
      'Local dashboard fixture does not match the response contract.',
      undefined,
      'contract',
    )
  }
  return parsed.data
}

/** Public helper for fixture contract tests. */
export const mockFixtureSchemas = {
  capabilities: dashboardCapabilitiesSchema,
  invoices: dashboardInvoicePageSchema,
  invoiceDetail: dashboardInvoiceDetailSchema,
  creditNotes: dashboardCreditNotePageSchema,
  creditNoteDetail: dashboardCreditNoteDetailSchema,
  overview: dashboardOverviewSchema,
  writebacks: dashboardWritebacksUnavailableSchema,
  manualReview: dashboardManualReviewSchema,
  reconciliation: dashboardReconciliationSchema,
  device: dashboardDeviceDiagnosticsSchema,
  services: dashboardServiceHealthSchema,
}
