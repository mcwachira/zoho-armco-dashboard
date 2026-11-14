import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiMode, getJson } from '@/lib/api/client'
import { apiQueryKeys } from './queryKeys'
import { refreshIntervalMs } from '@/lib/config'
import {
  dashboardCapabilitiesSchema,
  dashboardCreditNoteQueryParamsSchema,
  dashboardCreditNotePageSchema,
  dashboardCreditNoteDetailSchema,
  dashboardDeviceDiagnosticsSchema,
  dashboardServiceHealthSchema,
  dashboardInvoiceQueryParamsSchema,
  dashboardInvoicePageSchema,
  dashboardInvoiceDetailSchema,
  dashboardManualReviewQueryParamsSchema,
  dashboardManualReviewSchema,
  dashboardOverviewQueryParamsSchema,
  dashboardOverviewSchema,
  dashboardReconciliationSchema,
  dashboardWritebacksUnavailableSchema,
} from './schemas'
import type {
  DashboardCreditNoteState,
  DashboardInvoiceReconciliationStatus,
  DashboardInvoiceStatus,
  DashboardInvoiceTransmissionStatus,
  DashboardInvoiceWritebackFilter,
} from './schemas'
import type { ZodType } from 'zod'

export interface DashboardPageParams {
  page?: number
  pageSize?: number
  search?: string
  createdFrom?: string
  createdTo?: string
}

export interface DashboardInvoiceParams extends DashboardPageParams {
  status?: DashboardInvoiceStatus
  transmissionStatus?: DashboardInvoiceTransmissionStatus
  reconciliationStatus?: DashboardInvoiceReconciliationStatus
  writebackStatus?: DashboardInvoiceWritebackFilter
}

export interface DashboardCreditNoteParams extends DashboardPageParams {
  state?: DashboardCreditNoteState
  reconciliationState?: string
  writebackState?: string
}

export interface DashboardOverviewParams {
  createdFrom: string
  createdTo: string
}

export interface DashboardManualReviewParams {
  page?: number
  pageSize?: number
}

const polling = {
  staleTime: Math.min(20_000, refreshIntervalMs),
  refetchInterval: refreshIntervalMs,
  retry: 1,
} as const

const localMockApiEnabled = import.meta.env.DEV && import.meta.env.VITE_DATA_MODE === 'mock'

function queryOptions(enabled = true, allowLocalMock = false) {
  return {
    ...polling,
    enabled: (apiMode === 'api' || (allowLocalMock && localMockApiEnabled)) && enabled,
  } as const
}

function getDashboardJson<T>(path: string, schema: ZodType<T>, signal?: AbortSignal) {
  if (localMockApiEnabled) {
    return import('./mock-api-adapter').then(({ getMockDashboardJson }) =>
      getMockDashboardJson(path, schema, signal),
    )
  }
  return getJson(path, schema, signal)
}

export function toQueryString(params: object) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const value = search.toString()
  return value ? `?${value}` : ''
}

function omitEmptyQueryValues<T extends object>(params: T) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
  )
}

export function buildDashboardInvoiceListPath(params: DashboardInvoiceParams) {
  const normalized = omitEmptyQueryValues(params)
  return `/api/dashboard/invoices${toQueryString(dashboardInvoiceQueryParamsSchema.parse(normalized))}`
}

export function buildDashboardCreditNoteListPath(params: DashboardCreditNoteParams) {
  const normalized = omitEmptyQueryValues(params)
  return `/api/dashboard/credit-notes${toQueryString(dashboardCreditNoteQueryParamsSchema.parse(normalized))}`
}

export function buildDashboardOverviewPath(params: DashboardOverviewParams) {
  return `/api/dashboard/overview${toQueryString(dashboardOverviewQueryParamsSchema.parse(params))}`
}

export function buildDashboardManualReviewPath(params: DashboardManualReviewParams) {
  const normalized = omitEmptyQueryValues(params)
  return `/api/dashboard/manual-review${toQueryString(dashboardManualReviewQueryParamsSchema.parse(normalized))}`
}

function withFreshness<T extends { dataUpdatedAt: number; isFetching: boolean; data: unknown }>(
  query: T,
) {
  return {
    ...query,
    lastUpdatedAt: query.dataUpdatedAt > 0 ? new Date(query.dataUpdatedAt) : null,
    isRefreshing: query.isFetching && query.data !== undefined,
  }
}

function useDashboardRead<T>(
  queryKey: readonly unknown[],
  path: string | (() => string),
  schema: ZodType<T>,
  enabled = true,
) {
  return withFreshness(
    useQuery({
      queryKey,
      queryFn: ({ signal }) =>
        getDashboardJson(typeof path === 'function' ? path() : path, schema, signal),
      ...queryOptions(enabled, true),
    }),
  )
}

export function useDeviceHealthQuery() {
  return useQuery({
    queryKey: apiQueryKeys.device(),
    queryFn: ({ signal }) =>
      getDashboardJson('/api/dashboard/device', dashboardDeviceDiagnosticsSchema, signal),
    ...queryOptions(),
  })
}

/** Read-only invoices from the authenticated dashboard API namespace. */
export function useDashboardInvoiceListQuery(params: DashboardInvoiceParams = {}, enabled = true) {
  const query = { ...params, page: params.page ?? 1, pageSize: params.pageSize ?? 25 }
  const result = useQuery({
    queryKey: apiQueryKeys.dashboardInvoices(query),
    queryFn: ({ signal }) =>
      getDashboardJson(buildDashboardInvoiceListPath(query), dashboardInvoicePageSchema, signal),
    ...queryOptions(enabled, true),
  })
  return withFreshness(result)
}

/** Read-only credit-note requests from the authenticated dashboard API namespace. */
export function useDashboardCreditNoteListQuery(
  params: DashboardCreditNoteParams = {},
  enabled = true,
) {
  const query = { ...params, page: params.page ?? 1, pageSize: params.pageSize ?? 25 }
  const result = useQuery({
    queryKey: apiQueryKeys.dashboardCreditNotes(query),
    queryFn: ({ signal }) =>
      getDashboardJson(
        buildDashboardCreditNoteListPath(query),
        dashboardCreditNotePageSchema,
        signal,
      ),
    ...queryOptions(enabled, true),
  })
  return withFreshness(result)
}

export function useDashboardInvoiceDetailQuery(requestId: string) {
  return useDashboardRead(
    apiQueryKeys.dashboardInvoice(requestId),
    `/api/dashboard/invoices/${encodeURIComponent(requestId)}`,
    dashboardInvoiceDetailSchema,
    Boolean(requestId),
  )
}

export function useDashboardCreditNoteDetailQuery(requestId: string) {
  return useDashboardRead(
    apiQueryKeys.dashboardCreditNote(requestId),
    `/api/dashboard/credit-notes/${encodeURIComponent(requestId)}`,
    dashboardCreditNoteDetailSchema,
    Boolean(requestId),
  )
}

export function useDashboardOverviewQuery(params: DashboardOverviewParams) {
  return useDashboardRead(
    apiQueryKeys.dashboardOverview(params),
    () => buildDashboardOverviewPath(params),
    dashboardOverviewSchema,
    Boolean(params.createdFrom && params.createdTo),
  )
}

export function useDashboardCapabilitiesQuery() {
  return useDashboardRead(
    apiQueryKeys.dashboardCapabilities(),
    '/api/dashboard/capabilities',
    dashboardCapabilitiesSchema,
  )
}

export function useDashboardWritebacksQuery() {
  return useDashboardRead(
    apiQueryKeys.dashboardWritebacks({}),
    '/api/dashboard/writebacks',
    dashboardWritebacksUnavailableSchema,
  )
}

export function useDashboardManualReviewQuery(
  params: DashboardManualReviewParams = {},
  enabled = true,
) {
  const query = { page: params.page ?? 1, pageSize: params.pageSize ?? 25 }
  // Preserve local fixture views without requesting a nonexistent backend route.
  return withFreshness(
    useQuery({
      queryKey: apiQueryKeys.dashboardManualReview(query),
      queryFn: ({ signal }) =>
        localMockApiEnabled
          ? getDashboardJson(
              buildDashboardManualReviewPath(query),
              dashboardManualReviewSchema,
              signal,
            )
          : Promise.resolve(
              dashboardManualReviewSchema.parse({
                availability: 'unavailable',
                reason: 'The middleware does not expose a standalone manual-review collection.',
              }),
            ),
      ...queryOptions(enabled, true),
      refetchInterval: localMockApiEnabled ? refreshIntervalMs : false,
    }),
  )
}

export function useDashboardReconciliationQuery() {
  return useDashboardRead(
    apiQueryKeys.dashboardReconciliation({}),
    '/api/dashboard/reconciliation',
    dashboardReconciliationSchema,
  )
}

export function useDashboardDeviceDiagnosticsQuery() {
  return useDashboardRead(
    apiQueryKeys.dashboardDevice(),
    '/api/dashboard/device',
    dashboardDeviceDiagnosticsSchema,
  )
}

export function useDashboardServiceHealthQuery() {
  return useDashboardRead(
    apiQueryKeys.dashboardServices(),
    '/api/dashboard/services',
    dashboardServiceHealthSchema,
  )
}

/** Invalidates only middleware-backed queries; mock snapshots are never fetched as fallback. */
export function useRefreshMiddlewareData() {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({
      queryKey: apiQueryKeys.all,
      refetchType: 'active',
    })
}
