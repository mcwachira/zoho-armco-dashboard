# Operational dashboard middleware audit

Audit date: 2026-11-14. This is a source audit; no application source was changed during the audit.

## Architecture and protected paths

- Runtime: Node.js 24+ and TypeScript, Express 5, Prisma 7 with PostgreSQL.
- Entrypoints: `src/server.ts` assembles repositories, Zoho clients, workflows, workers, and `src/app.ts`; `src/app.ts` mounts routes and health probes.
- Existing Zoho Books button entrypoint: `POST /integrations/zoho/button-submissions`, implemented in `src/routes/zoho-button-submission-routes.ts`. Invoice submissions call the existing preparation/orchestration and fiscalization services. Credit-note submissions call the existing credit-note workflow.
- Invoice path: `ZohoInvoiceService` -> `PrepareFiscalizationRequestService` / `FiscalizationOrchestrationService` -> `FiscalizationService` -> `TremolFiscalDevice` -> `TremolZfpLabServerClient` and command builders. The invoice service checks the current Zoho custom fields before device execution; a persisted request or historical attempt alone does not prove fiscalization success.
- Credit-note path: `ZohoCreditNoteService` and mapper -> `ZohoCreditNoteFiscalizationRequestService` / `ZohoCreditNoteFiscalizationWorkflow` -> existing Tremol adapter. It is separate from the invoice request model and keeps append-only attempt/diagnostic evidence.
- Independent writeback: `ZohoFiscalizationWritebackService` and `ZohoCreditNoteFiscalizationWritebackService` consume persisted evidence. Credit-note writeback is specifically separate from EJ confirmation and never issues device commands.
- Device uncertainty/reconciliation: invoice evidence and attempt state are persisted by `postgresql-fiscalization-repository.ts`; credit-note request attempts and diagnostic records are persisted by their own PostgreSQL repositories. Existing reconciliation services retain uncertain outcomes.

Protected source inventory for dashboard work:

- `src/routes/zoho-button-submission-routes.ts`
- `src/application/fiscalization/prepare-fiscalization-request.ts`
- `src/application/fiscalization/fiscalization-service.ts`
- `src/application/fiscalization/fiscalization-orchestration-service.ts`
- `src/infrastructure/device/tremol-fiscal-device.ts`
- `src/infrastructure/device/tremol-zfplabserver-client.ts`
- `src/infrastructure/device/tremol-receipt-command-builder.ts` and `src/infrastructure/device/tremol-multi-command-*`
- `src/application/zoho/zoho-credit-note-fiscalization-workflow.ts`
- `src/application/zoho/zoho-credit-note-mapper.ts`
- `src/application/zoho/zoho-fiscalization-writeback-service.ts`
- `src/application/zoho/zoho-credit-note-fiscalization-writeback-service.ts`

Dashboard changes can be made around these interfaces. No audit finding requires changing protected fiscalization behavior.

## Persistence sources

The Prisma schema is `prisma/postgresql/schema.prisma`; checked-in migrations are under `prisma/postgresql/migrations/`. Important records include `FiscalizationRecord`, `FiscalizationAttempt`, `FiscalizationRecordOutcomeArchive`, `ManualReviewCase`, `ManualReviewDecision`, `EtimsReportingOperation`, `ZohoFiscalizationWritebackOperation`, `ZohoCreditNoteFiscalizationRequest`, `ZohoCreditNoteFiscalizationAttempt`, `ZohoCreditNoteDiagnosticRecord`, `ZohoCreditNoteFiscalizationRecord`, `ZohoCreditNoteWritebackOperation`, provider exchanges, and recovery audits. Existing relations retain or restrict historical evidence. No schema change was needed to expose the currently persisted dashboard data.

There is no general persisted Zoho invoice/credit-note catalog, unified system-event stream, or job-queue table. Fiscalization request tables contain only documents that entered middleware fiscalization. The middleware's actual scheduling is in-process/background work plus database-backed fiscalization and writeback state, not a general-purpose queue. Do not present a queue depth or unified event feed without a reliable source.

## Existing API capabilities and gaps

| Capability                        | Existing implementation                                                                                                                                                            | Audit result                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Dashboard auth                    | Better Auth session, allowlisted users, `dashboard:read`, exact-origin CORS; optional service bearer limited to four collection paths                                              | Implemented; disabled unless configured                                                                    |
| Invoice register                  | Zoho Books client supports paginated `listInvoicesPage`; dashboard `/invoices` reads persisted fiscalization history                                                               | Provider source exists, but dashboard list omits never-submitted invoices and is not the complete register |
| Invoice detail                    | `GET /integrations/zoho/invoices/{invoiceId}` retrieves one Zoho invoice; dashboard detail is by persisted request ID                                                              | Source detail exists; dashboard's history endpoint cannot retrieve a never-fiscalized invoice              |
| Credit-note register              | `GET /integrations/zoho/credit-notes` pages Zoho summaries; dashboard `/credit-notes` reads persisted requests                                                                     | Provider register exists, but dashboard list omits never-submitted credit notes                            |
| Credit-note detail                | `GET /integrations/zoho/credit-notes/{creditNoteId}` retrieves and maps a source note; dashboard detail is by request ID                                                           | Source detail exists; dashboard lacks a Zoho-ID detail path                                                |
| Fiscalization request list/detail | Existing `/integrations/zoho/fiscalization-requests` and request detail; dashboard exposes paged invoice/CN request history and sanitized details                                  | Implemented, with dashboard history lists scoped to existing records                                       |
| Attempts/timeline/evidence        | Persisted invoice and credit-note attempts, detail DTOs, device evidence summaries, writeback and reconciliation fields                                                            | Implemented per request                                                                                    |
| Fiscalization retry               | Existing invoice processing and credit-note execute operations call their established workflows under `/integrations/zoho`                                                         | Existing operational APIs; not mounted under authenticated dashboard namespace                             |
| Zoho writeback retry              | Existing invoice/CN services and request-level writeback operations; CN retries use authoritative saved G03 evidence                                                               | Existing operational APIs; separate from G03; not mounted under authenticated dashboard namespace          |
| Manual review                     | Invoice `ManualReviewCase`/`ManualReviewDecision` persistence and existing operational-review services                                                                             | Data exists but there is no dashboard collection/detail route                                              |
| Reconciliation                    | Per-request eTIMS/CN diagnostic state and existing reconciliation endpoints                                                                                                        | Per-request visibility exists; dashboard collection explicitly reports partial coverage                    |
| System events                     | No unified persisted event model                                                                                                                                                   | Missing as a queryable collection; do not synthesize                                                       |
| Queue/pending operations          | Database request and writeback statuses plus in-process jobs                                                                                                                       | Request state is visible; no general queue/depth contract exists                                           |
| Telemetry and health              | `/health/*`, `/integrations/zoho/operations/metrics`, and authenticated dashboard `/services` use process counters, job health and live DB check; dashboard avoids device commands | Real but limited measurements; device physical state and Zoho upstream health are unverified, not healthy  |

## Test and quality baseline

Environment: Node `v26.13.0`, dependencies present. Git executable is not available in this shell, so a Git working-tree diff could not be collected. The repository's previous implementation inventory reports older results; those are not used as this turn's baseline.

Commands and results:

- `pnpm test`: could not start because the pnpm engine store lock was denied by the environment.
- `node_modules/.bin/vitest.cmd run`: failed to spawn worker processes under the Windows sandbox (`EPERM`).
- `node_modules/.bin/vitest.cmd run --pool=threads --maxWorkers=1`: passed, 101 files passed, 5 skipped; 1,875 tests passed, 25 skipped.
- `node_modules/.bin/tsc.cmd --noEmit -p tsconfig.json`: passed.
- `node_modules/.bin/tsc.cmd -p tsconfig.test.json`: passed.
- `node_modules/.bin/tsc.cmd -p tsconfig.json`: passed (build).
- `node_modules/.bin/eslint.cmd .`: failed with 4,018 reported errors while traversing generated artifacts, staged/deploy copies, and temporary/build output as well as source.
- `node_modules/.bin/prettier.cmd --check .`: failed with style findings in 690 files, including generated, staged/deploy, temporary/build artifacts, and source.
- `git status --short`: unavailable (`git` is not installed/on PATH).

Lint and formatting failures are pre-existing baseline results and must be compared against focused source-only checks after any implementation. No production services, Zoho Books API, G03, or KRA endpoint were contacted for this audit.
