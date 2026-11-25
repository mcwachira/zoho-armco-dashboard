import { z } from 'zod'

/** Schemas in this module follow documented OpenAPI responses or the inspected
 * read-only handler implementations. They intentionally do not add UI guesses. */

export const livenessSchema = z.object({ status: z.literal('ok') })
export const readinessSchema = z.object({ status: z.enum(['ready', 'not_ready']) })

export const middlewareHealthSchema = z
  .object({ status: z.enum(['ok', 'ready', 'not_ready']) })
  .strict()

// Receipt links are rendered as external browser links; URL syntax alone also
// accepts executable schemes and URLs containing embedded credentials.
const externalWebUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value)
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
    } catch {
      return false
    }
  }, 'Expected an HTTP(S) URL without embedded credentials.')

export const dependencyHealthSchema = z.object({
  status: z.literal('diagnostics_complete'),
  dependencies: z.object({
    database: z.enum(['available', 'unavailable', 'not_configured']),
    zfplabserverEndpoint: z.enum(['reachable', 'unavailable', 'not_configured']),
    g03Communication: z.enum(['read_version_response_received', 'not_configured', 'unavailable']),
    physicalDevice: z.literal('unverified'),
    zohoBooks: z.enum(['configured_unverified', 'not_configured']),
    etims: z.enum(['configured_unverified', 'not_configured']),
  }),
})

export const integrationHealthSchema = z.object({
  zohoBooks: z.enum(['configured_unverified', 'not_configured']),
  device: z.object({
    adapter: z.string(),
    transport: z.string(),
    simulationEnabled: z.boolean(),
    serverEndpoint: z.string(),
    diagnostics: z.enum(['configured_unverified', 'not_configured']),
    serviceEndpoint: z.literal('not_checked'),
    physicalDevice: z.literal('unverified'),
    fiscalReadiness: z.literal('unknown'),
    invoiceProcessingPath: z.enum(['configured', 'unavailable']),
    singleLineSdkCommand: z.enum(['configured', 'not_configured']),
    executionMode: z.string(),
    timsProcedure: z.literal('unverified'),
    blockers: z.array(z.string()),
  }),
  etims: z.object({
    enabled: z.boolean(),
    adapter: z.string().nullable(),
    status: z.string(),
    simulated: z.boolean(),
    blockers: z.array(z.string()),
    providerHealth: z.literal('unverified'),
    protocol: z.record(z.string(), z.unknown()),
    reconciliationWorker: z.object({
      enabled: z.boolean(),
      started: z.boolean(),
      reason: z.string(),
      job: z.unknown().nullable(),
    }),
  }),
})

export const deviceHealthSchema = z.object({
  status: z.enum(['endpoint_reachable', 'unavailable']),
  component: z.literal('zfplabserver_endpoint'),
  physicalDevice: z.literal('unverified'),
  fiscalReadiness: z.literal('unknown').optional(),
  reason: z.string().optional(),
})

export const fiscalizationHistoryItemSchema = z.object({
  id: z.string(),
  zohoInvoiceId: z.string(),
  status: z.string(),
  deviceOutcome: z.string(),
  etimsOutcome: z.string(),
  correlationId: z.string().nullable().optional(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  failureCode: z.string().nullable().optional(),
  deviceAttempts: z.array(
    z.object({
      attemptNumber: z.number().int(),
      outcome: z.string().nullable(),
      errorCode: z.string().nullable(),
    }),
  ),
})

export const fiscalizationHistoryPageSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  total: z.number().int().nonnegative(),
  items: z.array(fiscalizationHistoryItemSchema),
})

const dashboardTimestampSchema = z.string().datetime({ offset: true })

export const dashboardPageSchema = <T extends z.ZodType>(itemSchema: T) =>
  z
    .object({
      page: z.number().int().min(1),
      pageSize: z.number().int().min(1).max(100),
      total: z.number().int().nonnegative(),
      items: z.array(itemSchema),
    })
    .strict()

export const invoiceFiscalizationStatusSchema = z.enum([
  'Pending',
  'InProgress',
  'Succeeded',
  'Failed',
  'OutcomeUnknown',
])

export const invoiceTransmissionStatusSchema = z.enum([
  'TRANSMISSION_PENDING',
  'TRANSMISSION_CONFIRMED',
])

export const invoiceReconciliationStatusSchema = z.enum([
  'not_configured',
  'blocked',
  'pending',
  'in_progress',
  'accepted',
  'rejected',
  'outcome_unknown',
  'reconciliation_required',
  'reconciling',
])

export const dashboardWritebackStatusSchema = z.enum([
  'not_attempted',
  'pending',
  'in_progress',
  'succeeded',
  'failed',
  'outcome_unknown',
])
export const dashboardInvoiceWritebackFilterSchema = z.enum([
  'pending',
  'not_attempted',
  'in_progress',
  'succeeded',
  'failed',
  'outcome_unknown',
])
export const dashboardCreditNoteWritebackStatusSchema = z.enum([
  'not_attempted',
  'pending',
  'in_progress',
  'succeeded',
  'failed',
  'outcome_unknown',
])
export const dashboardWritebackOperationStatusSchema = z.enum([
  'pending',
  'in_progress',
  'succeeded',
  'failed',
  'outcome_unknown',
])

export const dashboardInvoiceItemSchema = z
  .object({
    requestId: z.string(),
    documentType: z.literal('invoice'),
    zohoDocumentId: z.string(),
    documentNumber: z.string().nullable(),
    customerName: z.string().nullable(),
    amount: z.string().nullable(),
    currency: z.string().nullable(),
    fiscalizationStatus: invoiceFiscalizationStatusSchema,
    transmissionStatus: invoiceTransmissionStatusSchema.nullable(),
    reconciliationStatus: invoiceReconciliationStatusSchema.nullable(),
    writebackStatus: dashboardWritebackStatusSchema,
    confirmedReceiptEvidence: z.boolean(),
    receiptNumber: z.string().nullable(),
    qrCode: externalWebUrlSchema.nullable(),
    fiscalizedAt: dashboardTimestampSchema.nullable(),
    createdAt: dashboardTimestampSchema,
    updatedAt: dashboardTimestampSchema,
    attemptCount: z.number().int().nonnegative(),
    lastError: z.object({ code: z.string(), message: z.string() }).nullable(),
    correlationId: z.string().nullable(),
  })
  .strict()

export const dashboardInvoicePageSchema = dashboardPageSchema(dashboardInvoiceItemSchema)

export const creditNoteFiscalizationStateSchema = z.enum([
  'PENDING',
  'VALIDATING',
  'READY',
  'IN_PROGRESS',
  'DEVICE_OPEN_CONFIRMED',
  'ITEMS_REGISTERED',
  'CLOSE_PENDING',
  'FISCALIZED',
  'RECONCILIATION_REQUIRED',
  'RECONCILING',
  'WRITEBACK_PENDING',
  'COMPLETED',
  'FAILED',
  'MANUAL_REVIEW_REQUIRED',
  'BLOCKED_CAPABILITY',
])

const dashboardPaginationQuerySchema = z.object({
  page: z.number().int().min(1).max(100_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  search: z.string().trim().min(1).max(128).optional(),
  createdFrom: z.string().datetime({ offset: true }).optional(),
  createdTo: z.string().datetime({ offset: true }).optional(),
})

function validateDashboardDateWindow(
  query: { createdFrom?: string; createdTo?: string },
  context: z.RefinementCtx,
) {
  if (!query.createdFrom || !query.createdTo) return
  const from = Date.parse(query.createdFrom)
  const to = Date.parse(query.createdTo)
  if (from > to || to - from > 366 * 24 * 60 * 60 * 1000) {
    context.addIssue({
      code: 'custom',
      message: 'Date range must be ordered and no longer than 366 days.',
      path: ['createdTo'],
    })
  }
}

export const dashboardInvoiceQueryParamsSchema = dashboardPaginationQuerySchema
  .extend({
    status: invoiceFiscalizationStatusSchema.optional(),
    transmissionStatus: invoiceTransmissionStatusSchema.optional(),
    reconciliationStatus: invoiceReconciliationStatusSchema.optional(),
    writebackStatus: dashboardInvoiceWritebackFilterSchema.optional(),
  })
  .strict()
  .superRefine(validateDashboardDateWindow)

export const dashboardCreditNoteQueryParamsSchema = dashboardPaginationQuerySchema
  .extend({
    state: creditNoteFiscalizationStateSchema.optional(),
    reconciliationState: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[A-Za-z_]+$/)
      .optional(),
    writebackState: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[A-Za-z_]+$/)
      .optional(),
  })
  .strict()
  .superRefine(validateDashboardDateWindow)

export const dashboardManualReviewQueryParamsSchema = z
  .object({
    page: z.number().int().min(1).max(100).default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
    status: z.enum(['open', 'resolved']).optional(),
  })
  .strict()

export const dashboardOverviewQueryParamsSchema = z
  .object({
    createdFrom: z.string().datetime({ offset: true }),
    createdTo: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine(validateDashboardDateWindow)

export const dashboardCreditNoteItemSchema = z
  .object({
    requestId: z.string(),
    documentType: z.literal('credit_note'),
    zohoDocumentId: z.string(),
    documentNumber: z.string(),
    customerName: z.null(),
    originalInvoice: z
      .object({
        zohoInvoiceId: z.string().nullable(),
        invoiceNumber: z.string().nullable(),
        cuReceiptNumber: z.string().nullable(),
      })
      .strict(),
    amount: z.string().nullable(),
    currency: z.string().nullable(),
    fiscalizationStatus: creditNoteFiscalizationStateSchema,
    transmissionStatus: z.string().nullable(),
    reconciliationStatus: z.string().nullable(),
    writebackStatus: dashboardCreditNoteWritebackStatusSchema,
    confirmedReceiptEvidence: z.boolean(),
    receiptNumber: z.string().nullable(),
    cuSerialNumber: z.string().nullable(),
    qrCode: externalWebUrlSchema.nullable(),
    fiscalizedAt: dashboardTimestampSchema.nullable(),
    createdAt: dashboardTimestampSchema,
    updatedAt: dashboardTimestampSchema,
    attemptCount: z.number().int().nonnegative(),
    lastError: z.object({ code: z.string(), message: z.string() }).strict().nullable(),
  })
  .strict()

export const dashboardCreditNotePageSchema = dashboardPageSchema(dashboardCreditNoteItemSchema)

const nullableText = z.string().nullable()

const invoiceSnapshotSchema = z
  .object({
    present: z.boolean(),
    valid: z.boolean(),
    version: z.number().int().nullable(),
    snapshotId: nullableText,
  })
  .strict()

const invoiceDetailWritebackStatusSchema = z.enum([
  'not_attempted',
  'in_progress',
  'succeeded',
  'failed',
  'outcome_unknown',
])

const dashboardAttemptSchema = z
  .object({
    attemptNumber: z.number().int().nonnegative(),
    stage: nullableText,
    outcome: nullableText,
    startedAt: dashboardTimestampSchema,
    completedAt: dashboardTimestampSchema.nullable(),
    receiptNumber: nullableText,
    qrCode: externalWebUrlSchema.nullable(),
    issuedAt: dashboardTimestampSchema.nullable(),
    errorCode: nullableText,
    errorMessage: nullableText,
  })
  .strict()

const invoiceEvidenceSchema = z
  .object({
    cuSerialNumber: z.string(),
    cuInvoiceNumber: z.string(),
    cuReceiptNumber: z.string(),
    qrVerificationUrl: externalWebUrlSchema,
    fiscalizedAtLocal: z.string(),
    timeZone: z.string(),
    fiscalizedAtUtc: dashboardTimestampSchema,
    evidenceSource: z
      .object({
        cuSerialNumber: z.literal('startup_configuration'),
        cuInvoiceNumber: z.literal('electronic_journal'),
        cuReceiptNumber: z.literal('close_receipt'),
        electronicJournal: z.literal('tremol_g03'),
        qrVerificationUrl: z.literal('close_receipt'),
        fiscalizedAt: z.literal('electronic_journal'),
        transmissionStatus: z.enum([
          'successful_g03_receipt',
          'electronic_journal',
          'not_established',
        ]),
      })
      .strict(),
  })
  .strict()

const invoiceWritebackDetailSchema = z
  .object({
    status: dashboardWritebackOperationStatusSchema,
    writtenCustomFieldIds: z.array(z.string()),
    errorCategory: nullableText,
    createdAt: dashboardTimestampSchema,
    updatedAt: dashboardTimestampSchema,
    completedAt: dashboardTimestampSchema.nullable(),
    retryCount: z.number().int().nonnegative(),
  })
  .strict()
  .nullable()

const invoiceEtimsDetailSchema = z
  .object({
    status: invoiceReconciliationStatusSchema,
    reconciliationRequired: z.boolean(),
    attempts: z.array(
      z
        .object({
          attemptNumber: z.number().int().nonnegative(),
          attemptType: z.string(),
          outcome: nullableText,
          startedAt: dashboardTimestampSchema,
          completedAt: dashboardTimestampSchema.nullable(),
          errorCategory: nullableText,
        })
        .strict(),
    ),
  })
  .strict()
  .nullable()

const invoiceTimelineEventSchema = z
  .object({
    event: z.string(),
    timestamp: dashboardTimestampSchema,
    status: z.string(),
  })
  .strict()

export const dashboardInvoiceDetailSchema = z
  .object({
    request: dashboardInvoiceItemSchema
      .omit({ writebackStatus: true, lastError: true })
      .extend({
        writebackStatus: invoiceDetailWritebackStatusSchema,
        lastError: z.object({ code: z.string(), message: z.string() }).strict().nullable(),
        snapshot: invoiceSnapshotSchema,
        attempts: z.array(dashboardAttemptSchema),
        evidence: invoiceEvidenceSchema.nullable(),
        etims: invoiceEtimsDetailSchema,
        writeback: invoiceWritebackDetailSchema,
        timeline: z.array(invoiceTimelineEventSchema).min(1),
      })
      .strict(),
  })
  .strict()

const creditNoteSnapshotSchema = z
  .object({
    documentNumber: nullableText,
    date: nullableText,
    currency: nullableText,
    subtotal: nullableText,
    taxTotal: nullableText,
    amount: nullableText,
    lines: z.array(
      z
        .object({
          name: nullableText,
          quantity: nullableText,
          rate: nullableText,
          lineAmount: nullableText,
          taxName: nullableText,
          taxPercentage: nullableText,
          unit: nullableText,
        })
        .strict(),
    ),
  })
  .strict()

const creditNoteAttemptSchema = z
  .object({
    attemptNumber: z.number().int().nonnegative(),
    stage: z.string(),
    status: z.string(),
    startedAt: dashboardTimestampSchema,
    completedAt: dashboardTimestampSchema.nullable(),
    errorCategory: nullableText,
    errorDetails: nullableText,
    deviceEvidence: z.array(
      z
        .object({
          command: nullableText,
          status: nullableText,
          stage: nullableText,
          errorCategory: nullableText,
        })
        .strict(),
    ),
  })
  .strict()

const creditNoteEvidenceSchema = z
  .object({
    receiptNumber: z.string(),
    cuSerialNumber: z.string().nullable(),
    qrCode: externalWebUrlSchema,
    fiscalizedAt: dashboardTimestampSchema,
    transmissionStatus: nullableText,
    persistedEvidence: z.literal(true),
  })
  .strict()
  .nullable()

const creditNoteWritebackDetailSchema = z
  .object({
    status: dashboardWritebackOperationStatusSchema,
    writtenCustomFieldIds: z.array(z.string()),
    errorCategory: nullableText,
    createdAt: dashboardTimestampSchema,
    updatedAt: dashboardTimestampSchema,
    completedAt: dashboardTimestampSchema.nullable(),
  })
  .strict()
  .nullable()

const creditNoteDiagnosticSchema = z
  .object({
    id: nullableText,
    collectedAt: dashboardTimestampSchema.nullable(),
    kind: nullableText,
    classification: nullableText,
    hasPersistedEvidence: z.boolean(),
  })
  .strict()

export const dashboardCreditNoteDetailSchema = z
  .object({
    request: dashboardCreditNoteItemSchema
      .extend({
        snapshot: creditNoteSnapshotSchema,
        attempts: z.array(creditNoteAttemptSchema),
        evidence: creditNoteEvidenceSchema,
        writeback: creditNoteWritebackDetailSchema,
        diagnostics: z.array(creditNoteDiagnosticSchema),
      })
      .strict(),
  })
  .strict()

const dashboardCapabilitySchema = z
  .object({
    status: z.enum(['available', 'unavailable', 'partial']),
    source: z.string(),
    reason: z.string().nullable().optional(),
  })
  .strict()

export const dashboardCapabilitiesSchema = z
  .object({
    generatedAt: dashboardTimestampSchema,
    capabilities: z
      .object({
        invoiceHistory: dashboardCapabilitySchema,
        invoiceDetails: dashboardCapabilitySchema,
        creditNoteHistory: dashboardCapabilitySchema,
        creditNoteDetails: dashboardCapabilitySchema,
        writebackListing: dashboardCapabilitySchema,
        manualReview: dashboardCapabilitySchema,
        reconciliation: dashboardCapabilitySchema,
        serviceHealth: dashboardCapabilitySchema,
        deviceFleet: dashboardCapabilitySchema,
        queueDepth: dashboardCapabilitySchema,
        systemEvents: dashboardCapabilitySchema,
        overviewAggregates: dashboardCapabilitySchema,
      })
      .strict(),
  })
  .strict()

export const dashboardOverviewUnavailableSchema = z
  .object({
    availability: z.literal('unavailable'),
    generatedAt: dashboardTimestampSchema,
    reason: z.string(),
  })
  .strict()

export const dashboardOverviewAvailableSchema = z
  .object({
    availability: z.literal('available'),
    generatedAt: dashboardTimestampSchema,
    range: z
      .object({ createdFrom: dashboardTimestampSchema, createdTo: dashboardTimestampSchema })
      .strict(),
    metrics: z
      .object({
        invoices: z
          .object({
            totalRequests: z.number().int().nonnegative(),
            requestsByStatus: z.record(z.string(), z.number().int().nonnegative()),
            transmissionByStatus: z.record(z.string(), z.number().int().nonnegative()),
            reconciliationByStatus: z.record(z.string(), z.number().int().nonnegative()),
            writebackByStatus: z.record(z.string(), z.number().int().nonnegative()),
            confirmedReceiptCount: z.number().int().nonnegative(),
          })
          .strict(),
        creditNotes: z
          .object({
            totalRequests: z.number().int().nonnegative(),
            requestsByState: z.record(z.string(), z.number().int().nonnegative()),
            reconciliationByStatus: z.record(z.string(), z.number().int().nonnegative()),
            writebackByStatus: z.record(z.string(), z.number().int().nonnegative()),
            confirmedReceiptCount: z.number().int().nonnegative(),
          })
          .strict(),
      })
      .strict(),
    sources: z
      .object({
        invoices: z.object({ source: z.string(), calculation: z.string() }).strict(),
        creditNotes: z.object({ source: z.string(), calculation: z.string() }).strict(),
      })
      .strict(),
    unavailableMetrics: z.array(
      z.enum([
        'transaction_value',
        'processing_time_trend',
        'historical_uptime',
        'queue_depth',
        'system_event_counts',
        'manual_review_total',
      ]),
    ),
  })
  .strict()

export const dashboardOverviewSchema = z.discriminatedUnion('availability', [
  dashboardOverviewUnavailableSchema,
  dashboardOverviewAvailableSchema,
])

export const dashboardUnavailableSchema = z
  .object({ availability: z.literal('unavailable'), reason: z.string() })
  .strict()

const manualReviewDecisionSchema = z
  .object({
    id: z.string(),
    sequence: z.number().int(),
    requestedOutcome: z.string(),
    resolution: z.string(),
    reason: z.string().nullable(),
    evidenceReference: z.string().nullable(),
    recordedAt: dashboardTimestampSchema,
  })
  .strict()

export const manualReviewSummaryItemSchema = z
  .object({
    id: z.string(),
    requestId: z.string(),
    documentId: z.string(),
    operationId: z.string(),
    documentType: z.literal('invoice'),
    relatedAttemptIds: z.array(z.string()),
    observedState: z.string(),
    status: z.string(),
    reason: z.string().nullable(),
    createdAt: dashboardTimestampSchema,
    updatedAt: dashboardTimestampSchema,
    resolvedAt: dashboardTimestampSchema.nullable(),
    decisions: z.array(manualReviewDecisionSchema),
  })
  .strict()

const manualReviewSupportingAttemptSchema = z
  .object({
    attemptNumber: z.number().int(),
    outcome: z.enum(['succeeded', 'failed', 'outcome_unknown']).nullable(),
    startedAt: dashboardTimestampSchema,
    completedAt: dashboardTimestampSchema.nullable(),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
  })
  .strict()

export const manualReviewCaseSchema = z
  .object({
    id: z.string(),
    documentType: z.literal('invoice'),
    requestId: z.string(),
    documentId: z.string(),
    operationId: z.string(),
    observedState: z.string(),
    reason: z.string().nullable(),
    status: z.string(),
    createdAt: dashboardTimestampSchema,
    updatedAt: dashboardTimestampSchema,
    resolvedAt: dashboardTimestampSchema.nullable(),
    supportingAttempts: z.array(manualReviewSupportingAttemptSchema),
    decisions: z.array(manualReviewDecisionSchema),
  })
  .strict()

/** Persisted middleware manual-review collection contract. */
export const dashboardManualReviewSchema = z
  .object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    items: z.array(manualReviewSummaryItemSchema),
  })
  .strict()

export const dashboardReconciliationSchema = z
  .object({
    availability: z.literal('partial'),
    sources: z.array(z.string()),
    reason: z.string(),
  })
  .strict()

export const dashboardDeviceDiagnosticsSchema = z
  .object({
    availability: z.enum(['partial', 'unavailable']),
    checkedAt: dashboardTimestampSchema.nullable(),
    endpointReachability: z
      .object({
        status: z.enum(['reachable', 'unavailable', 'not_configured', 'not_checked', 'unknown']),
      })
      .strict(),
    deviceIdentity: z.object({ status: z.literal('unavailable'), reason: z.string() }).strict(),
    serialNumber: z.string().nullable(),
    lastCommunication: z
      .object({
        status: z.enum(['available', 'unavailable', 'not_checked', 'unknown']),
        lastCommunicationAt: dashboardTimestampSchema.nullable(),
      })
      .strict(),
    physicalHealth: z.object({ status: z.literal('unverified') }).strict(),
    fiscalizationReadiness: z.object({ status: z.literal('unknown') }).strict(),
    etimsPairing: z.object({ status: z.literal('unknown') }).strict(),
    healthHistory: z.object({ status: z.literal('unavailable') }).strict(),
  })
  .strict()

export const dashboardServiceHealthSchema = z
  .object({
    availability: z.literal('partial'),
    checkedAt: dashboardTimestampSchema,
    gateway: z
      .object({
        status: z.enum(['available', 'unavailable', 'not_configured', 'unknown']),
        lastSuccessfulCommunicationAt: dashboardTimestampSchema.nullable(),
      })
      .strict(),
    middlewareApi: z
      .object({ status: z.literal('reachable'), processUptimeSeconds: z.number().nonnegative() })
      .strict(),
    database: z
      .object({
        status: z.enum(['available', 'unavailable', 'not_configured', 'unknown']),
      })
      .strict(),
    zfplabserverEndpoint: z
      .object({
        status: z.enum(['reachable', 'unavailable', 'not_configured', 'unknown']),
      })
      .strict(),
    g03Communication: z
      .object({
        status: z.enum([
          'read_version_response_received',
          'unavailable',
          'not_configured',
          'unknown',
        ]),
      })
      .strict(),
    physicalDevice: z.object({ status: z.literal('unverified') }).strict(),
    zohoBooks: z
      .object({ status: z.enum(['configured_unverified', 'not_configured', 'unknown']) })
      .strict(),
    etims: z
      .object({ status: z.enum(['configured_unverified', 'not_configured', 'unknown']) })
      .strict(),
    upstreamUptime: z.object({ status: z.literal('unavailable'), valueSeconds: z.null() }).strict(),
    observability: z
      .object({
        source: z.literal('in_process_observational_metrics'),
        counters: z.record(z.string(), z.number()),
        jobs: z.record(
          z.string(),
          z
            .object({
              runs: z.number().int().nonnegative(),
              failures: z.number().int().nonnegative(),
              consecutiveFailures: z.number().int().nonnegative(),
              lastStartedAt: dashboardTimestampSchema.nullable(),
              lastFinishedAt: dashboardTimestampSchema.nullable(),
              lastSuccessAt: dashboardTimestampSchema.nullable(),
              lastReconciledAt: dashboardTimestampSchema.nullable(),
              lastDurationMs: z.number().nonnegative().nullable(),
              running: z.boolean(),
              activeWork: z.number().int().nonnegative(),
            })
            .strict(),
        ),
        httpDurationMs: z
          .object({
            count: z.number().int().nonnegative(),
            sum: z.number().nonnegative(),
            buckets: z.record(z.string(), z.number().nonnegative()),
          })
          .strict(),
      })
      .strict()
      .nullable(),
  })
  .strict()

export const dashboardWritebacksUnavailableSchema = dashboardUnavailableSchema

export const manualReviewCaseResponseSchema = manualReviewCaseSchema

export const manualReviewByRequestResponseSchema = z
  .object({
    reviewCase: manualReviewCaseSchema.nullable(),
  })
  .strict()

export const manualReviewCasesPageSchema = dashboardManualReviewSchema

const jobHealthSchema = z
  .object({
    runs: z.number().int().nonnegative(),
    failures: z.number().int().nonnegative(),
    consecutiveFailures: z.number().int().nonnegative(),
    lastStartedAt: z.string().datetime({ offset: true }).nullable(),
    lastFinishedAt: z.string().datetime({ offset: true }).nullable(),
    lastSuccessAt: z.string().datetime({ offset: true }).nullable(),
    lastReconciledAt: z.string().datetime({ offset: true }).nullable(),
    lastDurationMs: z.number().nonnegative().nullable(),
    running: z.boolean(),
    activeWork: z.number().int().nonnegative(),
  })
  .strict()

// Source: middleware src/observability/operational-metrics.ts. Labels are
// deliberately low-cardinality; arbitrary names must not carry identifiers.
const metricKeySchema = z
  .string()
  .regex(
    /^(http_requests|requests_processed|device_attempts|etims_attempts|reconciliations|zoho_writeback|manual_review_actions|database_checks|database_failures|device_checks|dependency_checks|adapter_timeouts)\.(success|failure|timeout|uncertain|reconciled|2xx|4xx|5xx|opened|resolved|escalated|available|unavailable|not_configured)$/,
  )
const metricCount = z.number().int().nonnegative()
export const operationalMetricsSchema = z
  .object({
    counters: z.record(metricKeySchema, metricCount),
    jobs: z
      .object({
        stale_recovery: jobHealthSchema.optional(),
        zoho_sync: jobHealthSchema.optional(),
        etims_reconciliation: jobHealthSchema.optional(),
      })
      .strict(),
    httpDurationMs: z
      .object({
        count: z.number().int().nonnegative(),
        sum: z.number().nonnegative(),
        buckets: z
          .object({
            '10': metricCount,
            '50': metricCount,
            '100': metricCount,
            '250': metricCount,
            '500': metricCount,
            '1000': metricCount,
            '5000': metricCount,
            '+Inf': metricCount,
          })
          .strict(),
      })
      .strict(),
  })
  .strict()

export type Liveness = z.infer<typeof livenessSchema>
export type Readiness = z.infer<typeof readinessSchema>
export type DependencyHealth = z.infer<typeof dependencyHealthSchema>
export type IntegrationHealth = z.infer<typeof integrationHealthSchema>
export type DeviceHealth = z.infer<typeof deviceHealthSchema>
export type FiscalizationHistoryItem = z.infer<typeof fiscalizationHistoryItemSchema>
export type FiscalizationHistoryPage = z.infer<typeof fiscalizationHistoryPageSchema>
export type DashboardInvoiceStatus = z.infer<typeof invoiceFiscalizationStatusSchema>
export type DashboardInvoiceTransmissionStatus = z.infer<typeof invoiceTransmissionStatusSchema>
export type DashboardInvoiceReconciliationStatus = z.infer<typeof invoiceReconciliationStatusSchema>
export type DashboardWritebackStatus = z.infer<typeof dashboardWritebackStatusSchema>
export type DashboardInvoiceWritebackFilter = z.infer<typeof dashboardInvoiceWritebackFilterSchema>
export type DashboardCreditNoteWritebackStatus = z.infer<
  typeof dashboardCreditNoteWritebackStatusSchema
>
export type DashboardInvoiceItem = z.infer<typeof dashboardInvoiceItemSchema>
export type DashboardInvoicePage = z.infer<typeof dashboardInvoicePageSchema>
export type DashboardInvoiceDetail = z.infer<typeof dashboardInvoiceDetailSchema>
export type DashboardCreditNoteState = z.infer<typeof creditNoteFiscalizationStateSchema>
export type DashboardCreditNoteItem = z.infer<typeof dashboardCreditNoteItemSchema>
export type DashboardCreditNotePage = z.infer<typeof dashboardCreditNotePageSchema>
export type DashboardCreditNoteDetail = z.infer<typeof dashboardCreditNoteDetailSchema>
export type DashboardCapabilities = z.infer<typeof dashboardCapabilitiesSchema>
export type DashboardOverview = z.infer<typeof dashboardOverviewSchema>
export type DashboardManualReview = z.infer<typeof dashboardManualReviewSchema>
export type ManualReviewSummaryItem = z.infer<typeof manualReviewSummaryItemSchema>
export type DashboardReconciliation = z.infer<typeof dashboardReconciliationSchema>
export type DashboardDeviceDiagnostics = z.infer<typeof dashboardDeviceDiagnosticsSchema>
export type DashboardServiceHealth = z.infer<typeof dashboardServiceHealthSchema>
export type ManualReviewCase = z.infer<typeof manualReviewCaseSchema>
export type ManualReviewCasesPage = z.infer<typeof manualReviewCasesPageSchema>
export type OperationalMetrics = z.infer<typeof operationalMetricsSchema>
export type MiddlewareHealth = z.infer<typeof middlewareHealthSchema>

/** Authoritative raw request contract: zoho-books-routes.ts GET /fiscalization-requests/:requestId. */
export const middlewareRequestQuerySchema = z
  .object({
    page: z.number().int().min(1).max(100_000).default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
    status: invoiceFiscalizationStatusSchema.optional(),
    deviceOutcome: invoiceFiscalizationStatusSchema.optional(),
    createdFrom: dashboardTimestampSchema.optional(),
    createdTo: dashboardTimestampSchema.optional(),
    etimsStatus: invoiceReconciliationStatusSchema.optional(),
    correlationId: z.string().trim().min(1).max(100).optional(),
  })
  .strict()
  .superRefine((query, context) => {
    if (
      query.createdFrom &&
      query.createdTo &&
      Date.parse(query.createdFrom) > Date.parse(query.createdTo)
    )
      context.addIssue({ code: 'custom', message: 'Date range must be ordered.' })
    if (query.status && query.deviceOutcome && query.status !== query.deviceOutcome)
      context.addIssue({ code: 'custom', message: 'Device and request status filters must agree.' })
  })

export const middlewareRequestPageSchema = dashboardPageSchema(
  fiscalizationHistoryItemSchema
    .extend({
      status: invoiceFiscalizationStatusSchema,
      deviceOutcome: invoiceFiscalizationStatusSchema,
      deviceAttempts: z.array(
        z
          .object({
            attemptNumber: z.number().int().nonnegative(),
            outcome: z.enum(['succeeded', 'failed', 'outcome_unknown']).nullable(),
            errorCode: nullableText,
          })
          .strict(),
      ),
    })
    .strict(),
)
export const middlewareRequestDetailSchema = z
  .object({
    request: z
      .object({
        id: z.string(),
        zohoInvoiceId: z.string(),
        status: invoiceFiscalizationStatusSchema,
        processingOutcome: z
          .object({
            state: z.enum([
              'unknown_requires_reconciliation',
              'pending',
              'processing',
              'simulated_success',
              'confirmed_fiscal_success',
              'device_or_integration_failure',
            ]),
            reconciliationRequired: z.boolean(),
          })
          .strict(),
        issuance: z.object({ enabled: z.boolean(), blockedBy: z.array(z.string()) }).strict(),
        integrations: z
          .object({
            etims: z.string(),
            etimsSimulated: z.boolean(),
            etimsBlockedBy: z.array(z.string()),
            etimsReporting: z
              .object({
                operationId: z.string(),
                adapterType: z.string(),
                status: z.string(),
                attemptNumber: z.number().int().nonnegative(),
                reconciliationRequired: z.boolean(),
                attempts: z.number().int().nonnegative(),
                attemptHistory: z.array(
                  z
                    .object({
                      id: z.string(),
                      type: z.string(),
                      number: z.number().int().nonnegative(),
                      startedAt: dashboardTimestampSchema,
                      completedAt: dashboardTimestampSchema.nullable(),
                      outcome: nullableText,
                      providerReference: nullableText,
                      errorCategory: nullableText,
                      errorMessage: nullableText,
                    })
                    .strict(),
                ),
              })
              .strict()
              .nullable(),
            zohoWriteBack: z.literal('not_configured'),
          })
          .strict(),
        createdAt: dashboardTimestampSchema,
        updatedAt: dashboardTimestampSchema,
        snapshot: z
          .object({
            present: z.boolean(),
            valid: z.boolean(),
            version: z.number().int().nullable(),
            snapshotId: nullableText,
          })
          .strict(),
        receipt: z
          .object({ receiptNumber: z.string(), issuedAt: dashboardTimestampSchema })
          .strict()
          .nullable(),
        deviceSimulated: z.boolean(),
        failure: z.object({ code: z.string(), message: z.string() }).strict().nullable(),
        outcomeUnknown: z.boolean(),
        processingInProgress: z.boolean(),
        deviceAttempts: z.array(
          z
            .object({
              id: z.string(),
              attemptNumber: z.number().int().nonnegative(),
              startedAt: dashboardTimestampSchema,
              completedAt: dashboardTimestampSchema.nullable(),
              outcome: nullableText,
              receiptNumber: nullableText,
              issuedAt: dashboardTimestampSchema.nullable(),
            })
            .strict(),
        ),
        reconciliationRequired: z.boolean(),
        operatorReviewRequired: z.boolean(),
      })
      .strict(),
  })
  .strict()
export const middlewareWritebackSchema = z.discriminatedUnion('status', [
  z
    .object({ status: z.literal('not_eligible'), requestId: z.string(), reason: z.string() })
    .strict(),
  z
    .object({
      status: z.enum(['in_progress', 'succeeded', 'failed', 'outcome_unknown', 'manual_review']),
      requestId: z.string(),
      correlationId: z.string(),
      fieldsWritten: z.number().int().nonnegative(),
      errorCategory: nullableText,
    })
    .strict(),
])
export type MiddlewareRequestDetail = z.infer<typeof middlewareRequestDetailSchema>
export type MiddlewareRequestParams = z.input<typeof middlewareRequestQuerySchema>
