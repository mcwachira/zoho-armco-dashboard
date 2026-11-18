# Secure dashboard BFF implementation report

Subsequent document-task status: four additional local BFF GET mappings are
prepared, with successful data withheld pending exact response schemas and separate
gateway exposure. The historical four-path review below remains unchanged; see
[document integration status](DOCUMENT-API-INTEGRATION.md) for current scope.

## Final integration review

The final review matches the BFF against the **separate server investigation
supplied by the user**. That investigation verifies
`https://g11server.tailaff2e5.ts.net`, its four exact GET paths, incoming service
bearer validation and configured bearer forwarding to the same paths on middleware
at `127.0.0.1:3001`. No production gateway/middleware/network operation was performed
during this local review.

**Conclusion:** method, path and bearer handling match the verified contract.
Actual production response-format compatibility is still unverified because no
sanitized response bodies or exact production response schemas were supplied.
Existing strict DTOs and UI consumers pass fixture tests; schemas were not weakened
to accept unknown payloads. Vercel external reachability remains unverified.

### Findings and corrections

- All four local endpoints use identical fixed gateway paths; `requests` remains
  an existing local alias for invoices. Only those four distinct outbound paths
  exist. Unavailable routes do not fetch, action functions remain absent, and
  unsupported methods are rejected. The dispatcher previously collapsed empty
  path segments; it now rejects unsupported duplicate/trailing slash spellings
  instead of treating them as allowed resources.
- The server builds the Authorization bearer from `DASHBOARD_UPSTREAM_TOKEN`.
  `DASHBOARD_UPSTREAM_BASE_URL` is the server-controlled origin. These names are
  retained consistently; the token must have the exact middleware
  `DASHBOARD_SERVICE_BEARER_TOKEN` value. No actual secret was retrieved, displayed,
  logged, committed or used for tests.
- Google OIDC, signature/expiry validation, current allowlist/role checks and
  login/logout are unchanged. All three roles may read; none can mutate through
  this BFF. Unauthenticated requests return 401, denied roles/users return 403.
  Browser identity/permission/authorization/host headers cannot override the
  server session or credential. Browser cookies never reach the gateway.
- Source/config review found no Vite exposure of upstream variables, frontend
  server-helper imports, environment-prefix override or whole-environment build
  substitution. A new automated production Vite build uses dummy canaries and
  checks emitted HTML/CSS/JavaScript and chunk modules. It confirms no server
  canaries/settings, server API modules, gateway hostname or development mock
  identity enter the browser output. The test writes no output files and restores
  its process environment afterward.
- The fiscalization view already describes persisted requests and explicitly
  excludes documents never submitted. Requests and document-register copy now
  clearly state that these collections are fiscalization history, not complete
  Zoho Books registers, and that complete registers are unavailable through this
  gateway. The former live-register availability claim was removed. Controls,
  navigation and existing error behavior remain intact.
- Added mock transport failures for DNS (`ENOTFOUND`, `EAI_AGAIN`) and connections
  (`ECONNREFUSED`, `ECONNRESET`): safe 502, no raw diagnostics or credential logs.
  Gateway HTTP 502/504 remain safe failures with upstream status context. Existing
  header/body timeouts return 504; these are simulated, not connectivity proof.

### Final review validation

| Check                                                                | Result                                                          |
| -------------------------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm.cmd test`                                                      | **341 passed, 0 failed, 8 skipped; 22 files passed, 1 skipped** |
| TypeScript `tsc.cmd -b --pretty false`                               | Passed, exit 0                                                  |
| ESLint `eslint.cmd .`                                                | Passed, exit 0                                                  |
| Production `vite.cmd build --configLoader native` (after TypeScript) | Passed, exit 0; 3025 modules; existing large-chunk warning      |
| Automated production browser-bundle isolation                        | Passed as part of the suite, dummy secrets only                 |
| Repository formatting and `git diff --check`                         | Passed after formatting the updated test file                   |

The exact configured TypeScript, lint and Vite build commands were run via the
installed project binaries. Eight legacy opt-in desktop GET tests were intentionally
skipped; no live fiscalization, writeback, Google, gateway or middleware requests
were made.

### Files changed during this final review

This inventory distinguishes the review from the earlier implementation changes
already present in the working tree:

- `api/_lib/dashboard-gateway.ts`
- `api/_lib/dashboard-bff-security.test.ts`
- `api/_lib/browser-bundle.test.ts` (new)
- `src/features/api/ApiDocuments.tsx`
- `src/features/api/ApiDocuments.test.tsx`
- `src/features/api/ApiRequests.tsx`
- `src/features/api/ApiRequests.test.tsx`
- `.env.example`
- `README.md`
- `docs/API-INTEGRATION.md`
- `docs/ARCHITECTURE.md`
- `docs/DEPLOYMENT.md`
- `docs/VERCEL-DEPLOYMENT.md`
- `docs/gateway-review.md`
- `docs/SECURE-BFF-REPORT.md`

The existing untracked `src/features/api/system-health.css`, authentication
implementation, static endpoint files, dependencies, lockfiles and Vercel settings
were not changed by this review. No deployment, push, service restart, database,
Tailscale or production environment change was performed.

The original implementation audit below is retained for context. Its 332-test
result is the earlier implementation result, superseded by the review above.

## Original implementation audit

Local review and implementation: 2026-11-15. All edits are inside
`C:\Users\pc\Documents\GitHub\zoho-armco-dashboard`. The BFF is independently
testable with mocked sessions/provider responses/gateway responses. Production
integration remains unverified; a successful local build is not production proof.

## Architecture discovered

- React 19 / TypeScript / Vite 8 SPA with React Router. `src/main.tsx` mounts
  BrowserRouter, TanStack Query and AuthProvider; `src/app/App.tsx` owns the shell
  and protected views.
- Root `api/auth` and `api/dashboard` contain static Node Vercel Function entry
  points with shared helpers in `api/_lib`. `vercel.json` excludes `/api` from
  the SPA fallback, limits dashboard functions to 10 seconds and auth functions
  to 20 seconds, and restricts browser connections with CSP `connect-src 'self'`.
- `src/lib/api/client.ts` already sends GET requests to same-origin dashboard
  paths with same-origin credentials. `src/features/api/queries.ts` and the
  document/operation clients use that transport. No page was found making direct
  browser-to-gateway requests, so no frontend transport replacement was needed.
- Explicit local Vite demo mode uses development-only fixtures and mock identity;
  production ignores mock auth and rejects demo data mode. No fallback from live
  errors to fabricated data was added.

## Authentication and authorization

The existing authentication supports this BFF and was reused without new auth
dependencies. It is custom dashboard Google OpenID Connect, not Next.js or Better
Auth. Better Auth documentation in this repository is a separate middleware
reference, not the dashboard's login implementation.

`api/_lib/auth.ts` implements state, nonce, PKCE, token exchange, RSA/JWKS signature
verification, issuer/audience/expiry/issue-time validation, verified Google email
and a server-controlled email-to-role allowlist. Roles are `admin`, `operator` and
`viewer`; all have dashboard read access. No role gains a mutation through this BFF.

The eight-hour HMAC-signed session is in the host-only
`__Host-dashboard_session` cookie with Secure, HttpOnly, SameSite=Lax and Path=/.
Each data GET validates signature, expiry and the current allowlist role on the
server. The BFF now explicitly requests only the three known read roles. Missing,
tampered or expired cookies receive 401; removed users or changed roles receive 403. Browser authorization headers, roles and user IDs cannot establish a session.
Login, callback, session inspection and same-origin POST logout are preserved.

Known existing limitations remain: logout clears the current browser cookie but
cannot revoke a copied stateless cookie; removal from the allowlist or signing-key
rotation rejects it. Individual durable session revocation and distributed login
rate limiting are not implemented. Existing client cache clearing, expiry,
cross-tab logout and session revalidation are retained.

## BFF changes and exact routes

Only four distinct outbound GET paths are configured:

| Local GET                                                | Fixed gateway GET             |
| -------------------------------------------------------- | ----------------------------- |
| `/api/dashboard/overview`                                | `/api/dashboard/overview`     |
| `/api/dashboard/invoices`                                | `/api/dashboard/invoices`     |
| `/api/dashboard/credit-notes`                            | `/api/dashboard/credit-notes` |
| `/api/dashboard/services`                                | `/api/dashboard/services`     |
| `/api/dashboard/requests` (existing compatibility alias) | `/api/dashboard/invoices`     |

Existing entry point files are reused. The earlier dispatcher also forwarded
detail/device/capabilities/writeback paths based on a broader local middleware
contract. Those outbound mappings are removed because they are not established
public gateway routes for this task. Their authenticated local handlers remain
explicit unavailable responses; existing pages, navigation, fixtures and error UI
are retained. Live detail drawers and those other data families will therefore
report unavailable. Full live functionality cannot be established from the four
allowed collections alone. The inventory is in [gateway-review.md](gateway-review.md).

Fiscalization/invoice-writeback/credit-note-writeback function files, action
schemas and the action dispatcher are removed. Every data handler rejects
non-GET methods; same-origin auth logout remains a separate POST endpoint.
No unrestricted proxy, dynamic gateway path or operator-session bridge is added.

Strict route-specific query/response schemas are retained, including pagination,
status/search/date bounds, duplicate/unknown parameter rejection, ordered date
windows and response pagination consistency. Absolute request URLs, normalized
path tricks and destination/permission overrides fail before fetch. The server
builds only fixed gateway paths from the server environment origin. It sends only
Accept, its own bearer and a request ID; browser cookies, authorization and host
headers never reach upstream.

Redirects are rejected and both fetch and API responses use no-store. The existing
eight-second timeout now also cancels a stalled response body; timeout is 504
`UPSTREAM_TIMEOUT`. Responses are bounded to 1 MiB for success and 16 KiB for error
JSON. Malformed/oversized/schema-invalid JSON fails safely. Upstream authentication
failures become 502 while retaining `error.upstreamStatus`, avoiding false expiry
of a valid local user session. Raw diagnostics, upstream cookies and locations are
not relayed. Schema-valid echoes of known service/signing/Google secrets and the
gateway origin/hostname are blocked, including safe-looking error metadata.
Exceptions and secret values are not logged.

Vercel configuration is unchanged. Shared helpers/tests remain in the existing
underscore utility directory; see [Vercel's utility file guidance](https://vercel.com/docs/functions/configuring-functions/advanced-configuration#adding-utility-files-to-the-api-directory).
No Vercel deployment or function packaging verification was performed.

## Exact environment names

The dashboard's existing conventions are retained. No actual values were read,
committed or changed in production.

| Variable                                   | Scope and requirement                                                                                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DASHBOARD_UPSTREAM_BASE_URL`              | Server-only gateway origin; intended value `https://g11server.tailaff2e5.ts.net`. HTTPS without credentials/path/query/fragment.                      |
| `DASHBOARD_UPSTREAM_TOKEN`                 | Server-only secret; set manually to the middleware's existing `DASHBOARD_SERVICE_BEARER_TOKEN` value. It must never be a Zoho or operator credential. |
| `DASHBOARD_AUTH_URL`                       | Existing server-only exact dashboard HTTPS origin.                                                                                                    |
| `DASHBOARD_SESSION_SECRET`                 | Existing server-only random session signing secret, at least 32 bytes.                                                                                |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Existing server-only Google OAuth Web client configuration.                                                                                           |
| `DASHBOARD_ALLOWED_USERS`                  | Existing server-only nonempty JSON email-to-admin/operator/viewer map.                                                                                |
| `VITE_DATA_MODE=api`                       | Public production data-mode setting, contains no credentials.                                                                                         |

`ZOHOAMARCO_GATEWAY_URL` and `DASHBOARD_SERVICE_BEARER_TOKEN` are not dashboard
configuration aliases. Do not configure only those names and expect reads to
work. Never prefix secrets with `VITE_` or `NEXT_PUBLIC_`. Missing/malformed upstream
configuration returns 503 without fetching; missing auth configuration fails
closed. The only existing HTTP exception is explicit test configuration for
`http://127.0.0.1:3004`, rejected under production or Vercel.

## Verification

| Check                                                                                | Result                                                                                                                      |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Baseline `pnpm.cmd test`                                                             | 313 passed, 0 failed, 8 skipped; 20 files passed, 1 skipped                                                                 |
| Updated full suite                                                                   | 332 passed, 0 failed, 8 skipped; 21 files passed, 1 skipped                                                                 |
| TypeScript `.\node_modules\.bin\tsc.cmd -b --pretty false` and build TypeScript step | Passed, exit 0                                                                                                              |
| ESLint `.\node_modules\.bin\eslint.cmd .`                                            | Passed, exit 0                                                                                                              |
| Production build: configured `tsc -b` then `vite build --configLoader native`        | Passed, exit 0; 3025 modules transformed                                                                                    |
| Browser artifact canary scan                                                         | Passed; dummy server secrets/origin, sensitive variable names and actual gateway hostname absent from generated HTML/CSS/JS |
| Repository Prettier `--check .`                                                      | Passed, exit 0 after rerunning outside the sandbox                                                                          |
| `git diff --check`                                                                   | Passed                                                                                                                      |

Tests cover unauthenticated access; signed, tampered, expired and removed sessions;
server-controlled roles; all three read roles; browser header overrides; absent
and malformed credentials; exact forwarding and query validation; unavailable
routes and absent action files; upstream errors, malformed JSON, redirects,
oversized bodies and header/body timeouts; secret/configuration echoes and logs.
Existing frontend, route, query, schema, mock, session and logout tests remain.
Old tests expecting broader forwarding/action handlers were updated to assert
the deliberately reduced read-only boundary.

Eight legacy opt-in desktop GET tests were skipped. No live gateway, Google,
middleware, database, Zoho, fiscalization or writeback requests were made. Test
sessions and upstream/provider responses are fixtures/mocks. The build used
dummy server environment canaries and restored the process environment afterward.
The build reports an existing large JavaScript chunk warning (about 1.07 MB);
unrelated UI chunking was not changed. pnpm's external store lock required approved
execution outside the sandbox; installed project binaries ran the equivalent
TypeScript/lint/build commands. Prettier's initial cache traversal was denied in
the sandbox; its approved rerun passed. `.env.example` has no Prettier parser and
was excluded from explicit formatting; the repository-wide supported-file check
passed. No dependencies or lockfiles were changed.

## Files changed

| File                                             | Change                                                                                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/_lib/dashboard-gateway.ts`                  | Explicit read roles, request URL restrictions, bearer validation, bounded/cancellable responses, safe timeout/configuration handling; removed actions |
| `api/_lib/dashboard-contracts.ts`                | Four-path typed outbound allowlist; unavailable compatibility handlers; removed action definitions                                                    |
| `api/_lib/dashboard-bff-security.test.ts`        | New signed-session, caller isolation, credential/configuration, malformed response and timeout coverage                                               |
| `api/_lib/dashboard-operations-gateway.test.ts`  | Updated reduced scope, compatibility, query/response and mutation rejection tests                                                                     |
| `api/_lib/dashboard-routing.test.ts`             | Verifies removed action function files while retaining static/authenticated route tests                                                               |
| `api/dashboard/actions/fiscalize.ts`             | Removed                                                                                                                                               |
| `api/dashboard/actions/invoice-writeback.ts`     | Removed                                                                                                                                               |
| `api/dashboard/actions/credit-note-writeback.ts` | Removed                                                                                                                                               |
| `.env.example`                                   | Documents existing server variable names and middleware bearer value mapping; no secrets                                                              |
| `README.md`                                      | Current read-only scope, limitations, environment mapping and report link                                                                             |
| `docs/API-INTEGRATION.md`                        | Current API/configuration/validation/testing instructions                                                                                             |
| `docs/ARCHITECTURE.md`                           | Current four-path boundary and removed actions                                                                                                        |
| `docs/VERCEL-DEPLOYMENT.md`                      | Exact existing environment names and required independent verification                                                                                |
| `docs/gateway-review.md`                         | Current per-handler forwarding/unavailable inventory                                                                                                  |
| `docs/IMPLEMENTATION-REPORT.md`                  | Marks broader operational mapping/counts historical                                                                                                   |
| `docs/SECURITY-REVIEW.md`                        | Points to current read-only scope; marks action discussion historical                                                                                 |
| `docs/dashboard-authentication.md`               | Clarifies middleware reference versus actual dashboard OIDC                                                                                           |
| `docs/SECURE-BFF-REPORT.md`                      | This investigation, changes, validation and handoff                                                                                                   |

The original implementation left the pre-existing untracked
`src/features/api/system-health.css` unchanged. Generated `dist` output is ignored.
It changed no application UI files, dependencies, lockfiles, Vercel configuration
or auth implementation files. The final review adds only the UI wording
corrections listed above.

## Remaining server-side dependencies and production steps

1. The separately supplied server investigation now verifies the four GET paths
   and bearer flow to middleware on port 3001. Obtain sanitized production JSON
   or exact response schemas for all four routes and compare them with the
   existing strict DTOs, including nonempty invoice/credit-note pages, available
   overview aggregates, passive services data and safe error responses. This
   review had no such production response evidence. No additional public routes
   should be assumed.
2. Verify network access from the actual Vercel runtime to the existing gateway.
   A `.ts.net` name does not establish public reachability. This work does not
   alter Tailscale, services or gateway exposure.
3. When separately authorized, manually configure the two existing upstream
   variables in the appropriate dashboard Vercel environment. Keep Preview data
   access restricted. Confirm existing auth variables, approved email roles and
   the exact Google callback `https://<dashboard-origin>/api/auth/callback`.
4. In an authorized environment, verify real Google login/logout, rejected users,
   unauthenticated reads, the four actual sanitized gateway responses and the
   browser's same-origin-only API traffic. Do not run mutations.

External verification must run from the actual Vercel environment, checking DNS,
TLS and a bounded authenticated GET on each of the four routes using a credential
held only in the function. Confirm a request without a dashboard session is 401,
an allowlist denial is 403, browser requests remain same-origin and upstream
failures stay safe. The verified gateway-to-loopback path does not prove external
Vercel reachability. This is a future separately authorized verification step;
no deployment or Vercel configuration change is performed by this local review.

Gateway and middleware production components were not modified, deployed,
reconfigured or restarted. No production environment, service, Tailscale or
database change, migration, Git push or Vercel deployment was performed.
