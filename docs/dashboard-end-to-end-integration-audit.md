# Vercel-to-G11SERVER end-to-end integration audit

Audit date: 2026-11-18. Live dashboard evidence captured at 2026-11-18T16:51:51.240Z;
served-asset evidence captured at 2026-11-18T16:54:14.374Z. Times are UTC.

## Result

**Overall: GATEWAY_VERIFIED_VERCEL_UNVERIFIED.** The completed gateway audit and
successful authenticated gateway GETs are accepted as user-confirmed context.
They were not independently repeated in this mission. No authenticated
production-dashboard session was available to these tools, so the Vercel-to-
G11SERVER read chain could not be exercised end to end.

Fresh requests to all eight requested deployed dashboard resources returned
HTTP 401 JSON. These are local dashboard authentication-boundary observations,
not gateway authorization failures, missing-route evidence, empty collections,
or successful business-response schema checks.

Two requested operations, writebacks and passive device information, are also
blocked in the source of the currently deployed commit. The working-tree repairs
that enable those reads have not been deployed.

No operation is classified END_TO_END_VERIFIED. No live CONTRACT_MISMATCH was
established because there were no successful business payloads to validate.

## Scope and non-modification

Only the requested Markdown report was created in this mission. No application
source, schema, configuration, environment file or production setting was changed.
No deployment, restart, rebuild, push, authentication mutation, database action,
device command, fiscalization or writeback was performed. No mutation endpoint,
including login/callback/logout or G03 cancellation, was called.

Vercel project/deployment/environment metadata was read using the existing
authorized CLI account. Dashboard probes were GETs without a cookie or bearer.
Public HTML/JavaScript was fetched as text without executing the application.
No new OAuth session was created, no dashboard session was forged, and no
personal browser-cookie store was inspected.

The gateway bearer was never printed, written to a file or passed on a command
line. Environment checks printed only names/scopes/protection types and URL
validation booleans. The CLI did not export protected secret values.

## Evidence sources

- **E1:** authenticated Vercel management GET for project
  `prj_potkn87ChosvYHOwd2WvM4qzvEWz`.
- **E2:** authenticated Vercel management GET for project environment metadata;
  values were omitted from output.
- **E3:** read-only `vercel env run --project zoho-armco-dashboard --environment production`
  with an in-memory Node check printing only base-URL validation booleans.
- **E4:** authenticated Vercel deployment metadata GET for
  `dpl_8q3WpGyoGpJsdgDtk7fs6D6sqNLZ`.
- **E5:** nine fresh unsigned deployed-dashboard GETs, including session status,
  recorded below with actual request IDs and redacted response structure.
- **E6:** deployed public HTML and its HTML-referenced first-party JavaScript,
  fetched as text and inspected without execution or rebuilding.
- **E7:** read-only local source inspection, `git show 4663dbf:<path>`, and
  comparison of the actual schema files to the deployed commit.
- **Supplied context:** the user's completed backend audit confirms middleware
  routes and Public Gateway prefix preservation under `/api/dashboard`, and
  successful authenticated safe gateway GETs. Those raw successful payloads
  were not supplied to this audit.

## Existing deployment and source provenance

| Item                      | Verified result                                                  |
| ------------------------- | ---------------------------------------------------------------- |
| Project                   | `zoho-armco-dashboard`                                           |
| Production origin         | `https://zoho-armco-dashboard.vercel.app`                        |
| Existing deployment       | `dpl_8q3WpGyoGpJsdgDtk7fs6D6sqNLZ`                               |
| Deployment state / target | READY / production                                               |
| Recorded Git SHA          | `4663dbf751b686fe0467395bc27d9bcfb196f9a3`                       |
| Local HEAD                | Same SHA, with pre-existing uncommitted repairs                  |
| Current repairs deployed? | No: recorded production commit precedes the working-tree changes |

The deployment's recorded commit was inspected directly from Git. This is
source-provenance evidence; authenticated execution of its blocked branches
was not forced or bypassed.

## Production environment verification

| Check                                    | Actual observation                                                                                             | Limit                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `DASHBOARD_UPSTREAM_BASE_URL` setting    | Present; Production target; encrypted protection type                                                          | Not browser configuration                                                                |
| Current Production URL value             | Present; HTTPS; expected origin `https://g11server.tailaff2e5.ts.net`; origin-only; no `/api/dashboard` suffix | Checked in memory; only booleans printed                                                 |
| `DASHBOARD_UPSTREAM_TOKEN` setting       | Present; Production target; sensitive protection type                                                          | Value, validity, bearer syntax and equality to the gateway credential were not inspected |
| Existing deployment environment snapshot | Lists both upstream setting names                                                                              | Frozen deployment values were not independently decrypted/read                           |
| Public secret-setting names              | No matching `VITE_`/`NEXT_PUBLIC_` upstream/token/secret names in inspected project metadata                   | Names-only check, not an exact protected-token-value scan                                |

The base-URL check returned:

```json
{
  "scope": "current-production-environment",
  "baseUrlPresent": true,
  "https": true,
  "expectedGatewayOrigin": true,
  "originOnly": true,
  "containsDashboardPathSuffix": false
}
```

The CLI reported that three protected Production secret values could not be
pulled. No attempt was made to bypass that protection or create an environment
file. Current Production settings and names attached to a deployment are separate
evidence: this audit does not assume that a later setting automatically changes
a previously built deployment's frozen environment.

## Authentication and forwarding implementation

The deployed commit configures exact upstream paths such as
`/api/dashboard/overview`, `/api/dashboard/invoices` and
`/api/dashboard/services`. The current working tree represents the same
namespace separately as `dashboardGatewayNamespace = '/api/dashboard'` and
resource suffixes. Neither construction requests bare gateway roots.

The handler:

1. Requires a valid signed dashboard session and current allowlist membership.
2. Validates the fixed resource and query.
3. Checks the local contract gates.
4. Reads the server-only upstream origin and bearer.
5. Constructs a GET with `Authorization: Bearer <server credential>`,
   `Accept: application/json`, generated `X-Request-ID`, no-store caching
   and redirect rejection.

Browser cookies and caller-supplied Authorization are not forwarded on normal
dashboard reads. The browser uses same-origin cookies and has no service-bearer
injection mechanism.

Current source references:

- `src/lib/api/client.ts:4` and `:89`: empty browser base URL and same-origin GET.
- `api/_lib/dashboard-contracts.ts:23`: gateway namespace.
- `api/_lib/dashboard-gateway.ts:146`: local authorization before forwarding.
- `api/_lib/dashboard-gateway.ts:185`: local unavailable-resource gate.
- `api/_lib/dashboard-gateway.ts:203`: upstream configuration checks.
- `api/_lib/dashboard-gateway.ts:221` and `:247`: URL and bearer construction.
- `api/_lib/auth.ts:288`: signed session/current-role authorization.

Deployed-source evidence was read with
`git show 4663dbf:api/_lib/dashboard-gateway.ts` and
`git show 4663dbf:api/_lib/dashboard-contracts.ts`. Bearer forwarding is confirmed
in code, **not observed executing in production** during this audit. The fresh
401 responses do not exercise that upstream branch.

## Availability of an authorized application session

The Vercel management account is authenticated. That is not a dashboard Google
OIDC session and cannot substitute for one.

No production dashboard session cookie was available to the current process and
no authorized attached browser session was exposed by the available tools.
`GET /api/auth/session` returned HTTP 401 with the JSON structure
`{error:string}` and safe value `unauthorized`. This does not establish
whether the user is signed in in a separate personal browser.

Consequently all API probes were explicitly unsigned. The inability to export
the protected service bearer is not itself proof of a runtime failure: an
authorized dashboard session would normally let Vercel use its own bearer
without exporting it.

## Fresh request and response evidence

All requests used:

- Origin: `https://zoho-armco-dashboard.vercel.app`.
- Method: GET.
- Request header: `Accept: application/json`.
- No Cookie, Authorization, trusted identity or role header.
- No-store caching, redirect rejection and bounded timeout/body reading.

Overview requested the exact UTC window:
`2026-11-17T16:51:47.335Z` through `2026-11-18T16:51:47.335Z` (24 hours).
The actual encoded URL appears below. Collection probes used page 1/pageSize 1.
Services and Device supplied no query parameters.

| Requested path including query                                                                            | Requested at (UTC)       | HTTP | X-Request-ID                           | X-Vercel-ID                                    |
| --------------------------------------------------------------------------------------------------------- | ------------------------ | ---- | -------------------------------------- | ---------------------------------------------- |
| `/api/auth/session`                                                                                       | 2026-11-18T16:51:47.353Z | 401  | `not supplied`                         | `bom1::iad1::h4m79-1795020711747-f7cb3b4788ca` |
| `/api/dashboard/overview?createdFrom=2026-11-17T16%3A51%3A47.335Z&createdTo=2026-11-18T16%3A51%3A47.335Z` | 2026-11-18T16:51:47.690Z | 401  | `fe8ff175-cb46-4ec7-8cfb-7b3b0e9e8d45` | `bom1::iad1::hdsrl-1795020711747-518e116e9dcb` |
| `/api/dashboard/invoices?page=1&pageSize=1`                                                               | 2026-11-18T16:51:47.693Z | 401  | `78080c6d-2d88-4041-a5a6-87d2ba148f52` | `bom1::iad1::5w858-1795020711747-b3f2292d26e4` |
| `/api/dashboard/credit-notes?page=1&pageSize=1`                                                           | 2026-11-18T16:51:49.742Z | 401  | `82ba444c-02c0-44d2-bbc1-19d5a2ed16d5` | `bom1::iad1::5w858-1795020713421-c6f862230e35` |
| `/api/dashboard/documents/invoices?page=1&pageSize=1`                                                     | 2026-11-18T16:51:49.743Z | 401  | `fa63951f-38f9-450a-849a-0d28cfc59a37` | `bom1::iad1::tlxnc-1795020713421-b672db21730e` |
| `/api/dashboard/documents/credit-notes?page=1&pageSize=1`                                                 | 2026-11-18T16:51:49.743Z | 401  | `b6aa8b64-9b8f-41db-b1e3-1eac220cbd57` | `bom1::iad1::f4zpw-1795020713709-7cf83dc55a96` |
| `/api/dashboard/writebacks?page=1&pageSize=1`                                                             | 2026-11-18T16:51:50.372Z | 401  | `ccacb149-d151-43c8-a84e-ff3d465b4492` | `bom1::iad1::jtbcm-1795020714044-63e26db73893` |
| `/api/dashboard/services`                                                                                 | 2026-11-18T16:51:50.373Z | 401  | `7ec2af07-c904-410d-b767-9e1b88726886` | `bom1::iad1::lgh5j-1795020714045-da5d14e8f3e7` |
| `/api/dashboard/device`                                                                                   | 2026-11-18T16:51:50.374Z | 401  | `a200947f-86b7-4d60-a256-9508b782e6b3` | `bom1::iad1::d98gq-1795020714054-f5928fc5362a` |

Every response above was JSON with content type `application/json` and
redacted field structure `{error:string}`. The retained safe error value was
`unauthorized`. The session endpoint supplied a Vercel ID but no X-Request-ID.
No business rows, customer values, receipt numbers or credential values are
included in this report.

The supplied date window and pagination were validly constructed; HTTP 401 means
the deployed query-validation and data-return branches were not demonstrated.
Record counts, totals and empty-state behavior are **unavailable**, not zero.

## Schema comparison

Existing schema files were inspected without changing or rebuilding them.
`git diff --quiet 4663dbf -- <file>` confirmed that these three files match
the deployment's recorded commit:

- `src/features/api/schemas.ts`.
- `src/features/api/document-contracts.ts`.
- `src/features/api/operation-contracts.ts`.

| Resource                                | Actual frontend schema             | Live status | Live schema comparison                           |
| --------------------------------------- | ---------------------------------- | ----------- | ------------------------------------------------ |
| `/api/dashboard/overview`               | `dashboardOverviewSchema`          | 401         | NOT_TESTED: no successful authenticated response |
| `/api/dashboard/invoices`               | `dashboardInvoicePageSchema`       | 401         | NOT_TESTED: no successful authenticated response |
| `/api/dashboard/credit-notes`           | `dashboardCreditNotePageSchema`    | 401         | NOT_TESTED: no successful authenticated response |
| `/api/dashboard/documents/invoices`     | `documentPageSchema`               | 401         | NOT_TESTED: no successful authenticated response |
| `/api/dashboard/documents/credit-notes` | `documentPageSchema`               | 401         | NOT_TESTED: no successful authenticated response |
| `/api/dashboard/writebacks`             | `writebackOperationsPageSchema`    | 401         | NOT_TESTED: no successful authenticated response |
| `/api/dashboard/services`               | `dashboardServiceHealthSchema`     | 401         | NOT_TESTED: no successful authenticated response |
| `/api/dashboard/device`                 | `dashboardDeviceDiagnosticsSchema` | 401         | NOT_TESTED: no successful authenticated response |

The 401 error envelope was not submitted as if it were a successful business
response. No missing fields, wrong types, invalid enums, envelope mismatches or
pagination/date differences are asserted from unauthorized responses.

Expected structures, for later authenticated comparison:

- Overview: availability-discriminated root envelope, generatedAt/range,
  grouped invoice/credit-note metrics, sources and unavailable metrics
  (`schemas.ts:618`, `:667`).
- Invoice and credit-note history: strict numeric-total
  `{page,pageSize,total,items}`, distinct row schemas/status enums. Credit-note
  `customerName` is required to be null; monetary history fields use strings/null
  (`schemas.ts:109`, `:176`, `:301`).
- Full registers: `{page,pageSize,total:number|null,hasMore,items}`; nested source
  projections remain provisional (`document-contracts.ts:70`).
- Writebacks: numeric-total page with required operation identifiers, nullable
  request/error/retry/completion fields and integer attempt counts
  (`operation-contracts.ts:7`, `:24`).
- Services: strict limited `availability:"partial"` projection and nullable
  observability (`schemas.ts:749`).
- Device: strict limited diagnostic projection with explicitly unverified physical
  health and unknown fiscal readiness (`schemas.ts:725`).

Those are code expectations, not newly validated gateway payloads. Empty invoice,
credit-note, document and writeback pages were not obtained. Differences between
actual invoice/credit-note payloads remain NOT_TESTED.

## Per-operation classifications

Overall gateway-tier verification is accepted from the user-supplied completed
audit. The narrower per-operation auth label below refers to an authenticated
**production-dashboard session request**, not a rejection of that backend audit.
No per-operation successful gateway sample was independently inspected here.

| Operation                                              | Fresh deployed GET | Source at deployed SHA                                  | Classification                  |
| ------------------------------------------------------ | ------------------ | ------------------------------------------------------- | ------------------------------- |
| Overview                                               | 401 JSON           | Forwarding definition present                           | ROUTE_CONFIRMED_AUTH_UNVERIFIED |
| Invoice history                                        | 401 JSON           | Forwarding definition present                           | ROUTE_CONFIRMED_AUTH_UNVERIFIED |
| Credit-note history                                    | 401 JSON           | Forwarding definition present                           | ROUTE_CONFIRMED_AUTH_UNVERIFIED |
| Full invoice register                                  | 401 JSON           | Forwarding definition present                           | ROUTE_CONFIRMED_AUTH_UNVERIFIED |
| Full credit-note register                              | 401 JSON           | Forwarding definition present                           | ROUTE_CONFIRMED_AUTH_UNVERIFIED |
| Writeback operations                                   | 401 JSON           | Local unavailable gate at commit contract lines 128-139 | FRONTEND_LOCALLY_BLOCKED        |
| Services observations                                  | 401 JSON           | Forwarding definition present                           | ROUTE_CONFIRMED_AUTH_UNVERIFIED |
| Passive device information                             | 401 JSON           | Local unavailable gate at commit contract lines 120-122 | FRONTEND_LOCALLY_BLOCKED        |
| Production session                                     | 401 JSON           | Signed dashboard cookie required                        | ROUTE_CONFIRMED_AUTH_UNVERIFIED |
| Successful response DTOs/counts/pagination/empty pages | None obtained      | Cannot infer from schema source                         | NOT_TESTED                      |
| G03 cancellation and every mutation                    | Not requested      | Out of audit scope                                      | NOT_TESTED                      |

Writeback/device gate classifications are based on the exact source attached to
the deployment's recorded Git SHA. An authenticated 503 from those branches was
not directly captured; unsigned 401 happens first.

## Intentional local contract gates and required evidence

This table distinguishes current working-tree repairs from the deployed source.

| Family                                               | Current working-tree behavior                                    | Source at deployed commit             | Evidence needed before changing any gate                                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Invoice/credit-note request detail and request alias | CONTRACT_ROUTE_UNAVAILABLE                                       | GATEWAY_ROUTE_UNAVAILABLE             | Exact registered detail paths/ID semantics and successful nested request DTOs, including safe errors and identity matching                       |
| Full document details                                | CONTRACT_ROUTE_UNAVAILABLE                                       | Prepared forwarding definitions exist | Exact full-register/detail route matrix, document IDs/types, actual source/fiscal joins and original-invoice references                          |
| Capabilities                                         | GATEWAY_ROUTE_UNAVAILABLE                                        | Same local gate                       | Registered gateway route, bearer scope and successful capability envelope                                                                        |
| Manual-review list/case                              | GATEWAY_ROUTE_UNAVAILABLE; active collection parser is z.never() | Same route gates                      | Exact empty/nonempty collection and case DTOs, pagination/nullability and allowed reads                                                          |
| Reconciliation/events/operations                     | CONTRACT_SCHEMA_UNAVAILABLE; active parser is z.never()          | GATEWAY_ROUTE_UNAVAILABLE             | Exact safe row DTOs and page envelopes, status/type enums, ordering, timestamps, pagination and error samples                                    |
| Health/telemetry aliases                             | CONTRACT_ROUTE_UNAVAILABLE                                       | Same local gates                      | Dedicated authorized read contract if such aliases are actually needed; current Health uses Services                                             |
| Independent writeback detail                         | CONTRACT_ROUTE_UNAVAILABLE                                       | Same local gate                       | A real authorized GET detail contract, or use the existing request/collection projection                                                         |
| Writeback/device collections                         | Existing strict forwarding validators enabled locally            | GATEWAY_ROUTE_UNAVAILABLE             | Actual response compatibility and separately authorized release of reviewed changes; gateway route existence alone does not update deployed code |
| G03 cancellation                                     | Disabled in current UI/proxy                                     | Older relay source is present         | Separate backend authorization security review; do not assume an unshipped local block secures production                                        |

Current gate references: `api/_lib/dashboard-contracts.ts:92`, `:113`, `:155`,
`:173`, `:184`, `:204`, `:223`.
Active unknown-family parser: `src/features/api/ApiOperations.tsx:125`.
Current cancellation denial: `api/_lib/dashboard-gateway.ts:494`.

No gate was removed or exercised by bypassing authentication. The older deployed
cancellation relay was not called; its security was not tested or changed.

## Browser secret boundary

The deployed-commit client sends cookies to same-origin dashboard functions and
does not inject the gateway service bearer. The server-held bearer is used in the
API handler. No matching public upstream/token/secret variable names were found
in the inspected Vercel project metadata.

The served Overview HTML returned HTTP 200 and referenced
1 first-party JavaScript entry script. It was fetched
as text, without execution or rebuilding:

| Asset                       | HTTP | Bytes   | SHA-256                                                            |
| --------------------------- | ---- | ------- | ------------------------------------------------------------------ |
| `/assets/index-hLXDel1f.js` | 200  | 1120201 | `08940d290b3c74732c71154f5c9fe7593bb77d37812da8be405dcde8db6a9f8f` |

Checks of that served script found no `DASHBOARD_UPSTREAM_TOKEN`,
`DASHBOARD_SESSION_SECRET`, `GOOGLE_CLIENT_SECRET` or `DASHBOARD_USER_IDS`
literal, and no `g11server.tailaff2e5.ts.net` hostname.

This supports the intended server-only boundary. The protected token's actual
value was never retrieved, so an exact-value comparison was not performed.
This was a check of the HTML-referenced entry script, not an exhaustive scan
of every possible dynamic asset or third-party script.

## Remaining verification and conclusion

To establish END_TO_END_VERIFIED, a normal authorized production dashboard
session must be made available through an approved browser/testing channel.
No token or cookie should be pasted into this report or chat. Repeat the same
eight GETs, capture safe request IDs, validate every successful payload with
the actual existing Zod schema and verify page/ID/range/count semantics.
Contract gates and production settings must remain unchanged during that audit.

The user-confirmed backend prefix is consistent with both deployed and local
URL construction. There is no demonstrated base-URL suffix mistake in the
current Production setting. The unresolved production-connection question is
not answered by unsigned 401s or local test passes. Authentication acceptance
and real Vercel-to-G11SERVER data transport remain unverified here.

**No deployment, restart, rebuild, push, setting change, backend change or live
mutation occurred.**
