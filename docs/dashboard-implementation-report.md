# Dashboard implementation and deployment verification

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
Local type, lint, format, automated tests and production build checks pass. Full
production signoff remains pending authenticated integration and hosted deployment
verification. Final check results and release dependencies are recorded below.

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
