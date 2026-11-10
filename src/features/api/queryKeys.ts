export const apiQueryKeys = {
  all: ['middleware'] as const,
  health: () => [...apiQueryKeys.all, 'health'] as const,
  liveness: () => [...apiQueryKeys.health(), 'liveness'] as const,
  readiness: () => [...apiQueryKeys.health(), 'readiness'] as const,
  dependencies: () => [...apiQueryKeys.health(), 'dependencies'] as const,
  integrations: () => [...apiQueryKeys.health(), 'integrations'] as const,
  device: () => [...apiQueryKeys.health(), 'device'] as const,
  fiscalization: () => [...apiQueryKeys.all, 'fiscalization'] as const,
  fiscalizationHistory: (params: object) =>
    [...apiQueryKeys.fiscalization(), 'history', params] as const,
  dashboard: () => [...apiQueryKeys.all, 'dashboard'] as const,
  dashboardOverview: (params: object) => [...apiQueryKeys.dashboard(), 'overview', params] as const,
  dashboardInvoices: (params: object) => [...apiQueryKeys.dashboard(), 'invoices', params] as const,
  dashboardInvoice: (requestId: string) =>
    [...apiQueryKeys.dashboard(), 'invoice', requestId] as const,
  dashboardCreditNotes: (params: object) =>
    [...apiQueryKeys.dashboard(), 'credit-notes', params] as const,
  dashboardCreditNote: (requestId: string) =>
    [...apiQueryKeys.dashboard(), 'credit-note', requestId] as const,
  dashboardWritebacks: (params: object) =>
    [...apiQueryKeys.dashboard(), 'writebacks', params] as const,
  dashboardManualReview: (params: object) =>
    [...apiQueryKeys.dashboard(), 'manual-review', params] as const,
  dashboardReconciliation: (params: object) =>
    [...apiQueryKeys.dashboard(), 'reconciliation', params] as const,
  dashboardDevice: () => [...apiQueryKeys.dashboard(), 'device'] as const,
  dashboardServices: () => [...apiQueryKeys.dashboard(), 'services'] as const,
  dashboardCapabilities: () => [...apiQueryKeys.dashboard(), 'capabilities'] as const,
  manualReview: () => [...apiQueryKeys.all, 'manual-review'] as const,
  manualReviewCases: (limit: number, offset: number) =>
    [...apiQueryKeys.manualReview(), 'cases', { limit, offset }] as const,
  manualReviewByRequest: (requestId: string) =>
    [...apiQueryKeys.manualReview(), 'request', requestId] as const,
  manualReviewByCase: (caseId: string) => [...apiQueryKeys.manualReview(), 'case', caseId] as const,
  metrics: () => [...apiQueryKeys.all, 'metrics'] as const,
}
