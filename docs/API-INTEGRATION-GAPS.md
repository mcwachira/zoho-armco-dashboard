# Additional dashboard API integration gaps

Later document-task update: the four explicit local BFF transport mappings are
now prepared, but successful document responses are still withheld because exact
DTOs/sanitized server samples are absent. Gateway exposure remains a separate
server dependency. The analysis below records the earlier pre-implementation
state; see [document integration status](DOCUMENT-API-INTEGRATION.md) for current
behavior. No full document UI integration is claimed.

Reviewed locally on 2026-11-15. No existing API, authentication, page or gateway
implementation is replaced. This analysis uses the checked-in middleware contract,
the actual dashboard source, and the supplied server investigation confirming four
public gateway GET paths. It does not claim the additional middleware implementation
or responses were inspected on the server PC.

## Evidence and decision

- [dashboard-api-contract.md](dashboard-api-contract.md) documents middleware
  document registers/details and additional operational reads. It is not evidence
  of public gateway exposure or exact live document DTOs.
- `api/_lib/dashboard-contracts.ts` forwards only overview, invoices, credit-notes
  and services. The existing local requests alias uses the invoice collection.
- `api/dashboard/documents/*.ts` already reuse the protected shared handler.
  Their definitions have no outbound paths and return authenticated HTTP 503
  `GATEWAY_ROUTE_UNAVAILABLE` after query validation, without network access.
- `src/features/api/document-contracts.ts` has query/path/pagination helpers, but
  its response schema is deliberately `z.never()`. This is not a working response
  adapter: successful document responses are rejected until exact DTOs are known.
- `src/features/api/ApiDocuments.tsx` already supplies the invoice/credit-note
  pages, supported filter controls and Zoho-ID lookup. It shows unavailable data;
  it does not render arbitrary provider records or substitute history as a register.

**No additional endpoint is confirmed both gateway-exposed and missing dashboard
integration. No new live BFF route or page is enabled.** The four working gateway
integrations, their UI, Google OIDC, server-side session/current-role validation,
credential isolation and tests remain unchanged.

## Gap analysis

In the table, "documented" means present in the local contract, pending read-only
verification against the running middleware implementation. Gateway scope is the
four-path allowlist verified separately and supplied by the user.

| API / Functionality                                               | Exists in middleware                                                         | Exposed by gateway             | Integrated in dashboard                                   | Required action                                                                                                |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| GET overview, invoices, credit-notes, services                    | Confirmed by supplied investigation                                          | Yes                            | Yes; existing secure BFF                                  | Preserve; history lists are not full Zoho registers                                                            |
| GET document invoice register                                     | Documented                                                                   | No, confirmed by user          | Controls/helpers and unavailable protected handler only   | Server verification, exact DTOs, approved explicit gateway mapping, then extend existing page                  |
| GET document credit-note register                                 | Documented                                                                   | No, confirmed by user          | Controls/helpers and unavailable protected handler only   | Same prerequisites                                                                                             |
| GET invoice document detail                                       | Documented                                                                   | No, confirmed by user          | Existing Zoho-ID lookup/detail unavailable state          | Verify DTO, ID rules and auth scope; approve mapping                                                           |
| GET credit-note document detail                                   | Documented                                                                   | No, confirmed by user          | Existing Zoho-ID lookup/detail unavailable state          | Same prerequisites                                                                                             |
| GET invoice/credit-note persisted request details                 | Documented                                                                   | Not in verified allowlist      | Existing strict DTOs/detail UI; local handler unavailable | Verify server route and service-bearer eligibility before separate exposure proposal                           |
| GET device and capabilities                                       | Documented                                                                   | Not in verified allowlist      | Existing schemas/UI/hooks; handlers unavailable           | Verify server implementation and gateway approval                                                              |
| GET writebacks, manual-review, reconciliation, events, operations | Documented                                                                   | Not in verified allowlist      | Existing UI/query plumbing; handlers unavailable          | Verify exposure and exact DTOs; writebacks has a local field contract, other collection DTOs remain incomplete |
| Gateway-exposed but unintegrated APIs                             | None established                                                             | No additional paths confirmed  | No eligible missing integration                           | Do not add speculative forwarding                                                                              |
| Reliable live-register totals                                     | Contract says unreliable/unavailable                                         | No reliable total capability   | Total shown unavailable                                   | Continue using `total: null` and `hasMore`; no inferred totals                                                 |
| Unified queue depth and historical uptime                         | Contract explicitly says unsupported                                         | No such capability established | Unavailable                                               | Separate backend work would be needed                                                                          |
| Generic durable event/audit stream                                | Contract says no generic event table; derived event read model is documented | Not exposed                    | Unavailable                                               | Do not describe derived events as a complete audit stream                                                      |

The only document types documented for these new document endpoints are invoices
and credit notes. Orders, payments, customers-as-a-register, and other document
types are not established by this contract and are not proposed.

## Exact document endpoints

The following are middleware paths, not currently public gateway routes:

| Method and middleware path                                 | Documented response intent                                                                | Existing dashboard URL and local API                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| GET `/api/dashboard/documents/invoices`                    | Live Zoho Books invoice register, including invoices with no middleware request           | Page `/invoices`; local GET `/api/dashboard/documents/invoices`                      |
| GET `/api/dashboard/documents/invoices/{invoiceId}`        | Full original Zoho invoice detail plus a nullable persisted fiscalization request summary | Page `/invoices?id=...`; local GET `/api/dashboard/documents/invoice?id=...`         |
| GET `/api/dashboard/documents/credit-notes`                | Live Zoho Books credit-note register, including notes with no middleware request          | Page `/credit-notes`; local GET `/api/dashboard/documents/credit-notes`              |
| GET `/api/dashboard/documents/credit-notes/{creditNoteId}` | Full original Zoho credit-note detail plus a nullable persisted request summary           | Page `/credit-notes?id=...`; local GET `/api/dashboard/documents/credit-note?id=...` |

Detail IDs identify Zoho documents, not persisted fiscalization requests. The
static singular local API names are existing dashboard aliases; they are not
proposed new middleware endpoints. No live mapping of these aliases exists yet.

### Register response and query contract

The documented page envelope is `{ page, pageSize, total: null, hasMore, items }`.
Defaults: page 1 and page size 25; maximum page size 200. Next-page availability
must use `hasMore`, not item count or an invented total. The local contract states
no maximum document page number; verify actual server limits before enabling it.

Both register endpoints document these queries:

| Query                | Documented behavior / unresolved precision                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `page`, `pageSize`   | 1-based pagination; defaults and limit above                                                              |
| `search`             | Document search; exact matching/field coverage and server length limits require verification              |
| `status`             | Zoho document status; invoice and credit-note accepted enums are not supplied                             |
| `customerId`         | Customer filter; exact ID syntax/scope require verification                                               |
| `dateFrom`, `dateTo` | Document-date filters; ISO-8601 UTC is documented; inclusivity and timezone behavior require verification |
| `sortBy`             | Server/provider sort field; accepted field names are not supplied                                         |
| `sortOrder`          | `A` or `D`; default sort/tie-breaking are unspecified                                                     |

Detail endpoints document no query parameters. Invalid queries are documented as
400, missing records as 404, unavailable dependencies as 503, and Zoho read failures
as 502, using `{ error: { code, message } }`. Actual wrappers/status mappings still
need sanitized examples or source verification.

The invoice row concepts include Zoho ID, number, customer, Zoho status, date,
currency, total, balance and custom fields. The credit-note register is documented
as using the same pagination envelope, not an exact identical row schema. Register
rows include a nullable `fiscalizationRequest` projection with request ID,
persisted status, receipt information and attempt count. These descriptions do
not specify exact JSON keys, types, nullability, nested wrappers or all fields.
Do not turn them into guessed camelCase/snake_case schemas.

`fiscalizationRequest: null` means the document has not been processed by this
middleware. It is not a fiscalization failure. Zoho status, fiscalization state,
transmission and writeback remain separate. Receipt/CU evidence must come from
confirmed persisted fields. Exact CU/KRA fields are not enumerated here; no tax
identifier, custom-field layout or receipt association is inferred.

The document registers are intended to include documents never submitted for
fiscalization, unlike the existing history endpoints. They are still paginated
live Zoho reads within the configured organization/access scope, not proof of a
complete local mirror or a reliable total across all Zoho organizations.
Zoho list filtering cannot apply middleware-only fiscalization/transmission
filters. Do not claim global filtering by those fields from a loaded page.

## Other documented reads outside the gateway allowlist

These are additional middleware-contract entries, not confirmed public gateway
APIs and not enabled by this task:

| Method and path                               | Documented purpose / queries                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| GET `/api/dashboard/invoices/{requestId}`     | Persisted invoice request detail, safe snapshot, attempts, evidence, eTIMS/writeback and derived timeline; no query             |
| GET `/api/dashboard/credit-notes/{requestId}` | Persisted credit-note request detail, snapshot, attempts/evidence, writeback and diagnostics; no query                          |
| GET `/api/dashboard/device`                   | Passive device dependency/readiness availability; no query                                                                      |
| GET `/api/dashboard/capabilities`             | Per-data-family availability/source; no query                                                                                   |
| GET `/api/dashboard/writebacks`               | Independent persisted writeback operations; `page`, `pageSize`, `documentType`, `status`, `createdFrom`, `createdTo`            |
| GET `/api/dashboard/manual-review`            | Invoice review cases; `page`, `pageSize`, `status` (`open`/`resolved`), `createdFrom`, `createdTo`                              |
| GET `/api/dashboard/manual-review/{caseId}`   | One case, associated request/evidence and decision history; no query                                                            |
| GET `/api/dashboard/reconciliation`           | Invoice operations and credit-note states/diagnostics; `page`, `pageSize`, `documentType`, `status`, `createdFrom`, `createdTo` |
| GET `/api/dashboard/events`                   | Derived timeline over durable operational evidence; `page`, `pageSize`, `documentType`, `createdFrom`, `createdTo`              |
| GET `/api/dashboard/operations`               | Persisted pending/processing/failure states, not a unified queue; `page`, `pageSize`, `documentType`                            |

The local contract specifies persistence-page envelopes with numeric `total` for
collections, distinct from live-register null totals. Operational lists have
their documented route-specific caps. Exact schemas and server auth scope must
be verified before future exposure; existing UI/DTO files do not establish that
these middleware APIs can be reached using the gateway credential. No raw
`/integrations/zoho/...` alternative is proposed to bypass the dashboard namespace.

## Exact proposed gateway additions: approval required

No production gateway source is present in this dashboard repository, so this is
an explicit route-level change request, not a fabricated source patch. A separately
authorized server-side change would add only these GET mappings to the existing
gateway, keeping the four current mappings untouched:

| Incoming gateway route                                     | Fixed middleware destination                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| GET `/api/dashboard/documents/invoices`                    | `http://127.0.0.1:3001/api/dashboard/documents/invoices`     |
| GET `/api/dashboard/documents/invoices/{invoiceId}`        | Same path on `http://127.0.0.1:3001`                         |
| GET `/api/dashboard/documents/credit-notes`                | `http://127.0.0.1:3001/api/dashboard/documents/credit-notes` |
| GET `/api/dashboard/documents/credit-notes/{creditNoteId}` | Same path on `http://127.0.0.1:3001`                         |

Keep the existing incoming bearer verification and server-configured downstream
bearer. Restrict details to one validated/encoded ID segment using the server's
verified ID rules; do not add an unrestricted `/documents/*` proxy. Forward only
the documented list queries and necessary headers. Keep cookies/client credentials
out of upstream calls and retain timeout/body limits and safe errors. No mutations,
generic integration routes, alternate upstream hosts or production environment
changes are requested here.

**Verify middleware service-bearer scope first.** The broad local contract says
GET bearer access, while the supplied production investigation only confirms the
four existing routes. It does not establish service-bearer authorization for
document registers/details. Gateway exposure alone cannot solve a middleware
401/403. If scope changes are needed, report them for separate approval; do not
bypass middleware auth or forward the dashboard's Google session as a substitute.

## Read-only verification needed on the server PC

1. Confirm the running middleware version mounts all four exact document paths,
   their methods, ID rules, organization scope and GET service-bearer eligibility.
   Check actual route handlers/validators/serializers and the gateway allowlist
   read-only, without opening secret environment values or changing services.
2. Supply exact JSON schemas or sanitized representative fixtures for each list
   and detail response: empty/nonempty pages, `hasMore` true/false, nullable request
   projection, a never-submitted document and a document with confirmed evidence.
   Remove customer data, real IDs, credentials and tax identifiers from fixtures.
3. Establish exact numeric-string/number types, currency/date formats, nullable
   versus absent fields, Zoho status/sort enums, custom-field safety allowlist,
   nested request projection and detail envelope/line/tax shapes. Check whether
   any fields require omission before dashboard consumption.
4. Verify filter/search semantics, page limits, invalid input and sanitized error
   behavior, using GETs only if runtime checks are authorized. Do not submit,
   fiscalize, write back, migrate or issue device commands.
5. Obtain explicit approval for the four gateway additions after the scope/DTO
   findings are reviewable. Their implementation/deployment belongs to a separate
   authorized server task; this dashboard-only task changes no infrastructure.

## Dashboard follow-up after confirmed gateway exposure

Once exposure, auth scope and exact sanitized DTOs are confirmed, reuse the
existing static document handlers and `ApiDocuments` pages. Add strict response
schemas, narrowly mapped paths, validated encoded IDs and actual row/detail
rendering using the existing components. Replace `z.never()` only with the
verified contract; never use permissive provider JSON to make a page appear live.
Preserve filter state on detail navigation, independent status/evidence fields,
null totals and `hasMore` pagination. Keep the existing four integrations intact.

Use the existing Google OIDC/server-session/current-role gate and server-only
`DASHBOARD_UPSTREAM_BASE_URL` and `DASHBOARD_UPSTREAM_TOKEN`. No new authentication,
browser bearer, direct gateway request or alternate credential is needed.

Regression coverage must include both document types, never-submitted rows,
nullable projections/evidence, exact detail resource matching, empty pages,
pagination/filter semantics, malformed DTOs, 401/403, credential isolation,
unsupported paths and rejected methods. Existing history tests must continue to
prove their lists are not complete Zoho Books registers.

## Work performed

This task adds this analysis and corrects the older dependency document's stale
claims about currently enabled routes. No application source, page, BFF allowlist,
auth code, tests, environment, dependency or production infrastructure is changed.
No additional endpoint meets the prerequisites for implementation yet.

## Validation results

| Check                                                              | Result                                                                                                                                                                            |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unchanged full suite, `pnpm.cmd test --reporter=verbose`           | Reports 341 passed, 0 failed, 8 skipped; 22 files passed, 1 skipped. Process then exits abnormally with Windows `0xC0000005` (`-1073741819`), so the command is not a clean pass. |
| Direct Vitest rerun                                                | Also exits abnormally; no assertion failure was reported before termination.                                                                                                      |
| Diagnostic run of all tests except `browser-bundle.test.ts`        | 340 passed, 0 failed, 8 skipped; exit 0. This was an invocation-only diagnostic, not a configuration/test change.                                                                 |
| Standalone unchanged `browser-bundle.test.ts`                      | 1 test passed, but runner exits nonzero (1). The process-lifecycle issue is reproducible with this build test; its root cause is not established.                                 |
| TypeScript `tsc.cmd -b --pretty false`                             | Passed, exit 0                                                                                                                                                                    |
| ESLint `eslint.cmd .`                                              | Passed, exit 0                                                                                                                                                                    |
| Production `vite.cmd build --configLoader native` after TypeScript | Passed, exit 0; 3025 modules; existing large-chunk warning                                                                                                                        |
| Repository Prettier check and focused changed-document check       | Passed                                                                                                                                                                            |
| `git diff --check`                                                 | Passed                                                                                                                                                                            |

No test was removed, weakened or edited. The earlier baseline's 341/0/8 assertion
counts are retained, but the nonzero full-suite process exit is an outstanding
test-runner issue, not concealed as a passing command. No application compatibility
correction is justified from this documentation-only investigation. All test
gateway responses/sessions are mocked; desktop integration tests remain skipped.
