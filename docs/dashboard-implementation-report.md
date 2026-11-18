# Dashboard implementation report

The later post-middleware-audit repair is recorded in
[dashboard-integration-fixes.md](dashboard-integration-fixes.md), with current
[route evidence](dashboard-route-compatibility.md) and
[test results](dashboard-test-results.md). Those records supersede earlier
integration assumptions below. Cancellation is now disabled in the dashboard;
the canonical namespace awaits the transferred G11SERVER route matrix.

## Current audit and implementation mission — 2026-11-18

This section records the current request. The report below it is retained
historical evidence from earlier work; its push/deployment authorization does
not apply to this mission. No push, deployment, production configuration change,
G11SERVER modification, fiscalization, writeback or device cancellation has been
performed in this mission.

**Result:** dashboard fixes and local production checks pass. Production
readiness is not established: operational gateway contracts and fresh
authenticated data verification remain outstanding.

The starting checkout was commit `4663dbf`, with no tracked modifications and
22 untracked user documentation files. Those user files are preserved. All work
is confined to the dashboard repository. Seven specialist agents performed work
in bounded stages within the available agent slots: architecture, UI, documents,
operations, API integration, testing and Vercel preparation.

### Deliverables and initial findings

- [Feature audit](DASHBOARD-FEATURE-AUDIT.md): architecture, all fourteen required
  pages, implementation classifications, existing components, duplicate/demo
  paths and backend limitations. Windows resolves this requested name to the
  existing tracked `DASHBOARD-FEATURE-AUDIT.md` file.
- [Gateway integration requirements](gateway-integration-requirements.md): each
  existing frontend caller, local route, documented upstream candidate, method,
  query, authentication, executable schema, errors and individual confirmation
  requests for G11SERVER. Prepared for handoff; no external team message was sent.
- This report: current changes, actual verification and remaining release gates.

All required routes already existed. Rebuilding them would discard working
behavior. Supported reads include overview, persisted invoice/credit-note
histories, services and prepared source-document registers/details. Separate
fiscal receipt evidence, transmission, reconciliation and writeback states are
preserved. Several operational reads remain explicitly disabled because the
current Public Gateway exposure and/or exact response DTOs are unconfirmed.
Manual review, system events and pending operations lack a verified success
contract; an unavailable view does not fulfill the production records criterion.

### Implemented corrections

- Global Refresh includes active source-document list/detail and G03 receipt
  queries, in addition to middleware queries. Failed refreshes retain an error
  outcome rather than updating the successful-refresh timestamp.
- Opening mobile navigation expands a previously collapsed desktop sidebar;
  choosing Settings closes the mobile menu. Settings displays the effective
  clamped refresh interval.
- Mobile page actions keep readable text labels and wrap when needed. Browser
  verification exposed the shared heading rule hiding Requests refresh text;
  text-only telemetry/writeback actions were affected by the same rule.
- Clearing CU/KRA comparison filters preserves the chosen invoice or credit-note
  family and clears its source filters and pagination.
- Monitoring now displays dependency observations, counters, HTTP duration
  histograms and worker evidence from the existing services endpoint, reusing
  the validated health renderer. Missing, empty, stale and unavailable metrics
  remain distinct, and the operation directory remains accessible.
- A locally blocked `GATEWAY_ROUTE_UNAVAILABLE` now identifies the requested
  resource and explicitly states that no upstream request occurred. The error is
  retained. Tests distinguish it from a real forwarded 401/403/404/503 using
  `upstreamStatus`.

### Changed files in this mission

| Files                                                                                 | Purpose                                                                                    |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/app/App.tsx`, `App.test.tsx`                                                     | Complete active-read refresh coverage, mobile navigation and regressions                   |
| `src/features/api/ApiDocuments.tsx`, `ApiDocuments.test.tsx`                          | Preserve document family when resetting comparison filters                                 |
| `src/features/api/ApiOperations.tsx`, `ApiOperations.test.tsx`, `ApiSystemHealth.tsx` | Services-backed Monitoring and observation/error/freshness tests                           |
| `src/features/api/ApiOperationalPages.tsx`, `src/styles.css`                          | Effective settings interval and readable narrow-screen actions                             |
| `api/_lib/dashboard-gateway.ts`, `dashboard-operations-gateway.test.ts`               | Identify local route restrictions without hiding upstream failures                         |
| `scripts/verify-live-gateway.mjs`, `scripts/verify-dashboard-browser.mjs`             | Distinguish attempted contracts from local blocks and cover all required responsive routes |
| This report, feature audit, gateway requirements and deployment-readiness report      | Reviewable evidence and remaining integration contracts                                    |

### Error investigation

`GATEWAY_ROUTE_UNAVAILABLE` is generated by the BFF for entries deliberately
marked unavailable in `api/_lib/dashboard-contracts.ts`, before network access.
It does not establish a missing upstream route or failed service credential.
Forwarded failures retain a safe request ID and upstream status; upstream
401/403 becomes 502 while the valid local session is retained. The integration
requirements explain how to distinguish all four causes requested by the user.

The historical overview `400 INVALID_QUERY` was caused by a Vercel catch-all
injecting routing parameters into a strict application query. The existing
consolidated static function consumes only the fixed `dashboardResource`
selector; regression tests preserve date serialization, range checks and
rejection of unknown/duplicate/injected parameters. That fix is preserved.

### Verification and live access

The initial observed verification run passed TypeScript and **744 tests, with 8
optional desktop tests skipped** (30 passing test files, one skipped). Specialists
were working concurrently, so this is not a claim of a pristine baseline run.
Focused specialist verification passed App (26),
document/provisional (86), gateway/routing (86), and operations/health (21)
tests. These suites overlap and are not additive test totals.

Final combined checks after all application changes:

| Check                                               | Current result                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm.cmd run typecheck`                            | PASS                                                                                                  |
| `pnpm.cmd run lint`                                 | PASS                                                                                                  |
| `pnpm.cmd run format:check`                         | PASS; documentation is formatted again after final evidence edits                                     |
| `pnpm.cmd test`                                     | PASS: **756 passed, 8 skipped**, 30 passing files and one skipped file                                |
| `pnpm.cmd run build`                                | PASS: TypeScript and Vite production output                                                           |
| Diagnostic script lint and `git diff --check`       | PASS                                                                                                  |
| Native PowerShell contract-inventory companion test | PASS: markers, exclusions, no source disclosure, read-only behavior, missing roots, bounded traversal |
| Local responsive browser checks                     | PASS: **66 assertions**, all 14 routes, zero failures                                                 |

The eight skipped tests are explicit opt-in desktop middleware checks, not
successful G11SERVER integration tests. The suite includes controlled BFF/auth,
query/routing, contracts, response validation, UI/error behavior and the actual
production-bundle server-secret canary check. No production secret is used in
those tests. The build retains an existing large-JavaScript-chunk warning
(main bundle approximately 1.12 MB, 327 KB gzip); it is not a build failure.

Responsive browser verification uses explicitly labeled local fixtures. It
found the hidden mobile heading-action labels, which were fixed in shared CSS.
The successful rerun verified all fourteen expected route headings, contained
mobile layouts, readable text actions, desktop-collapse to mobile expansion,
Settings dismissal, request details/Escape, unavailable document views, invalid
dates, zero uncaught runtime exceptions and zero API calls in demo mode.
Its result and screenshots are in
`.browser-validation-VSHteN/artifacts.tmp/results.json` inside this checkout.
Desktop and mobile representative screenshots were visually reviewed. These
local ignored artifacts contain only fixture evidence; no fixture run is
evidence of live gateway data.

The navigation screenshot captured an intermediate slide-animation frame.
The diagnostic now waits for the menu to settle onscreen before capture, but
that final diagnostic-only timing adjustment was not rerun after its launch was
interrupted. The 66-check application result remains the completed browser run;
the navigation screenshot is not proof of its final visual position.

The read-only live diagnostic was attempted with the existing Vercel CLI:

```powershell
node <existing-vercel-cli>/vc.js env run --project zoho-armco-dashboard --environment production -- node scripts/verify-live-gateway.mjs
```

The sandbox network attempt failed. The approved network retry reached Vercel,
which reported that three protected Production secret values cannot be pulled.
The verifier stopped at its configuration guard before any authenticated gateway
read. No credential value was printed or written to a local file. This is a
credential-availability block, not evidence that the gateway is unreachable or
that a route is missing. A request for approved local server-only configuration
or sanitized G11SERVER route/DTO evidence is pending.

The retained historical report records prior user-observed signed-in Overview
and Invoices acceptance. That evidence is not a fresh authenticated test of this
mission, nor proof of the other operational endpoints. Local fixture tests prove
client/BFF behavior only.

Fresh read-only Vercel inspection confirmed existing production deployment
`dpl_8q3WpGyoGpJsdgDtk7fs6D6sqNLZ` is READY at baseline commit
`4663dbf751b686fe0467395bc27d9bcfb196f9a3`, with the expected production alias.
Current environment names and Production scopes include the gateway and auth
settings; plaintext values were not inspected. These local changes are not in
that deployment. The deployment specialist records full evidence and limits in
[deployment readiness](dashboard-deployment-readiness.md).

Fresh unsigned production probes returned JSON 401 for auth session, overview
with valid ISO dates, services, capabilities and both source-document lists.
The private `_dashboard` utility path returned 404; login redirected to
`accounts.google.com`. This verifies the deployed API/session boundary and
absence of SPA fallback on those API paths, not successful OAuth login,
authenticated gateway reads or response DTO compatibility.

### Remaining release gates

Production readiness is **not established**. Confirm every upstream mapping and
response contract in the integration requirements, then verify authenticated
real invoice and credit-note lists/details, receipt provenance, request details,
writeback records, manual review, operational reconciliation, events, pending
operations, passive device state and capabilities. Validate service and G03
identity/permission behavior without issuing audit-time mutations. Unsupported
operations must remain unavailable until their contracts are confirmed.

The source remains prepared for the existing Vercel target, with server-only
`DASHBOARD_UPSTREAM_BASE_URL=https://g11server.tailaff2e5.ts.net` and
`DASHBOARD_UPSTREAM_TOKEN`; no browser-to-middleware or database connection is
introduced. A GitHub push or Vercel deployment requires separate explicit
authorization under the current request.

## Retained historical implementation and deployment verification

Audit date: 2026-11-18. Repository:
`C:\Users\pc\Documents\GitHub\zoho-armco-dashboard`.

## Assessment

This report describes the current dashboard checkout, including the substantial
uncommitted work that existed before this mission. Existing changes and deleted
action entrypoints were preserved. No middleware or Public Gateway source was
modified, and no live fiscalization, writeback or cancellation was performed.
The user subsequently authorized committing and pushing the verified changes,
then testing the production URL. Repository push and hosted verification results
are recorded separately from local readiness evidence.

The user confirmed `zoho-armco-dashboard.vercel.app` as the intended production
target. Local application checks do not establish authenticated compatibility
with the current gateway, deployed environment settings, or production readiness.
Local type, lint, format, automated tests and production build checks pass. The
corrected application is deployed successfully, and the user confirmed normal
signed-in Overview and Invoices views load live data. Remaining operational
contract gaps are documented below; this is not a claim that every backend
capability has been verified.

The complete discovery inventory and every A–H acceptance item are in
[the feature audit](DASHBOARD-FEATURE-AUDIT.md), under the dated mission section.
Initial statuses describe findings before this mission's fixes; the completion
section in that audit records the resulting local behavior.

## Architecture and existing functionality preserved

- React 19 / TypeScript / Vite SPA; React Router handles page navigation.
- TanStack Query provides validated, separately keyed data queries and polling.
  Zod schemas reject malformed API payloads rather than displaying arbitrary JSON.
- Existing invoice and credit-note registers, source document details, original
  invoice references, fiscalization history, filters, pagination, page sorting,
  receipt comparisons, writeback views, and operational page shells were retained.
- Fiscal receipt evidence, reconciliation state, transmission state and Zoho
  writeback state remain separate. A submitted request is not proof of a receipt.
- The browser calls same-origin Vercel API functions. The existing shared BFF
  authenticates the local session, validates fixed paths/queries, adds the
  server-held upstream credential, bounds responses and projects safe fields.
- Existing Google OIDC uses state, nonce, PKCE, signature/claim verification and
  an approved email/role map. Signed Secure/HttpOnly host-only sessions expire and
  are checked against the current allowlist. Local roles are admin/operator/viewer.
- Explicit local demo data stays labeled and development-only. Production never
  silently substitutes fixtures after an API failure.
- Existing G03 receipt read/cancellation relay and its administrator confirmation,
  identity, origin and response-evidence protections were preserved. Its dedicated
  `/api/device/g03/*` routes are distinct from fiscalization/writeback actions;
  those action entrypoints were already deleted in the user's working tree.

## Overview `400 INVALID_QUERY` investigation

Git commit `8f23fa250247c631211b37d70acfdb2f70e6776b` replaced
`api/dashboard/[...path].ts` with static resource entrypoints. The previous plain
Vercel Node dynamic route injected a routing query parameter into `req.url`.
The strict dashboard query validator rejected that extra parameter even when
`createdFrom` and `createdTo` themselves were valid. Direct middleware requests
did not traverse that route and could therefore return 200 for the same dates.

The static entrypoints and the regression in
`api/_lib/dashboard-routing.test.ts` already existed at the start of this mission.
They were preserved. The test exercises real exported handlers with a signed
test session, encoded and unescaped ISO timestamps, fractional seconds, and
offset-aware Nairobi boundaries. Unknown keys, duplicate keys, unordered windows,
offset-less timestamps and invalid pagination remain errors. The existing
`overview-dates.ts` normalizes date-only inputs before sending the strict wire
contract; the server does not accept date-only timestamps by weakening validation.

A production fix cannot be certified on the basis of these local regressions
alone: the checked-out routing must be deployed, followed by an authenticated
overview request through that deployment. No deployment was authorized here.

## Current network evidence

Read-only HTTPS observations were taken during this mission without credentials:

| Target                                                                                    | Result                                    | What it establishes                                                                                   |
| ----------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Public Gateway root                                                                       | 404 JSON                                  | Public origin responds.                                                                               |
| Gateway overview, invoices, credit-notes, services, capabilities                          | 401 JSON `Unauthorized` with `request_id` | Authentication is enforced; successful DTOs and bearer scope remain unverified.                       |
| Gateway invoice/CN request details using `contract-probe`                                 | 401 JSON                                  | Does not establish document existence or response compatibility.                                      |
| Gateway four document paths using synthetic detail IDs                                    | 401 JSON                                  | Does not establish register/detail availability after authentication.                                 |
| Gateway writebacks, manual-review list/detail, reconciliation, events, operations, device | 401 JSON                                  | Older recorded 404 results are stale; no conclusion about successful route exposure follows from 401. |
| Production `/api/auth/session` without cookies                                            | 401 JSON `unauthorized`                   | Hosted auth session route responds and rejects unsigned access.                                       |
| Production `/api/dashboard/capabilities` without cookies                                  | 404 platform text `NOT_FOUND`             | Current deployment differs from the local static route inventory.                                     |

Additional unauthenticated production checks of overview (with valid ISO date
filters), invoices and services returned 401 JSON `unauthorized`. These establish
that the existing routes enforce session access, not successful downstream data
retrieval or a deployed resolution of the authenticated overview problem.

No successful authenticated middleware response was obtained. The process had no
dashboard/Google/Vercel environment variables and the checkout contained only
`.env.example`, not a configured environment file. No production secret was
retrieved or printed. Network observations from this computer do not prove that
Vercel Functions can reach the gateway.

## API integration scope

The existing local mappings remain the source of truth in
`api/_lib/dashboard-contracts.ts`:

| Same-origin API                                                          | Upstream integration                                                                                                        |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `/api/dashboard/overview`                                                | Fixed GET of the same path; required bounded `createdFrom`/`createdTo`.                                                     |
| `/api/dashboard/invoices`, `/requests`                                   | Fixed GET `/api/dashboard/invoices`; persisted invoice request history.                                                     |
| `/api/dashboard/credit-notes`                                            | Fixed GET of the same path; persisted credit-note request history.                                                          |
| `/api/dashboard/services`                                                | Fixed GET of the same path; no query; safe dependency/telemetry schema.                                                     |
| `/api/dashboard/documents/invoices`, `/documents/credit-notes`           | Fixed document register GETs; page metadata and provisional safe nested projections.                                        |
| `/api/dashboard/documents/invoice?id=ID`, `/documents/credit-note?id=ID` | Fixed plural upstream document-detail paths with encoded IDs.                                                               |
| `/api/device/g03/current-receipt`                                        | Existing trusted-identity GET relay to `/integrations/device/g03/current-receipt`.                                          |
| `/api/device/g03/cancel-receipt`                                         | Existing administrator-only POST relay to `/integrations/device/g03/cancel-receipt`; never exercised against a live device. |

Request-detail, writeback, manual-review, persisted reconciliation, event,
operation, capabilities and passive device reads deliberately remain locally
unavailable where current safe contract/access evidence is missing. Health and
telemetry use the documented services route rather than forwarding a read bearer
to unapproved integration or health-probe endpoints. The document projections
remain explicitly provisional; provider examples do not prove middleware joins.

The existing `/reconciliation` page compares CU/KRA values over the loaded
document page. It is not the unavailable persisted operational reconciliation
collection and does not claim complete-register coverage.

## Changes and validation

The six requested specialist roles were completed in two waves within the
four-agent concurrency limit: architecture/feature audit, UI/UX, fiscalization
workflow, API/integration, reliability/testing, and deployment/configuration.

### Implemented local corrections

- Overview service diagnostics render independently when aggregate counts fail.
  Separate invoice and credit-note confirmed receipt counts use the backend
  metrics. Rolling time windows advance on polling and explicit refresh, so new
  requests do not remain excluded by a frozen end timestamp.
- System health reuses the existing services query/cache/polling. Every cached
  dependency observation is marked stale after refresh failure, including
  responses with no observability snapshot. Missing counters remain unavailable.
- Navigation has stateful collapse labels, mobile menu focus handling, Escape
  support and offscreen visibility handling. Execution links preserve invoice
  versus credit-note identity. Refresh feedback reflects real active reads.
- Request history displays CU receipt number, safe verification link and
  fiscalization timestamp from the existing list DTO, gated by
  `confirmedReceiptEvidence`. No unavailable request detail is fabricated.
- Invalid request filters and selected IDs produce explicit errors. Impossible
  dates, malformed pagination and invalid kinds/statuses cannot silently broaden
  the query by becoming omitted filters or default pages.
- Document details validate the requested kind, outer Zoho document ID and any
  supplied nested source ID in both the UI query and BFF. Optional omitted source
  IDs remain optional rather than becoming a new backend restriction.
- The BFF rejects schema-valid overview counts for a different requested time
  window. Equivalent UTC/offset instants remain accepted. Nonempty pagination
  rows beyond the declared total are rejected; an empty page beyond the end is
  valid.
- Routing regressions replay the former injected parameter against the real
  static overview handler while keeping valid ISO date requests working.

### Mission file inventory

These are additions/edits made by this mission, not a claim that every current
Git diff originated here. Existing uncommitted implementations in these files
were retained.

| Files                                                                                                                            | Purpose                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/app/App.tsx`, `src/app/App.test.tsx`, `src/styles.css`                                                                      | Refresh evidence and accessible responsive navigation.                           |
| `src/features/api/ApiOperationalPages.tsx`, `ApiOperationalPages.test.tsx`, `ApiOverview.test.tsx`                               | Independent health, confirmed counts, rolling dates and correct execution links. |
| `src/features/api/ApiSystemHealth.tsx`, `ApiSystemHealth.test.tsx`, `queries.ts`                                                 | Shared services polling and truthful stale health.                               |
| `src/features/api/ApiRequests.tsx`, `ApiRequests.test.tsx`                                                                       | Request validation and receipt evidence.                                         |
| `src/features/api/ApiDocuments.tsx`, `ApiDocuments.test.tsx`                                                                     | Selected document identity/type validation.                                      |
| `api/_lib/dashboard-gateway.ts`, `dashboard-gateway.test.ts`, `document-gateway.test.ts`, `dashboard-operations-gateway.test.ts` | Response identity, selected-range and pagination integrity.                      |
| `api/_lib/dashboard-routing.test.ts`                                                                                             | Exact former overview routing-injection regression.                              |
| `vercel.json`                                                                                                                    | Explicit existing Vite install/build/output settings; security/routing retained. |
| `docs/DASHBOARD-FEATURE-AUDIT.md`                                                                                                | Preserved prior evidence plus full A–H mission audit and completion appendix.    |
| `docs/dashboard-implementation-report.md`                                                                                        | Combined implementation, verification and readiness assessment.                  |
| `docs/dashboard-reliability-verification.md`, `docs/dashboard-deployment-readiness.md`                                           | Specialist verification evidence and remaining external checks.                  |

Additional verification file: `api/_lib/deployment-config.test.ts` covers direct
SPA navigation and exclusion of API routes from the HTML fallback.

### Combined verification results

| Check                           | Result                                                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency/manifest consistency | All 31 declared runtime/development dependency specifiers match the application lock and installed manifests.                                                                                     |
| Frozen install validation       | Passed in an isolated directory with pnpm 12.16.1, `--frozen-lockfile --lockfile-only --ignore-scripts --offline`; source and copy lock hashes unchanged. This is not a clean network install.    |
| `pnpm.cmd run typecheck`        | Passed.                                                                                                                                                                                           |
| `pnpm.cmd run lint`             | Passed across the repository.                                                                                                                                                                     |
| `pnpm.cmd run format:check`     | Passed across the repository.                                                                                                                                                                     |
| `pnpm.cmd test`                 | 30 test files passed, 1 skipped; 736 tests passed, 8 skipped.                                                                                                                                     |
| `pnpm.cmd run build`            | Passed; TypeScript plus Vite production build.                                                                                                                                                    |
| `git diff --check`              | Passed; platform line-ending notices are informational.                                                                                                                                           |
| Credential handling             | Production-bundle canary test passed: server values/modules and upstream host absent from browser assets. Targeted source scan found no private key or common cloud/GitHub credential signatures. |

The initial combined baseline was 681 passed and 8 skipped. The eight skipped
cases are explicitly opt-in desktop middleware checks requiring their own test
server and credential; they are not verified live integrations. Focused
specialist suites overlap the combined suite and must not be added to its count.

The environment's pnpm engine-store lock was inaccessible to some sandboxed
commands. The affected checks were rerun using approved escalation and passed.
An intermediate health test failed while its shared-query retry behavior was
being changed; its timeout was aligned with the existing retry and the final
focused and combined runs passed. No unresolved automated failure remains.

The production build reports one nonblocking chunk-size warning: the main bundle
is about 1.12 MB minified / 328 kB gzipped. Existing charting and operational views
remain in the established bundle. A separate performance improvement can split
routes without confusing that warning with a failed build.

### Deployment preparation evidence

`vercel.json` explicitly selects Vite, `pnpm install --frozen-lockfile`,
`pnpm run build`, and `dist`. Node 22 and pnpm 12.16.1 remain pinned. Static API
entrypoints, API-excluding SPA fallback, function limits and security headers
were preserved. The 15-case deployment configuration regression passes.

The isolated frozen-lock check left `pnpm-lock.yaml` unchanged with SHA-256
`ace2bf6a11bce697e486e278315961733b4422b35fdebd30c0e3940b75b602b4`.
No application dependency was installed or upgraded during this mission. Local
Node 22.22.0 satisfies the declared engine. The lockfile's first YAML document
contains package-manager dependencies; the second contains the full application
lock. Both were validated and retained.

A Vercel plugin is available but not connected; discovery also showed it had
already been suggested recently, so no duplicate connection suggestion was sent.
There is no local `.vercel/project.json`. The user-confirmed project is therefore
not yet independently tied to a remote project ID, Git revision or actual
environment settings. No deployment setting or secret was changed remotely.

## Required production configuration

| Variable                      | Scope and requirement                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `VITE_DATA_MODE`              | Public build setting: `api`; demo data is rejected in production.                                            |
| `VITE_REFRESH_INTERVAL_MS`    | Optional public polling interval; default 30000 ms, minimum 10000 ms.                                        |
| `DASHBOARD_AUTH_URL`          | Server-only exact HTTPS production origin, with no path or trailing slash.                                   |
| `DASHBOARD_SESSION_SECRET`    | Server-only random signing secret of at least 32 bytes.                                                      |
| `GOOGLE_CLIENT_ID`            | Server-only Google OAuth Web client identifier.                                                              |
| `GOOGLE_CLIENT_SECRET`        | Server-only matching OAuth client secret.                                                                    |
| `DASHBOARD_ALLOWED_USERS`     | Server-only JSON approved email-to-role map.                                                                 |
| `DASHBOARD_UPSTREAM_BASE_URL` | Server-only exact gateway origin `https://g11server.tailaff2e5.ts.net`; no API path or embedded credentials. |
| `DASHBOARD_UPSTREAM_TOKEN`    | Server-only dedicated approved gateway service credential, without `Bearer ` prefix.                         |
| `DASHBOARD_USER_IDS`          | Server-only approved email-to-internal-user-ID map required for the existing G03 identity relay.             |

Do not put server values in any `VITE_` variable. Configure Google redirect URI
`https://zoho-armco-dashboard.vercel.app/api/auth/callback` for this confirmed
production origin. Keep Preview values and redirect origins separate.

## Release dependencies

1. Supply authenticated, sanitized current gateway payloads for every enabled
   read. Verify schema fields, nullability, source identity, timestamps, requested
   filters, pagination and receipt provenance, not just HTTP status.
2. Establish the current gateway allowlist/bearer scope and exact safe DTOs for
   request detail, manual-review list/detail, persisted reconciliation, events,
   operations, writebacks, capabilities and passive device diagnostics. The
   existing unknown operational row validator is intentionally `z.never()`.
3. Verify the established middleware operator identity flow and exact action
   contracts before connecting fiscalization/writeback retry or reconciliation
   mutations. A dashboard session is not a middleware operator session, and the
   read bearer alone does not grant mutation authority.
4. Verify actual Vercel project linkage, server environment settings and network
   reachability; run hosted Google login/logout and authorized role scenarios.
5. Local Edge fixture checks cover desktop/mobile navigation and rendering;
   production authenticated document layouts and OAuth flows still need hosted
   verification.

No missing backend capability was fabricated, no new fiscalization eligibility
rules/cooldowns/locks were introduced, and no backend was modified to accommodate
the dashboard. Production signoff remains conditional on the concrete integration
dependencies above. The user's subsequent push authorization permits the planned
GitHub push and connected Vercel deployment; it does not establish that live
integration has passed.

## Browser verification and final preparation

The dependency-free `scripts/verify-dashboard-browser.mjs` helper launched a local
Vite demo session and headless Edge. Nineteen checks passed at 1440px desktop and
390px mobile, with no API requests or uncaught browser exceptions. Visual
inspection then found and corrected mobile request paragraph flow and the hidden
refresh label. The helper includes explicit regression checks for both styles.
Local browser startup required a proxy bypass; cold-start retries are recorded
in ignored local artifacts rather than counted as passed checks.

The final focused Requests suite passed all 36 tests after the mobile corrections.
Generated Edge profile data is excluded from ESLint/Prettier traversal; it is not
application source or a pre-existing lint failure. No production secret or browser
profile is included in the commit. Existing unrelated untracked middleware notes
remain in the working tree.

## Authorized push and hosted verification

After local checks, the user authorized pushing the changes and testing through
the production URL. Commits `e9f704a` (dashboard implementation) and `0b01c8d`
(inventory-script whitespace cleanup) were pushed to `origin/main` successfully.
Unrelated untracked middleware notes remain local and were not included.

GitHub Actions run `44247752817` completed successfully on the pushed revision.
Its Ubuntu clean install with `pnpm install --frozen-lockfile`, type check, lint,
format check, automated tests and production build all passed. This extends the
local frozen-lock-only validation with a successful clean CI installation.

The connected Vercel deployment `dpl_9eAgh4P6eUw3e1JAXkmX8PMmfBME` failed:
[deployment details](https://vercel.com/mcwachiras-projects/zoho-armco-dashboard/9eAgh4P6eUw3e1JAXkmX8PMmfBME).
GitHub's status reports failure but does not include the build error. The Vercel
CLI was obtained for log inspection; it requires account login because no saved
Vercel credential or connected plugin is available. The exact deployment failure
must be retrieved before a targeted correction can be made.

Post-push production probes returned 200 HTML for `/` and `/overview`, 401 JSON
for unsigned auth-session/overview/services reads, and platform 404 for
`/api/dashboard/capabilities`. The served browser asset was still
`index-DDhDKKM9.js`, whereas the new local production build emits
`index-XueC5g4V.js`. Combined with the failed deployment status, these observations
do not verify the pushed application on production.

The repository is pushed and CI-verified. Deployment success and authenticated
middleware integration remain incomplete; neither is presented as production
readiness. Later browser retries after the mobile CSS correction encountered
browser/CDP cold-start timeouts before assertions; the earlier 19-check browser
run remains the completed fixture result, and the mobile correction has a passing
36-test focused Requests run plus the final build/lint/format checks.

### Confirmed deployment failure and packaging correction

After the user completed Vercel CLI login, structured deployment metadata
identified `exceeded_serverless_functions_per_deployment`: the Hobby project
allows twelve functions. The successful frontend build was followed by failure
while deploying outputs. Its function compiler also reported `Object.hasOwn`
library errors, because its compilation did not inherit `tsconfig.node.json`.
Those two calls now use `Object.prototype.hasOwnProperty.call` with identical
own-property security semantics.

The existing static resource modules were moved from `api/dashboard/` to
`api/_dashboard/`, retaining their shared-handler imports and contract tests.
Vercel excludes underscore-prefixed utility directories from function discovery.
Each previous public resource URL now has a fixed, exact rewrite to the single
static `api/dashboard.ts` entrypoint. Together with the three existing auth
entrypoints and two G03 entrypoints, the deployment contains six functions.
No public URL, upstream mapping, authorization rule or supported action changed.

Only the explicit `dashboardResource` rewrite selector is consumed. It must occur
once and name an existing route; duplicate or unknown selectors fail. Every
application query parameter still reaches the existing strict validator,
including arbitrary `path`/`...path`, unknown keys and duplicates. There is no
bracketed dashboard route and no generic caller-selected upstream proxy. Node
request header accessors are preserved explicitly rather than object-spread.
Tests exercise the real consolidated handler and configured rewrites with signed
sessions, exact ISO date windows, old injected parameters, selector injection,
prototype-backed headers and the six-function inventory.

Authenticated project metadata confirms project ID
`prj_potkn87ChosvYHOwd2WvM4qzvEWz`, Vite, repository
`zoho-armco-dashboard`, root directory unset (repository root), and production
branch `main`. The project has Google client ID/secret, session secret, auth URL,
allowed users, upstream URL/token and trusted user IDs in Production. Values were
not printed. Project Node 26 is overridden by the repository engine; build logs
confirm Node 22. No remote setting was changed.

The read-only `scripts/verify-live-gateway.mjs` diagnostic reports only endpoint
status and schema compatibility. An attempt using `vercel env run` stopped before
any gateway request because Vercel will not export protected Production secret
values. Those protections were preserved; no local secret file or fabricated
production session was created.

The final consolidation regression run passed **740 tests, 8 optional desktop
skips** across 30 passed files and one skipped file. An earlier run during
concurrent heavy build/check activity timed out in the first Requests test and
affected the following test; the complete standalone rerun passed. Repository
lint, formatting and TypeScript/Vite build were rerun for the packaging fix.

### Successful production deployment and acceptance

Commit `f7bdfd5` was pushed to `main`. Vercel deployment
`dpl_AaAaYLRgmsPEJZhWzuP8aRRVyjGi` is **READY**, with the expected
`https://zoho-armco-dashboard.vercel.app` production alias. Structured output
confirms exactly six Node.js 22 functions and the reviewed fixed resource
rewrites. GitHub Actions run `44250321667` completed **successfully**, including
clean installation and all CI checks.

Read-only production checks after deployment confirmed:

- `/` and `/overview`: 200 HTML with the new emitted `index-hLXDel1f.js` bundle.
- Unsigned auth session, overview with valid ISO date filters, services,
  capabilities, document lists/detail, manual review and current-receipt requests:
  401 JSON, proving the handlers enforce session access instead of returning SPA
  HTML. Capabilities previously returned a platform 404; its rewrite now works.
- `/api/_dashboard/overview`: 404, confirming resource utility files are not
  exposed as functions.
- `/api/auth/login`: 302 to `accounts.google.com`; no provider login was automated.

The user then signed in with their normal approved account and explicitly
confirmed **Overview and Invoices load data**. This establishes user-observed
live acceptance for those two views and confirms the overview no longer produces
the reported `400 INVALID_QUERY` in that session. It does not establish all other
operational endpoints, every field/provenance rule, every role or recovery action.

Deployment is successful. Remaining release limitations are the exact missing
operational schemas/permissions listed above, authenticated acceptance of other
views and actions, and broader production device/reconciliation evidence. No
fiscalization, writeback, cancellation, backend rules or protected environment
values were changed during verification.
