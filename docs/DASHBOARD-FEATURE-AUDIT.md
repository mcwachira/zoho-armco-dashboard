# Dashboard document compatibility audit

Audited 2026-11-17 exclusively in
`C:\Users\pc\Documents\GitHub\zoho-armco-dashboard`.
The directory exists and `package.json` identifies `zoho-amarco-dashboard`.
The lead and three parallel reviewers audited read-only before editing. Existing
uncommitted work was preserved. This replaces the earlier inventory in this file.

## Evidence and live access

No authenticated middleware response was obtained. Only `.env.example` exists;
relevant dashboard/authentication process configuration and an authenticated
session were unavailable. No remote source was sought or modified, no credential
was logged, and no unauthenticated response is treated as a document DTO sample.

After the initial audit, the user supplied four raw Zoho/provider examples and
explicitly confirmed: **retain dashboard envelopes**. Reduced, source-backed
fixtures are in `src/features/api/__fixtures__/zoho-response-samples.ts`.
These establish provider fields and supplied value types, not deployed middleware
joins, filtering, nullability or endpoint availability. The invoice list contained
ellipsis placeholders, omitted from the fixture. The credit-note list example
contains a single `creditnotes` object and no pagination metadata; no metadata
or collection conversion was inferred from it.

The existing [document integration record](DOCUMENT-API-INTEGRATION.md) confirms
the dashboard envelopes. `docs/dashboard-api-contract.md` says detail retains
Zoho's representation and excludes customer tax identifiers. The official
[Zoho invoice](https://www.zoho.com/books/api/v3/invoices/) and
[credit-note](https://www.zoho.com/books/api/v3/credit-notes/) documentation was
also consulted; it does not establish middleware compatibility.

## Gateway mappings retained

| Authenticated browser GET                    | Fixed upstream GET                         |
| -------------------------------------------- | ------------------------------------------ |
| `/api/dashboard/documents/invoices`          | `/api/dashboard/documents/invoices`        |
| `/api/dashboard/documents/invoice?id=ID`     | `/api/dashboard/documents/invoices/ID`     |
| `/api/dashboard/documents/credit-notes`      | `/api/dashboard/documents/credit-notes`    |
| `/api/dashboard/documents/credit-note?id=ID` | `/api/dashboard/documents/credit-notes/ID` |

Existing singular detail handlers map to upstream plural `/:id` paths. All use
the existing signed session/current role allowlist, server-only bearer, fixed
GET allowlist, strict query/ID validation, response projection, identity and
pagination checks, time/size bounds, redirect rejection, no-store and secret-echo
protection. Raw provider wrappers are not substituted for dashboard envelopes.
Mocked authenticated integration tests exercise all four handlers.

## Field inventory and verification status

No middleware runtime DTO was captured. This table distinguishes user-supplied
provider evidence from accepted dashboard bindings. Sample omission does not
prove a property is always absent. Samples do not establish nullability; the
optional local projections accept null/absence without inventing values.

| Context                            | Exact property names/nesting                                                                                                                             | Evidence and accepted behavior                                                                                                                                                                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard list                     | `{page,pageSize,total,hasMore,items}`                                                                                                                    | Existing confirmed envelope: positive integer page, pageSize 1-200, nonnegative integer/null total, boolean hasMore, max 200 item objects. Retained per user confirmation.                                                                                      |
| Dashboard detail                   | `{documentType,zohoDocumentId,document,fiscalizationRequest}`                                                                                            | Existing confirmed envelope: nonempty strings, document object, required request object/null. Optional local `reconciliation` extension. Retained.                                                                                                              |
| Provider wrappers                  | `{code,message,invoices,page_context}`; `{code,message,invoice}`; `{code,message,creditnotes}`; `{code,message,creditnote}`                              | User supplied. Detail data is tested inside dashboard `document`; provider wrappers do not reach the UI. CN list pagination remains unspecified.                                                                                                                |
| Invoice identity/customer          | `invoice_id`, `invoice_number`, `customer_id`, `customer_name`                                                                                           | User invoice ID/customer ID are safe integer numbers; number/name strings. Source IDs now accept strings or nonnegative safe integers and normalize to strings. Unsafe numeric IDs stay unavailable.                                                            |
| Credit-note identity/customer      | `creditnote_id`, `creditnote_number`, `customer_id`, `customer_name`                                                                                     | User sample contains strings. Same lossless source-ID projection.                                                                                                                                                                                               |
| Source status/dates                | `status`, `date`, `due_date`, `created_time`, `last_modified_time`, `updated_time`                                                                       | User dates are YYYY-MM-DD; timestamps include compact offsets `-0800`/`-0700`. CN detail uses `updated_time`; lists use `last_modified_time`. Both timestamp encodings accepted after validation.                                                               |
| Common financial values            | `currency_code`, `total`, `balance`, `sub_total`, `tax_total`, `adjustment`, `discount_total`                                                            | User currency string; totals/balance numeric. Invoice supplies subtotal/tax/adjustment. CN sample omits subtotal/tax total/discount total. Local values accept finite numbers or decimal strings/null/absence; no tax or total is derived.                      |
| Discount/tax metadata              | `discount`, `discount_type`, `is_discount_before_tax`, `is_inclusive_tax`                                                                                | User invoice has numeric zero, string `item_level`, boolean true and false respectively. Raw source discount is displayed separately from discount amount; no guessed units.                                                                                    |
| Source lines                       | `line_items[].{item_id,name,description,quantity,rate,discount,discount_amount,item_total}`                                                              | Invoice item ID numeric; CN string. Invoice has numeric quantity/rate/discount/total. CN provides quantity but omits rate/amount/discount; these remain unavailable.                                                                                            |
| Invoice line tax                   | `line_items[].{tax_id,tax_name,tax_percentage}`                                                                                                          | User provides safe numeric tax ID, string VAT and numeric 12.5. No line tax amount supplied; do not calculate it.                                                                                                                                               |
| Credit-note line tax               | `line_items[].tax_id`                                                                                                                                    | User provides string ID; line tax name/percentage/amount absent. Tax IDs are references, never a reason to infer rates or amounts.                                                                                                                              |
| Invoice tax breakdown              | `taxes[].{tax_name,tax_amount}`                                                                                                                          | User provides string name and numeric 19.13. Already supported. Document `tax_total` is separate supplied value 22.6; do not force arithmetic consistency.                                                                                                      |
| Credit-note tax breakdown          | `taxes[].{tax_id,tax_name,tax_amount}`                                                                                                                   | User provides string ID/name and decimal-string `2.50`; no percentage. Already-supported amount type preserved; ID now retained. Both supplied examples use `taxes[]`; no alternate property was invented.                                                      |
| Credit-note invoice relationship   | `invoices[].{invoice_id,invoice_number,amount}`                                                                                                          | User supplies an array with string ID/number and numeric amount. Projection and shared list/detail relationship display now support all entries. Existing flat `invoice_id`/`invoice_number` remains fallback. `reference_number` is not inferred to be a link. |
| Source details/address             | `reference_number`, `notes`, `terms`, `billing_address.{attention,address,street2,city,state,zip,country}`                                               | Optional nullable strings, address object; sample numeric ZIP 94588 now normalized losslessly. Other customer tax/contact/provider fields stripped.                                                                                                             |
| Additional local source candidates | `line_items[].{sku,unit,hs_code,hs_name,line_subtotal,tax_amount}`, `taxes[].tax_percentage`                                                             | Optional nullable strings or finite numbers as applicable; not established by these samples. Missing values remain unavailable.                                                                                                                                 |
| Request join                       | `fiscalizationRequest`                                                                                                                                   | Not in raw samples. Existing row optional object/null and detail required object/null retained. Only explicit null means not processed.                                                                                                                         |
| Request status/timing              | `requestId`, `status`, `executionStatus`, `deviceOutcome`, `kraTransmissionStatus`, `writebackStatus`, `submittedAt`, `startedAt`, `completedAt`         | Optional nullable string projections; actual middleware names/types/enums remain unverified.                                                                                                                                                                    |
| CU/KRA/request evidence            | `cuSerialNumber`, `cuReceiptNumber`, `kraQrUrl`, `fiscalizedAt`, `deviceResult`, `errorCode`, `errorMessage`, `receiptConfirmed`, `requiresManualReview` | Not in supplied examples. Optional nullable strings; last two booleans. Receipt identifiers remain strings only, never numeric coercion.                                                                                                                        |
| Provenance                         | `snapshot.lineItems[]`, `commandSequence[]`, `deviceValues`, `writebackValues`, `attempts[]`                                                             | Existing bounded optional nullable projections in `document-provisional.ts`; middleware nesting and exact command result types remain unverified.                                                                                                               |
| Reconciliation                     | `reconciliation.{status,cuReceiptNumber,invoiceNo,kraUrl,reason}`                                                                                        | Optional local projection; seven statuses, nullable strings, reason string. Supplied evidence validated using shared calculator. No real joined reconciliation sample obtained.                                                                                 |

## Findings and disposition

| Feature                   | Read-only finding                                                                                               | Final disposition                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Document views            | Shared register/detail architecture already renders source fields and fiscal/request evidence when supplied.    | Preserved; source compatibility extended only for user-backed gaps.                                                                   |
| Invoice list balance      | Available projected balance omitted.                                                                            | Added invoice-only Balance column with existing decimal formatter.                                                                    |
| Numeric source IDs/ZIP    | String-only projection discarded the user invoice IDs/item IDs and numeric ZIP.                                 | Lossless safe-integer support added only to source IDs/postcode; receipt numbers unchanged.                                           |
| Source timestamps         | Compact offsets rejected; CN updated_time ignored.                                                              | Validate/normalize compact offset and display updated_time fallback.                                                                  |
| Credit invoice references | Only flat relationship supported; user detail has invoices array.                                               | Bounded array and one shared relationship renderer for lists/details; no first-item-only assumption.                                  |
| Discounts/taxes           | Source discount metadata and tax IDs were stripped; number/string tax amounts already accepted.                 | Metadata/reference projection and display extended; existing tax amounts/rules preserved. Missing CN totals/rates remain unavailable. |
| Exact CU comparison       | Nonblank CU string was trimmed before equality.                                                                 | Original string preserved; only missing detection trims.                                                                              |
| Supplied reconciliation   | Supplied status/invoiceNo bypassed URL extraction.                                                              | Validate supplied pair with same calculator; recalculate contradictions without mixing sources.                                       |
| Current-page filters      | Explicit scope; no unsupported upstream comparison query; source totals/page/hasMore retained.                  | Preserved; all-status list/filter/detail consistency tested for both document types.                                                  |
| Safe links/provenance     | Unsafe URLs remain inert; credential-free HTTP(S), no opener/referrer; evidence sources kept distinct.          | Preserved and tested.                                                                                                                 |
| G03 preflight             | Capability unavailable means UNKNOWN, including stale cached CLOSED observations. Passive diagnostics separate. | Already working; no device behavior change.                                                                                           |
| Customer PIN              | Candidate projection/display contradicted explicit local contract exclusion.                                    | Removed and tested through all four authenticated gateway reads.                                                                      |
| Test evidence             | Credit gateway success used invoice identity; rich tests reused invoice tax assumptions.                        | Corrected identities, independent user-sample tax tests and optional/null coverage. No claim of live middleware success.              |

## Reconciliation semantics

Use the exact CU string and single decoded `invoiceNo` query value from the
selected URL. Leading zeros/long IDs stay strings; no document number, CU serial,
sales number or unrelated identifier is substituted. Nonblank CU whitespace is
significant. Missing both inputs is NOT_AVAILABLE; otherwise missing CU is
MISSING_CU_RECEIPT_NUMBER, missing URL is MISSING_KRA_URL, unsafe/malformed or
duplicate-parameter URL is INVALID_KRA_URL, missing/blank invoiceNo is
MISSING_INVOICE_NO, and exact equality decides MATCH versus MISMATCH. Missing
CU takes precedence if multiple fields have problems.

Supplied comparison evidence retains source precedence but must agree with
calculation from its own CU/URL; contradictions get a recalculated result and
explanation. Otherwise use one persisted writeback pair, then summary pair,
never filling a gap from a different source. No device response pair is silently
substituted for writeback evidence.

## Outstanding verification and dependencies

Obtain sanitized authenticated middleware lists/details to confirm the retained
wrappers, source projections, real tax layouts/nullability and fiscalization
joins, CU/KRA field locations, attempts and command response types. The supplied
provider samples support local source tests but contain no fiscalization evidence.
Source totals may be illustrative; no business arithmetic is reconstructed.

Whole-register comparison filtering needs a verified backend calculation/filter
contract. Live G03 state needs a verified authenticated receipt read capability;
UNKNOWN remains intentional until then. Proposed receipt/cancellation paths in
older docs remain disabled. No browser device command, automatic cancellation,
OutcomeUnknown retry, VAT/eligibility/configuration change, blocker, lock,
cooldown, deployment or remote mutation was introduced.

See [implementation report](LOCAL-DASHBOARD-IMPLEMENTATION-REPORT.md) for exact
changed files, checks/build results and remaining limits.

---

# Comprehensive dashboard mission audit — 2026-11-18

This section records the current dashboard checkout before this mission's source
changes. The preceding compatibility audit and pre-existing uncommitted files are
preserved. This is exclusively the React/Vercel dashboard repository, not the
separate Express middleware or .NET application. Imported middleware inventories
describe possible upstream capabilities; they do not prove Public Gateway access.

## Architecture and source of truth

- Frontend: React 19, TypeScript, Vite 8, React Router, TanStack Query, Zod,
  Recharts, Framer Motion, Sonner, Tailwind 4 and shared CSS.
- Bootstrap: `src/main.tsx`; shell, protected routes and global range:
  `src/app/App.tsx`. Query cache is server-state storage; local/URL state controls
  filters, drawers and pagination. Development demo data is isolated in `src/mocks/`
  and the lazy-loaded `src/features/api/mock-api-adapter.ts`.
- Browser transport: `src/lib/api/client.ts`, fixed same-origin `/api/*` URLs,
  credentials included, validated responses and explicit errors. No browser bearer.
- API: static `api/dashboard/*.ts`, four `api/dashboard/documents/*.ts` and two
  `api/device/g03/*.ts` entrypoints reuse `api/_lib/dashboard-gateway.ts`.
  `api/_lib/dashboard-contracts.ts` is the actual GET mapping allowlist.
- Authentication: `api/_lib/auth.ts`, `api/auth/[...auth].ts` and static Google
  signin/callback entrypoints; Google OIDC with state/nonce/PKCE, signed HttpOnly
  session and current email/role allowlist. Frontend provider:
  `src/lib/auth/AuthProvider.tsx`.
- Configuration/deployment: `src/lib/config.ts`, `.env.example`, `vercel.json`,
  `package.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml` and deployment docs.
  Production mock mode is rejected. The upstream origin/token are server-only.
- Current tree already has static dashboard routes and ISO/date-only overview
  serialization. Preserve these fixes and their regression tests.
- No working middleware/gateway success DTO was captured by this audit agent.
  Prior public probes in `CURRENT-GATEWAY-INTEGRATION.md` returned 401 for four
  basic collections and 404 for the remaining paths. Neither result establishes
  the authenticated middleware response contract or Vercel reachability.

`IMPLEMENTED` below means a real code path exists against the locally documented
contract; it does **not** certify live production integration. `PARTIAL` means
working local code has a material capability or verification dependency. `MISSING`
means no usable dashboard implementation/contract is present. `BROKEN` identifies
a reproducible source defect to fix. All enabled upstream integrations still need
authenticated live verification and safe response samples before production signoff.

## A. Dashboard overview

| Feature                      | Status      | Evidence                                                                                                                                         | Required action / dependency                                                                                              |
| ---------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Overall operational summary  | IMPLEMENTED | `ApiOperationalPages.tsx:ApiOverview`, `queries.ts:useDashboardOverviewQuery`, `schemas.ts:dashboardOverviewSchema`, `api/dashboard/overview.ts` | Preserve aggregate source and verify authenticated payload.                                                               |
| Fiscalized invoice counts    | IMPLEMENTED | Overview `metrics.invoices.confirmedReceiptCount` and confirmed-by-type chart                                                                    | Retain persisted receipt evidence; do not substitute status alone.                                                        |
| Pending fiscalization        | IMPLEMENTED | Overview pending/in-progress matcher across invoice and CN states                                                                                | Preserve backend status semantics and bounded range.                                                                      |
| Failed fiscalization         | IMPLEMENTED | Overview failed-state counters and links to request filters                                                                                      | Preserve; verify current middleware states.                                                                               |
| Credit-note statistics       | IMPLEMENTED | Overview CN totals, confirmed evidence and state counts                                                                                          | Preserve; register totals deliberately unavailable.                                                                       |
| Recent activity              | PARTIAL     | Overview joins first 25 history rows per type and labels bounded scope                                                                           | This is recent request history, not a complete event feed; event DTO/access missing.                                      |
| Operational health           | PARTIAL     | Overview uses `useDashboardServiceHealthQuery`, dependency rows                                                                                  | Point-in-time services diagnostics only; do not infer upstream Zoho/device readiness.                                     |
| Date-range filtering         | IMPLEMENTED | `ApiOverview` rolling range; `overview-dates.ts`; query schema                                                                                   | Preserve ISO milliseconds, Nairobi date-only conversion and 366-day bound; run regressions.                               |
| Accurate backend metrics     | PARTIAL     | Zod aggregate DTO, explicit unavailable metric list                                                                                              | No fabricated queue/value/uptime totals; authenticated current DTO verification required.                                 |
| Overview `400 INVALID_QUERY` | PARTIAL     | Static entrypoints; `dashboard-routing.test.ts`; `CURRENT-GATEWAY-INTEGRATION.md`                                                                | Historical root cause is Vercel catch-all query injection; fix already exists in dirty tree, rerun real entrypoint tests. |

## B. Invoice management

| Feature                    | Status      | Evidence                                                                                  | Required action / dependency                                                                             |
| -------------------------- | ----------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Invoice register listing   | PARTIAL     | `/invoices` → `ApiDocuments`; document page schema; `api/dashboard/documents/invoices.ts` | Retained dashboard envelope and provisional projections need real authenticated sample/access.           |
| Invoice search             | IMPLEMENTED | `ApiDocuments` search form → `queries.ts` document query                                  | Preserve backend query; no local full-register substitute.                                               |
| Date and status filters    | IMPLEMENTED | `ApiDocuments` source status and explicit UTC document date bounds                        | Preserve source filtering and invalid-input feedback.                                                    |
| Pagination and sorting     | IMPLEMENTED | `ApiDocuments` page/pageSize/hasMore and sortBy/sortOrder                                 | Preserve source pagination; fiscal history sorting is explicitly current-page.                           |
| Invoice details            | PARTIAL     | `DocumentDetailView.tsx`, singular function to plural upstream ID mapping                 | Verify response identity/type against selected ID and real joined DTO.                                   |
| Fiscalization status       | PARTIAL     | `DocumentStatus`, independent source status and fiscal request summary                    | Provisional document join must be confirmed; history list status already typed.                          |
| CU receipt number          | PARTIAL     | Detail fiscal fields; history DTO `receiptNumber`                                         | Exact string preserved; join/access verification remains. History list can expose existing DTO evidence. |
| KRA QR/verification URL    | PARTIAL     | Detail safe links; history DTO `qrCode`; `schemas.ts` safe external URL                   | Render only persisted supplied safe URL; gateway compatibility outstanding.                              |
| Fiscalization timestamp    | PARTIAL     | Detail fiscalizedAt and typed history DTO fiscalizedAt                                    | Preserve missing/unavailable states; expose existing history evidence where useful.                      |
| Associated requests        | PARTIAL     | Document join requestId and history links; `RecordDrawer`                                 | Dedicated request detail gateway disabled; operator cannot retrieve complete request evidence live.      |
| Error information          | PARTIAL     | History `lastError`; detail errorCode/errorMessage; drawer failures                       | List errors usable when gateway succeeds; detail access/join unverified.                                 |
| Reconciliation information | PARTIAL     | `ReceiptReconciliation.tsx`; document comparison and history reconciliationStatus         | CU/URL comparison works locally; persisted operational reconciliation detail unavailable.                |

## C. Credit-note management

| Feature                      | Status      | Evidence                                                    | Required action / dependency                                           |
| ---------------------------- | ----------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| Credit-note listing          | PARTIAL     | `/credit-notes` → `ApiDocuments`; CN document GET mapping   | Current Public Gateway availability and nested DTO must be verified.   |
| Search/date/status filtering | IMPLEMENTED | Shared `ApiDocuments` filters; source query builder         | Preserve shared implementation and source status.                      |
| Pagination and sorting       | IMPLEMENTED | Shared page metadata/source sort controls                   | No full-register comparison filter is claimed.                         |
| Credit-note details          | PARTIAL     | `DocumentDetailView` kind `credit_note`; detail function    | Verify selected identity/type and live DTO.                            |
| Original invoice reference   | IMPLEMENTED | `RelatedInvoice`; `invoices[]` projection and flat fallback | All supplied references preserved; do not infer from reference_number. |
| Fiscalization status         | PARTIAL     | CN state schema/history; independent document join          | Preserve uppercase workflow states; current join/access unverified.    |
| CU receipt information       | PARTIAL     | Shared fiscal fields and history receiptNumber              | Persisted string evidence only; no inferred success.                   |
| KRA verification information | PARTIAL     | Shared safe verification link and CU/URL comparison         | Current joined source/access remains unverified.                       |
| Related execution history    | PARTIAL     | Detail attempts/snapshots/provenance; `RecordDrawer`        | CN request detail gateway deliberately unavailable.                    |
| Error information            | PARTIAL     | CN history lastError and detail fiscal errors               | Current contract verification required.                                |
| Reconciliation information   | PARTIAL     | CN reconciliationStatus and page-local receipt comparison   | No confirmed operational collection/read or recovery mutation bridge.  |

## D. Fiscalization operations

| Feature                               | Status      | Evidence                                                                                | Required action / dependency                                                                                            |
| ------------------------------------- | ----------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Request listing                       | IMPLEMENTED | `/requests` → `ApiRequests`, invoice/CN history endpoints and typed schemas             | Preserve separation from complete Zoho registers.                                                                       |
| Request search/status/date/pagination | BROKEN      | `ApiRequests` silently converts invalid date to undefined and invalid page to fallback  | Validate malformed/impossible URL dates and pagination, show actionable error and avoid broadening query.               |
| Request details                       | PARTIAL     | Existing `RecordDrawer`; queries for singular `invoice`/`credit-note`                   | `dashboard-contracts.ts` intentionally returns GATEWAY_ROUTE_UNAVAILABLE; exact gateway/auth/DTO required.              |
| Execution status/outcome              | IMPLEMENTED | History fiscalizationStatus, transmission/reconciliation/writeback displayed separately | Preserve backend values without success inference.                                                                      |
| Request ID                            | IMPLEMENTED | History table and lookup; request/schema links                                          | Preserve ID validation and distinction from Zoho document ID.                                                           |
| Document ID/type/reference            | IMPLEMENTED | History documentType/zohoDocumentId/documentNumber; linked source documents             | Keep CN/invoice distinctions and source links.                                                                          |
| Submission timestamp                  | IMPLEMENTED | History createdAt with `time` element                                                   | Preserve backend timestamp.                                                                                             |
| Completion timestamp                  | PARTIAL     | Request/detail optional completedAt                                                     | List updatedAt is not completion; detail contract/access required.                                                      |
| Device response information           | PARTIAL     | Detail deviceResult, commandSequence, deviceValues, attempts; drawer device evidence    | Render only supplied sanitized evidence; live DTO/access unverified.                                                    |
| Error codes/messages                  | IMPLEMENTED | History lastError `{code,message}`; detail/drawer projections                           | Preserve explicit errors and safe API failures.                                                                         |
| Outcome status                        | IMPLEMENTED | Separate fiscalization/reconciliation/writeback status fields                           | Unknown outcome stays unknown.                                                                                          |
| Historical execution visibility       | PARTIAL     | Detail chronological attempts and provenance; history list attemptCount                 | No complete live history while request detail route disabled.                                                           |
| Retry/reprocess                       | MISSING     | No verified operational action bridge; pre-existing action files deleted                | Require exact middleware mutation response/auth contract; do not send read bearer, invent action or change eligibility. |

## E. Reconciliation and manual review

| Feature                          | Status      | Evidence                                                                                   | Required action / dependency                                                                          |
| -------------------------------- | ----------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Identify unresolved outcomes     | IMPLEMENTED | Typed invoice OutcomeUnknown/CN RECONCILIATION_REQUIRED history filters and overview links | Preserve actual backend states.                                                                       |
| Reconciliation-required records  | PARTIAL     | History state/filter; `/reconciliation` current-page CU/URL comparison                     | Comparison is not operational reconciliation; operational DTO/gateway absent.                         |
| Manual-review records            | PARTIAL     | CN manual-review request filter; invoice `ApiOperationCollection` unavailable              | Exact invoice case collection/detail schema/access missing; no arbitrary JSON rendering.              |
| Request/document references      | IMPLEMENTED | History links and source document join fields                                              | Live detail coverage still limited as above.                                                          |
| Actionable recovery evidence     | PARTIAL     | History errors, request/drawer evidence, unknown-outcome notes                             | Requires accessible detail/case DTO for full recovery context.                                        |
| Supported reconciliation actions | MISSING     | No verified dashboard mutation contract/auth relay                                         | Document exact API prerequisite; never present a decorative recovery button.                          |
| Exact CU/KRA comparison          | IMPLEMENTED | `reconciliation-contracts.ts` and tests, `ReceiptReconciliation.tsx`                       | Exact strings, one decoded invoiceNo, safe URL, source-pair provenance; explicitly loaded-page scope. |

## F. System health and telemetry

| Feature                          | Status      | Evidence                                                                                                           | Required action / dependency                                                                                                             |
| -------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Middleware health                | PARTIAL     | `ApiSystemHealth.tsx`; documented services GET; middleware status/uptime                                           | Verify actual authenticated DTO; no health-probe bearer forwarding.                                                                      |
| Gateway connectivity             | PARTIAL     | BFF failures and same-origin services request success/failure                                                      | A successful dependency status is not independent gateway health. Surface actual API failures.                                           |
| Zoho Books connectivity          | PARTIAL     | Services zohoBooks `configured_unverified`/`not_configured`                                                        | No active Zoho health result is exposed; do not label configured as connected.                                                           |
| Fiscal device connectivity       | PARTIAL     | Services endpoint/communication fields; `ApiDevice`; disabled G03 current receipt capability                       | Passive communication is not physical/fiscal readiness. Verified receipt API/auth needed.                                                |
| Service health                   | IMPLEMENTED | Services dependency projection and health UI rows                                                                  | Preserve unknown/unverified distinctions.                                                                                                |
| Recent operational errors        | PARTIAL     | Recent bounded request lastError, telemetry counters/worker failures                                               | No complete operational event stream or current exact event DTO.                                                                         |
| Request activity                 | PARTIAL     | Overview first-page recent records; services in-process counters                                                   | Explicit bounded scope and restart-sensitive counters; no queue depth claim.                                                             |
| API response failures            | IMPLEMENTED | Client `ApiError`, BFF safe correlation/error envelope, error/retry states                                         | Preserve surfaced errors and protected-value checks.                                                                                     |
| Live versus stale/cached results | BROKEN      | Query dataUpdatedAt exists; `ApiSystemHealth` stale warning depends on telemetry payload rather than services data | Correct stale services display even when observability absent; shared polling/freshness and refresh outcome should reflect real results. |

## G. Zoho integration and writeback

| Feature                               | Status      | Evidence                                                                                       | Required action / dependency                                                                     |
| ------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Zoho document references              | IMPLEMENTED | Register IDs/numbers/customer refs; history source links; CN invoice references                | Preserve lossless safe numeric source ID normalization.                                          |
| Middleware fiscalization results      | PARTIAL     | Typed history status/receipt fields; provisional document join                                 | Real current DTO compatibility/access required.                                                  |
| CU/QR writeback status                | PARTIAL     | History writebackStatus; detail writebackValues; persisted-pair reconciliation                 | Full independent writeback list route disabled, joined fields provisional.                       |
| Missing/incomplete document data      | IMPLEMENTED | Projection null/absence handling, unavailable fields and explicit null-not-processed semantics | Do not fabricate completion fields or numeric totals.                                            |
| Identify missing fiscalization fields | IMPLEMENTED | Shared receipt reconciliation statuses MISSING_CU_RECEIPT_NUMBER/MISSING_KRA_URL/etc.          | Compare one source pair; do not mix device response and writeback sources.                       |
| Writeback operations history          | PARTIAL     | `ApiWritebackOperations`, `operation-contracts.ts` strict page schema                          | Gateway route not enabled; authenticated safe persisted-operation payload required.              |
| Writeback retry                       | MISSING     | Pre-existing deleted action entrypoints; no verified operator bridge                           | Require exact authorized middleware operation contract; do not re-fiscalize to repair writeback. |

## H. Authentication and access

| Feature                                     | Status      | Evidence                                                                                              | Required action / dependency                                                                               |
| ------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Dashboard authentication                    | IMPLEMENTED | `auth.ts` OIDC/session/expiry/current allowlist; `AuthProvider`; protected routes                     | Real Google configuration and hosted login/logout validation still required.                               |
| Public Gateway authentication               | PARTIAL     | Server-only read bearer in gateway, no forwarded browser identity                                     | Verify token scope and actual public allowlist; dashboard login alone is not middleware operator identity. |
| Secure API credentials                      | IMPLEMENTED | Server-only env settings, fixed GET allowlist, no-store, secret-echo protection, browser-bundle tests | Preserve; inspect build output and tracked source for leaks.                                               |
| Unauthorized action protection              | IMPLEMENTED | Unsupported actions absent; G03 handler checks identity/role/origin and disabled capabilities         | Do not enable unverified relay; add only source-verified authorized actions.                               |
| No new middleware dashboard-auth dependency | IMPLEMENTED | All changes remain this checkout; existing middleware is not modified                                 | Keep read/session security local; do not alter original middleware entrypoints.                            |
| Production demo isolation                   | IMPLEMENTED | `config.ts` production mock rejection; client/mock dynamic import guards; bundle test                 | Verify production build and fixture exclusion.                                                             |

## Cross-cutting UI, quality and deployment findings

| Feature                              | Status      | Evidence                                                                                             | Required action / dependency                                                                                            |
| ------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Navigation/layout                    | IMPLEMENTED | Shell routes/nav, mobile CSS, command palette and notifications                                      | Preserve pages; improve observed mobile/sidebar accessibility without redesign.                                         |
| Accessible interactions              | PARTIAL     | Labeled forms, table headings, dialog focus traps/Escape handling                                    | Address actual missing menu state/focus attributes; no browser layout proof yet.                                        |
| Loading/empty/error/success          | IMPLEMENTED | `DataState`, register/request feedback, retry and clipboard toasts                                   | Preserve real errors; ensure stale data remains visibly stale.                                                          |
| Responsive desktop/mobile            | PARTIAL     | Existing media queries and overflow tables in shared/module CSS                                      | Source inspection supports intended responsive behavior; browser viewport verification still required.                  |
| Type/lint/unit/integration/build     | PARTIAL     | package scripts, Vitest suites and CI                                                                | Current mission must run all checks and report exact results; inherited counts are not current results.                 |
| Vercel deployment configuration      | PARTIAL     | Node engine, static API routes, SPA rewrite excludes `/api`, function durations and security headers | Verify project linkage, build/output settings, actual environment presence and connectivity; no deploy/push authorized. |
| Production environment configuration | PARTIAL     | `.env.example`, auth/upstream validation                                                             | Need correct server-only values in Vercel and VITE_DATA_MODE=api; do not print credentials.                             |

## Exact integration dependencies before production signoff

1. Obtain authenticated GET evidence and sanitized success DTOs for overview,
   invoice/CN history, services and all four document list/detail routes. Confirm
   filters, pagination/hasMore/nullability and identity semantics, not HTTP 200 alone.
2. Establish current Public Gateway mappings and bearer scopes for request details,
   manual-review case list/detail, persisted reconciliation, events, operations,
   writebacks, capabilities and passive device diagnostics. The local allowlist
   deliberately fails unavailable families before any upstream request.
3. Supply exact sanitized response schemas for manual-review/reconciliation/events/
   operations; `ApiOperationCollection` currently validates with `z.never()` and
   cannot become functional merely by enabling a gateway path.
4. Verify existing middleware operator identity/authentication and action response
   contracts before fiscalization retry, writeback retry or reconciliation actions.
   The dashboard read credential is insufficient authorization for mutation.
5. Confirm Vercel project/environment and reachability from the deployed function
   environment. Local source/tests cannot certify production configuration.

No source-audit result justifies rebuilding working modules, modifying protected
fiscalization logic, adding cooldowns/locks/eligibility rules, inventing DTOs or
declaring this checkout fully production-ready while these dependencies remain.

### Current mission live observations

The lead agent's read-only HTTPS probes on 2026-11-18 reached the public origin:
root returned 404, and capabilities, invoices and services returned 401.
Capabilities therefore differs from the older report's 404. Prior public-path
observations must not be treated as current route inventory. These unauthenticated
responses still establish neither successful bearer access nor valid middleware
DTOs. The lead found no process/local-file upstream token; only `.env.example`
was present. No capability was enabled on the strength of a 401 response.

## Mission implementation completion — 2026-11-18

This appendix updates the initial findings above without deleting the earlier
audit evidence. Scope remains the dashboard checkout; no middleware rules or
gateway source were changed.

| Finding                                                      | Final local status | Evidence and remaining dependency                                                                                                                                                              |
| ------------------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request filter/pagination validation                         | IMPLEMENTED        | `ApiRequests.tsx` validates kind, status, pagination, real calendar dates and date ordering before enabling requests; invalid selected request IDs show an error rather than opening a drawer. |
| Receipt evidence in request listing                          | IMPLEMENTED        | Existing list `receiptNumber`, `qrCode`, `fiscalizedAt` render only with backend `confirmedReceiptEvidence`; request-detail unavailability remains explicit.                                   |
| Document selection integrity                                 | IMPLEMENTED        | UI and BFF reject wrong document type, outer ID or supplied nested source ID; optional missing source IDs remain supported.                                                                    |
| Overview selected-range integrity                            | IMPLEMENTED        | BFF matches available response range to requested instants; equivalent timestamp offsets pass.                                                                                                 |
| Overview rolling-window freshness                            | IMPLEMENTED        | Stable interval anchor advances selected time bounds during polling and explicit refresh.                                                                                                      |
| Independent service diagnostics                              | IMPLEMENTED        | Valid services render even when the overview endpoint fails.                                                                                                                                   |
| Invoice versus credit-note counts/links                      | IMPLEMENTED        | Existing backend confirmed metrics appear separately; execution links retain document kind.                                                                                                    |
| Cached dependency freshness                                  | IMPLEMENTED        | Shared services query/polling; stale warning covers all observations even without telemetry.                                                                                                   |
| Refresh completion evidence                                  | IMPLEMENTED        | New range state is committed before active-query refresh; pending or failed reads cannot produce a successful-refresh timestamp.                                                               |
| Mobile navigation interaction                                | IMPLEMENTED        | State labels, Escape, focus handling and offscreen visibility; actual browser viewport validation still outstanding.                                                                           |
| Pagination response integrity                                | IMPLEMENTED        | BFF rejects nonempty rows beyond the reported total and accepts empty pages beyond the end.                                                                                                    |
| Overview routing regression                                  | IMPLEMENTED        | Static handlers retained; real signed-session tests cover valid dates, old injected route fields and the 366-day boundary without weakening query validation.                                  |
| Explicit Vercel build settings                               | IMPLEMENTED        | Existing Vite framework, frozen pnpm install, build command and `dist` output declared; deployed settings still require hosted verification.                                                   |
| Authenticated gateway compatibility                          | PARTIAL            | Current unauthenticated probes return 401 across all 18 dashboard paths tested; successful payloads, scopes and filter semantics cannot be inferred.                                           |
| Operational collections, request detail and recovery actions | PARTIAL            | Existing safe UI preserved; missing current DTO/access/operator contracts remain the exact dependencies listed above. No decorative actions or arbitrary JSON were added.                      |

### G03 clarification

The initial mission tables and preserved older audit text must be read alongside
the newer existing [G03 relay contract](G03-INTEGRATION.md). The current checkout
already contains enabled receipt monitoring and administrator-confirmed
cancellation through `/api/device/g03/*`, the trusted server-side identity map,
and `handleG03Request`. That dedicated relay is separate from the disabled passive
`/api/dashboard/device` read and the removed fiscalization/writeback entrypoints.
It was preserved and tested with controlled responses; no live device command was
issued. It does not establish a mutation identity bridge for fiscalization,
writeback or reconciliation actions.

Complete check results, mission file inventory, production variables and release
dependencies are in [the implementation report](dashboard-implementation-report.md).

### Deployment packaging follow-up

The authorized push passed clean GitHub CI but exposed Vercel's actual Hobby
limit of twelve functions. Fixed public resource rewrites now share one static
`api/dashboard.ts` entrypoint; resource utilities reside in `api/_dashboard/`.
The full deployment inventory is six functions. Shared authentication, exact
upstream routes, schema validation and unavailable responses remain unchanged.
No bracketed dashboard route was reintroduced. The final packaging regression
run passed 740 tests with 8 optional desktop skips, including selector injection,
prototype-backed request headers and the existing overview date regressions.

### Production acceptance update

Deployment `dpl_AaAaYLRgmsPEJZhWzuP8aRRVyjGi`, source commit `f7bdfd5`,
is READY on `https://zoho-armco-dashboard.vercel.app`. Clean GitHub CI passed.
The user completed normal sign-in and confirmed Overview and Invoices load live
data. The overview query issue is therefore covered by local regression tests
and user-observed production acceptance. Other current backend contract gaps
remain PARTIAL/MISSING as documented; a successful deployment does not fabricate
those capabilities. The implementation report contains the full final evidence.
