# Public Gateway integration requirements

The later post-middleware-audit request is tracked in
[route compatibility](dashboard-route-compatibility.md) and
[remaining requirements](dashboard-remaining-backend-requirements.md).
The tables below preserve prior contract assumptions and are not the pending
transferred G11SERVER audit. G03 cancellation is disabled in this dashboard.

Audit: 2026-11-18. Scope: this dashboard checkout only. G11SERVER source,
gateway configuration, middleware deployment and databases were not modified.
This document is a contract confirmation request for the G11SERVER team; it is
not evidence that the requested routes are available.

## Evidence and authentication boundary

The browser calls same-origin Vercel functions. Fixed rewrites in `vercel.json`
map `/api/dashboard/<resource>` to the single `api/dashboard.ts` function, which
removes only its `dashboardResource` selector. `api/_lib/dashboard-contracts.ts`
is the executable allowlist; `api/_lib/dashboard-gateway.ts` performs forwarding.
All local dashboard GETs require the existing signed Google OIDC dashboard
session and current `DASHBOARD_ALLOWED_USERS` membership: admin, operator or
viewer. No browser token, role assertion or cookie is forwarded upstream.

The server requires:

```text
DASHBOARD_UPSTREAM_BASE_URL=https://g11server.tailaff2e5.ts.net
DASHBOARD_UPSTREAM_TOKEN=<server-only dedicated service credential>
```

The base is an HTTPS origin, without an API suffix or embedded credentials.
The token contains no `Bearer ` prefix. Neither value belongs in a `VITE_`
variable or browser bundle. GET forwarding sends `Accept: application/json`,
server-created `Authorization: Bearer ...`, and a generated `X-Request-ID`.
Redirects are rejected and responses use `Cache-Control: no-store`.

Historical evidence must remain distinct:

- `CURRENT-GATEWAY-INTEGRATION.md` records 2026-11-17 unsigned 401 responses for
  four reads and 404 responses for many others. Those observations are dated.
- The later `dashboard-implementation-report.md` records 2026-11-18 unsigned
  401 responses on additional paths. A 401 proves an authentication boundary,
  not the downstream route, correct bearer scope, successful DTO or data.
- That report records prior user-observed signed-in acceptance of Overview and
  Invoices after deployment. It does not verify the other pages or every DTO.
- This task's fresh live probe results and environment limitations belong in
  `dashboard-implementation-report.md`; synthetic tests are not live evidence.
- During this task, the dedicated token was absent from the local process and
  Vercel refused to export three protected Production secret values. The
  environment-backed verifier stopped before issuing any gateway request.
  This preserves those protections and provides no new authenticated DTO evidence.
- `dashboard-api-contract.md` is supplied middleware documentation. Routes
  described there are candidates for confirmation, not proof of Public Gateway
  exposure. No route absent from that documentation is proposed below.

## Per-page reads and exact contracts to confirm

All table operations are GET. Upstream paths are relative to the configured
Public Gateway origin. **Enabled** means a local fixed forwarding definition
exists, not that an authenticated live response was verified. **Blocked** means
the BFF returns a protected 503 without contacting upstream. **Provisional**
means the document envelope is prepared while nested DTO compatibility still
needs confirmation. Schema names reference the executable files listed below.
Each row is an individual confirmation request, including enabled routes.

| ID  | Frontend route / existing caller                                                                                  | Local backend route                                | Upstream endpoint requiring confirmation                               | Query                                     | Expected response / local status                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| R01 | `/overview`, `ApiOverview` / `useDashboardOverviewQuery`                                                          | `/api/dashboard/overview`                          | `/api/dashboard/overview`                                              | `createdFrom`, `createdTo`, both required | `dashboardOverviewSchema`; enabled                                                                                |
| R02 | `/invoices`, invoice tab in `/reconciliation`; `ApiDocuments` / `ApiDocuments` list query                         | `/api/dashboard/documents/invoices`                | `/api/dashboard/documents/invoices`                                    | Document list query below                 | `documentPageSchema`; provisional                                                                                 |
| R03 | Invoice drawer / direct detail lookup; `ApiDocuments` detail query                                                | `/api/dashboard/documents/invoice?id=<ZohoID>`     | `/api/dashboard/documents/invoices/{invoiceId}`                        | Local `id` only; no upstream query        | `documentDetailSchema`; provisional                                                                               |
| R04 | `/credit-notes`, credit-note tab in `/reconciliation`; `ApiDocuments`                                             | `/api/dashboard/documents/credit-notes`            | `/api/dashboard/documents/credit-notes`                                | Document list query below                 | `documentPageSchema`; provisional                                                                                 |
| R05 | Credit-note drawer / lookup; `ApiDocuments` detail query                                                          | `/api/dashboard/documents/credit-note?id=<ZohoID>` | `/api/dashboard/documents/credit-notes/{creditNoteId}`                 | Local `id` only; no upstream query        | `documentDetailSchema`; provisional                                                                               |
| R06 | `/requests`, `/fiscalization`, `/writeback` fallback, recent `/settings` requests; `useDashboardInvoiceListQuery` | `/api/dashboard/invoices`                          | `/api/dashboard/invoices`                                              | Invoice history query below               | `dashboardInvoicePageSchema`; enabled                                                                             |
| R07 | Credit-note request tabs in those pages; `useDashboardCreditNoteListQuery`                                        | `/api/dashboard/credit-notes`                      | `/api/dashboard/credit-notes`                                          | Credit-note history query below           | `dashboardCreditNotePageSchema`; enabled                                                                          |
| R08 | Invoice request drawer; `useDashboardInvoiceDetailQuery`                                                          | `/api/dashboard/invoice?id=<requestID>`            | `/api/dashboard/invoices/{requestId}`                                  | Local `id` only                           | `dashboardInvoiceDetailSchema`; blocked                                                                           |
| R09 | Credit-note request drawer; `useDashboardCreditNoteDetailQuery`                                                   | `/api/dashboard/credit-note?id=<requestID>`        | `/api/dashboard/credit-notes/{requestId}`                              | Local `id` only                           | `dashboardCreditNoteDetailSchema`; blocked                                                                        |
| R10 | `/writeback`, `ApiWritebacks` in `ApiOperations.tsx`                                                              | `/api/dashboard/writebacks`                        | `/api/dashboard/writebacks`                                            | Writeback query below                     | `writebackOperationsPageSchema`; blocked                                                                          |
| R11 | `/manual-review`, `ApiOperationCollection`                                                                        | `/api/dashboard/manual-review`                     | `/api/dashboard/manual-review`                                         | Manual-review query below                 | Current legacy partial schema differs from newer documented collection; blocked; exact deployed DTO required      |
| R12 | `/manual-review?caseId=...`, `ApiOperationCollection`                                                             | `/api/dashboard/manual-review-case?id=<caseID>`    | `/api/dashboard/manual-review/{caseId}`                                | Local `id` only                           | Exact safe case/detail DTO required; blocked                                                                      |
| R13 | Operational reconciliation collection component (currently not the routed CU/KRA comparison)                      | `/api/dashboard/reconciliation`                    | `/api/dashboard/reconciliation`                                        | Operational list query below              | Exact row DTO and pagination required; existing `dashboardReconciliationSchema` is partial metadata only; blocked |
| R14 | `/events`, `ApiOperationCollection`                                                                               | `/api/dashboard/events`                            | `/api/dashboard/events`                                                | Event query below                         | Derived durable event row DTO required; blocked                                                                   |
| R15 | `/operations`, `ApiOperationCollection`                                                                           | `/api/dashboard/operations`                        | `/api/dashboard/operations`                                            | `page`, `pageSize`, `documentType`        | Pending workflow row DTO required; blocked                                                                        |
| R16 | `/health`, `/monitoring`, `/overview`; `useDashboardServiceHealthQuery`                                           | `/api/dashboard/services`                          | `/api/dashboard/services`                                              | None                                      | `dashboardServiceHealthSchema`; enabled                                                                           |
| R17 | `/device` passive diagnostics; `useDashboardDeviceDiagnosticsQuery`, existing `useDeviceHealthQuery`              | `/api/dashboard/device`                            | `/api/dashboard/device`                                                | None                                      | `dashboardDeviceDiagnosticsSchema`; blocked; confirm optional/absent identity fields                              |
| R18 | `/settings`, `useDashboardCapabilitiesQuery`                                                                      | `/api/dashboard/capabilities`                      | `/api/dashboard/capabilities`                                          | None                                      | `dashboardCapabilitiesSchema`; blocked                                                                            |
| R19 | Compatibility endpoint; no current primary page caller                                                            | `/api/dashboard/requests`                          | `/api/dashboard/invoices` (same fixed alias)                           | Invoice history query                     | `dashboardInvoicePageSchema`; enabled alias, not a new upstream route                                             |
| R20 | Legacy request-detail compatibility endpoint                                                                      | `/api/dashboard/request?id=<requestID>`            | No independent request endpoint; confirm R08 alias semantics           | Local `id` only                           | Blocked; no separate DTO or route inferred                                                                        |
| R21 | Legacy health handler; active health page uses R16                                                                | `/api/dashboard/health?check=live` or `ready`      | None authorized; confirm whether R16 remains the supported replacement | `check=live or ready`                     | `CONTRACT_ROUTE_UNAVAILABLE`; do not bypass gateway to `/health/*`                                                |
| R22 | Legacy telemetry handler; active monitoring uses R16                                                              | `/api/dashboard/telemetry`                         | None authorized; R16 observability snapshot is used                    | None                                      | `CONTRACT_ROUTE_UNAVAILABLE`; no raw integration metrics route inferred                                           |
| R23 | Legacy writeback-detail handler                                                                                   | `/api/dashboard/writeback?id=<ID>`                 | No independent GET writeback-detail endpoint is documented             | Local `id` only                           | `CONTRACT_ROUTE_UNAVAILABLE`; request detail or R10 must supply read data                                         |

The invoice/credit-note document ID identifies a Zoho document. A request ID
identifies a persisted middleware workflow. They are not interchangeable.

## Query contracts

Every BFF query rejects unknown or duplicate keys. Pagination accepts decimal
integer strings only; negative, fractional, hexadecimal and exponent forms are
rejected before network access. The values below describe current dashboard
validators; G11SERVER must confirm matching deployed limits and semantics.

| Family                                 | Accepted parameters and current validation                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview                               | Exactly `createdFrom`, `createdTo`: offset-aware ISO datetime, ordered, maximum elapsed range 366 days. Calendar inputs are converted using Africa/Nairobi boundaries before serialization. Offset plus signs must be URL encoded, normally by `URLSearchParams`.                                                                                                         |
| Invoice history                        | `page` default 1, range 1-100000; `pageSize` default 25, range 1-100; `search` trimmed 1-128 characters; optional ordered `createdFrom`/`createdTo` with maximum 366-day range; `status`, `transmissionStatus`, `reconciliationStatus`, `writebackStatus` use the enums below.                                                                                            |
| Credit-note history                    | Same history pagination/search/dates; `state` uses the credit-note workflow enum below; `reconciliationState`, `writebackState` are 1-40 ASCII letters/underscores.                                                                                                                                                                                                       |
| Document register                      | `page` positive safe integer, default 1; `pageSize` 1-200, default 25; `search`, `status`, `customerId`, `sortBy` optional trimmed 1-128 characters; `sortOrder=A or D`; ordered offset datetime `dateFrom`, `dateTo`. Confirm permitted Zoho statuses/sort fields. `reconciliationStatus` is a current-page browser comparison filter and is deliberately not forwarded. |
| IDs                                    | Local `id` must match `[A-Za-z0-9][A-Za-z0-9_-]{0,127}`. Document detail IDs are encoded into one fixed upstream path segment.                                                                                                                                                                                                                                            |
| Writebacks                             | `page` positive safe integer, default 1; `pageSize` 1-100, default 25; optional `documentType`, `status`, `createdFrom`, `createdTo`. Text filters are trimmed 1-128 characters; dates are offset datetime and ordered. Confirm allowed status/document type values.                                                                                                      |
| Manual review                          | `page` 1-100, `pageSize` 1-100 (defaults 1/25); optional `status=open or resolved`; optional ordered offset datetime `createdFrom`, `createdTo`.                                                                                                                                                                                                                          |
| Operational reconciliation             | Same 1-100 pagination; optional trimmed 1-128 `documentType`, `status`; optional ordered offset datetime `createdFrom`, `createdTo`.                                                                                                                                                                                                                                      |
| Events                                 | Same 1-100 pagination; optional `documentType`, `createdFrom`, `createdTo`; no undocumented event, severity or search filters.                                                                                                                                                                                                                                            |
| Pending operations                     | Same 1-100 pagination; optional `documentType`; no undocumented status/date query.                                                                                                                                                                                                                                                                                        |
| Services/device/capabilities/telemetry | No parameters.                                                                                                                                                                                                                                                                                                                                                            |

Invoice status: `Pending`, `InProgress`, `Succeeded`, `Failed`, `OutcomeUnknown`.
Transmission: `TRANSMISSION_PENDING`, `TRANSMISSION_CONFIRMED`.
Invoice reconciliation: `not_configured`, `blocked`, `pending`, `in_progress`,
`accepted`, `rejected`, `outcome_unknown`, `reconciliation_required`, `reconciling`.
Invoice writeback filter: `pending`, `not_attempted`, `in_progress`, `succeeded`,
`failed`, `outcome_unknown`.
Credit-note state: `PENDING`, `VALIDATING`, `READY`, `IN_PROGRESS`,
`DEVICE_OPEN_CONFIRMED`, `ITEMS_REGISTERED`, `CLOSE_PENDING`, `FISCALIZED`,
`RECONCILIATION_REQUIRED`, `RECONCILING`, `WRITEBACK_PENDING`, `COMPLETED`,
`FAILED`, `MANUAL_REVIEW_REQUIRED`, `BLOCKED_CAPABILITY`.

## Response schemas and unresolved differences

The authoritative local field/type definitions are:

- `src/features/api/schemas.ts`: history rows/details, overview, services,
  capabilities and legacy partial diagnostics/operations responses.
- `src/features/api/document-contracts.ts` and `document-provisional.ts`:
  register/detail envelopes and narrow optional Zoho/fiscalization projections.
- `src/features/api/operation-contracts.ts`: persisted writeback operation page.
- `src/features/api/reconciliation-contracts.ts`: receipt number/KRA URL comparison.
- `src/features/api/device-contracts.ts`: G03 receipt read/cancel evidence.

Required shapes for each family:

| Family                     | Expected fields / confirmation needed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| History pages              | `{page:number,pageSize:number,total:number,items:[...]}`. Invoice rows contain `requestId`, `documentType`, `zohoDocumentId`, `documentNumber`, `customerName`, `amount`, `currency`, `fiscalizationStatus`, `transmissionStatus`, `reconciliationStatus`, `writebackStatus`, `confirmedReceiptEvidence`, `receiptNumber`, `qrCode`, `fiscalizedAt`, `createdAt`, `updatedAt`, `attemptCount`, `lastError`, `correlationId`. Credit-note rows have the same identity/evidence core with persisted `fiscalizationStatus`, `originalInvoice`, `reconciliationStatus`, `writebackStatus`; confirm all nullable fields against the strict schema. |
| Request details            | `{request: ...}` extending the applicable history row. Invoice includes `snapshot`, `attempts`, `evidence`, `etims`, `writeback`, `manualReview`, `timeline`; credit note includes `snapshot`, `attempts`, `evidence`, `writeback`, `diagnostics`. Require redacted actual payloads; schema existence locally does not establish production agreement.                                                                                                                                                                                                                                                                                        |
| Document register          | `{page,pageSize,total:null,hasMore:boolean,items:[...]}`; `hasMore` governs next-page navigation, not a fabricated total. The local parser tolerates a numeric `total` for compatibility, but the documented live Zoho contract is `null`. Rows provide document type/Zoho ID, optional document number/customer/date/currency/total/balance/status and nullable fiscalization summary. Confirm provider field names and joins.                                                                                                                                                                                                               |
| Document detail            | `{documentType,zohoDocumentId,document,fiscalizationRequest,reconciliation?}`. `document` is the allowlisted Zoho representation; fiscalization summary is nullable. Missing summary means no joined evidence, not fiscal failure. Confirm receipt evidence provenance, original invoice references for credit notes, line/tax fields and reconciliation.                                                                                                                                                                                                                                                                                     |
| Overview                   | Discriminated `availability`. Unavailable: `{availability:"unavailable",generatedAt,reason}`. Available: `{availability:"available",generatedAt,range:{createdFrom,createdTo},metrics:{invoices,creditNotes},sources:{invoices,creditNotes},unavailableMetrics}`. Metrics contain real grouped request/transmission/reconciliation/writeback counts and `confirmedReceiptCount`. The returned range must equal requested instants.                                                                                                                                                                                                            |
| Services                   | `{availability:"partial",checkedAt,gateway,middlewareApi,database,zfplabserverEndpoint,g03Communication,physicalDevice,zohoBooks,etims,upstreamUptime,observability}`. `middlewareApi` includes actual process uptime. `observability` is nullable and includes in-process counters/jobs/HTTP durations. Gateway state/last communication fields have differed in older supplied contracts; confirm exact deployed DTO rather than fill values in. Configured/unverified is not healthy.                                                                                                                                                      |
| Device diagnostics         | `{availability,checkedAt,endpointReachability,deviceIdentity,serialNumber,lastCommunication,physicalHealth,fiscalizationReadiness,etimsPairing,healthHistory}`. Older supplied middleware contract omitted some fields required locally; exact DTO remains a blocker. Physical health/readiness stay unverified/unknown.                                                                                                                                                                                                                                                                                                                      |
| Capabilities               | `{generatedAt,capabilities:{invoiceHistory,invoiceDetails,creditNoteHistory,creditNoteDetails,writebackListing,manualReview,reconciliation,serviceHealth,deviceFleet,queueDepth,systemEvents,overviewAggregates}}`; each capability contains `status=available, partial or unavailable`, `source`, optional nullable `reason`.                                                                                                                                                                                                                                                                                                                |
| Writeback operations       | Numeric-total page of `{writebackId,documentType,documentId,requestId,status,errorCategory,retryCount,providerExchangeCount,nextRetryAt,createdAt,updatedAt,completedAt}`. Nullable values and timestamps follow `writebackOperationsPageSchema`; raw provider bodies/credentials are excluded.                                                                                                                                                                                                                                                                                                                                               |
| Manual review              | Older local schema accepts unavailable metadata or `{availability:"partial",page,pageSize,total:null,hasMore,items:[caseId,requestId,operationId,relatedAttemptIds,observedState,reason,status,createdAt,updatedAt,decisions]}`. Newer documentation describes a numeric-total persisted collection. Confirm which is deployed; do not convert unknown totals to zero or use raw integration case responses.                                                                                                                                                                                                                                  |
| Operational reconciliation | Older local schema is only `{availability:"partial",sources,reason}`; newer documentation describes invoice operations/credit-note diagnostic rows. Exact safe row fields, stable IDs, statuses, ordering and page envelope are missing. The routed CU/KRA page separately compares document evidence and is not a complete operational reconciliation feed.                                                                                                                                                                                                                                                                                  |
| Events                     | Exact safe derived-event DTO is missing. Confirm stable ID, document/request references, event timestamp/type, permitted metadata, ordering and numeric-total pagination. Do not claim every process log or intermediate state is persisted.                                                                                                                                                                                                                                                                                                                                                                                                  |
| Pending operations         | Exact safe workflow-operation DTO is missing. Confirm stable ID, document/request references, type/status, dates, error/attempt metadata, `retryableCandidate` meaning and pagination. This is not a unified queue; a candidate is not retry authorization.                                                                                                                                                                                                                                                                                                                                                                                   |

Operational collections without an exact verified DTO currently use `z.never()`
in `ApiOperationCollection`, so merely enabling a BFF path would still reject
every payload. Update the validator and renderer together only after contract
confirmation. No placeholder JSON table or fake rows may substitute for this.

## Existing G03 and authentication operations

These are separate from the GET-only dashboard resource function. Confirm both
G03 Public Gateway mappings and trusted identity relay independently. Their
existing presence does not establish live device access or authorize this audit
to send a cancellation.

| ID  | Frontend / local route                                            | Gateway endpoint                           | Method/body/auth                                                                     | Expected contract                                                                                                                                                                        |
| --- | ----------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D01 | `/device`, `G03Device` / `/api/device/g03/current-receipt`        | `/integrations/device/g03/current-receipt` | GET, no query; local approved session plus trusted internal ID                       | `receiptStateSchema`: `state=OPEN, CLOSED or UNKNOWN`, `salesNumber`, nullable VAT subtotal A-E, `checkedAt`, `device`, nullable structured `error`                                      |
| D02 | Explicit admin receipt control / `/api/device/g03/cancel-receipt` | `/integrations/device/g03/cancel-receipt`  | POST `{}` only; local admin, exact Origin, JSON content type and trusted internal ID | `cancelReceiptSchema`: `success`, `status`, `requestedAt`, `initialReceipt`, nullable `cancellationCommand`, nullable `verification`; success requires independent closed-state evidence |

The server maps admin/operator/viewer to administrator/operations/viewer and
relays `x-dashboard-user-id` from `DASHBOARD_USER_IDS`, never from the browser.
It also sends its server-held bearer. G11SERVER must confirm that bearer plus
trusted headers are authenticated as intended; older middleware documents refer
to Better Auth sessions/permissions and are not proof of the deployed relay.
Do not use the read service bearer to invent a fiscalization/writeback bridge.

Existing authentication calls have no Public Gateway dependency:

| Local operation / caller                               | Method             | Result/authentication                                                                                 |
| ------------------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------- |
| `/api/auth/login`, `AuthProvider` sign-in navigation   | GET                | Google authorization redirect with signed state, nonce and PKCE                                       |
| `/api/auth/callback`, Google redirect                  | GET `code`,`state` | Server-side Google token/ID verification; approved role lookup; signed HttpOnly session then redirect |
| `/api/auth/signin/google`, `/api/auth/callback/google` | Existing aliases   | Delegate to the same auth handler; retain canonical callback configuration                            |
| `/api/auth/session`, `AuthProvider`                    | GET                | `{user:{email,role},expiresAt}` or 401; current allowlist checked                                     |
| `/api/auth/logout`, `AuthProvider`                     | POST               | Exact same-origin Origin required; clear cookies; HTTP 204                                            |

Fiscalization and invoice/credit-note writeback mutations have no active
dashboard API route. Supplied middleware documentation describes operations,
but the existing read bearer is not an operator session. Confirm the intended
operator authentication contract before exposing any action; this task does
not change fiscalization rules or use PostgreSQL/raw middleware as a bypass.

## Error investigation and required error contract

The browser receives `{error:{code,message,requestId,upstreamStatus?}}`.
`X-Request-ID` and `Cache-Control: no-store` accompany dashboard errors.
The public gateway has historically returned `{error:string,request_id:string}`;
the BFF recognizes a safe `request_id` for correlation without exposing raw bodies.

| Symptom                                                                                         | Source and diagnostic meaning                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 503 `GATEWAY_ROUTE_UNAVAILABLE`, message says no upstream request was made, no `upstreamStatus` | Local `dashboardReadRoutes` disabled mapping. It is not an attempted middleware read or a token rejection. This task improves that message to name the exact local resource.                           |
| Upstream 404/503, with `upstreamStatus`                                                         | A forwarded request received that status. Inspect gateway and middleware logs using request ID to distinguish missing gateway mapping from middleware route/error. A public 404 alone is insufficient. |
| Local 401/403                                                                                   | Dashboard login/allowlist/role failure. Upstream was not called.                                                                                                                                       |
| 502 with `upstreamStatus=401 or 403`                                                            | Public Gateway/middleware rejected the service credential. The valid dashboard session is retained; it is not a local login expiry.                                                                    |
| 503 `UPSTREAM_UNCONFIGURED`                                                                     | Missing/malformed server origin/token; no request sent.                                                                                                                                                |
| 502 `UPSTREAM_CONTRACT_ERROR`                                                                   | Invalid/oversized JSON, schema mismatch, secret echo, incorrect detail identity, pagination mismatch or wrong overview range. No synthetic fallback.                                                   |
| 504 `UPSTREAM_TIMEOUT` / 502 `UPSTREAM_UNAVAILABLE` without upstream status                     | Request timed out or transport failed; do not claim the gateway route itself is absent.                                                                                                                |
| 400 `INVALID_QUERY` without upstream status                                                     | Dashboard URL/query validation failed before fetch.                                                                                                                                                    |

The reported overview `400 INVALID_QUERY` had a demonstrated historical cause:
Vercel bracketed Node routing injected `...path`/`path` into an otherwise valid
strict query. Existing fixed rewrites consume only `dashboardResource` and
preserve strict rejection of unknown keys. Existing signed-session route tests
reproduce the old injection failure and accept the same dates without injected
keys, including fractional seconds, offset timestamps and the exact 366-day
boundary. The later historical user acceptance records Overview loading data.
Do not reopen validation to arbitrary query keys or blame valid milliseconds.

## G11SERVER confirmation response requested

For **every R01-R23 and D01-D02 row**, provide:

1. Confirmed public method/path or explicitly unsupported status; for aliases,
   the intended existing target. Do not add a broad wildcard proxy.
2. Deployed middleware and gateway revisions, route registration/allowlist
   evidence and the matching upstream target selected by the gateway.
3. Authentication/role/permission requirements, bearer configuration variable
   names and trusted identity relay rules. Send no credential values.
4. Accepted query keys/defaults/limits, timezone boundaries, date inclusivity,
   status enums, search semantics, sort fields/order and pagination semantics.
5. Redacted response schemas and nonempty/empty/error samples from authenticated
   reads, preserving field types/nullability, freshness timestamps and provenance.
6. Correlated gateway/middleware request IDs for route/auth/error failures, with
   secrets and personal data removed.

All endpoint confirmations remain pending unless separately supported by dated
authenticated evidence. This repository can prepare adapters and regression
tests, but cannot certify or repair G11SERVER routes from local fixtures. The
confirmation request is prepared for handoff; no message has been sent to an
unidentified external team or recipient.
