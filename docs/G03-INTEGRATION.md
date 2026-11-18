# Dashboard G03 receipt integration

This implementation uses the middleware relay contract supplied on 2026-11-18.
It supersedes the provisional receipt schemas and the missing-bridge conclusions
in earlier G03 dashboard audits. No middleware/public-gateway artifact or live
device was accessed or modified.

## Existing architecture and role evidence

The existing Google OIDC login and __Host-dashboard_session cookie remain intact.
api/_lib/auth.ts defines DashboardRole as admin/operator/viewer and
authorizeDashboardRequest verifies the HMAC, expiry and current
DASHBOARD_ALLOWED_USERS role on each request. Existing G03Device administrator
eligibility used user.role === admin. Operator/viewer were ineligible.

The explicit relay mapping is:

| Verified local role | Middleware role | G03 authority                              |
| ------------------- | --------------- | ------------------------------------------ |
| admin               | administrator   | Read and explicitly confirmed cancellation |
| operator            | operations      | Read only                                  |
| viewer              | viewer          | Read only                                  |

No unknown/default role becomes administrator. This is the requested G03
permission change; other dashboard action/fiscalization routes retain their
existing behavior. Middleware derives permissions from its exact role strings.
No permission header is sent.

Existing sessions contain email/role/expiry, not an internal user ID. The proxy
therefore reads a trusted server-side user record from DASHBOARD_USER_IDS. It
never generates an ID from email, uses an unverified browser value, or changes
the session format. Removing a user from the allowlist or changing their role
continues to invalidate their next request under the existing verifier.

## Server-only configuration

Retain existing OIDC variables:

- DASHBOARD_AUTH_URL: exact HTTPS dashboard origin, no trailing slash/path.
- DASHBOARD_SESSION_SECRET: existing signing secret, at least 32 bytes.
- GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET: existing Google OIDC credentials.
- DASHBOARD_ALLOWED_USERS: existing JSON email-to-role map.

Required for device proxying:

| Variable                    | Exact format                                                                                                                                                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DASHBOARD_UPSTREAM_BASE_URL | HTTPS gateway origin only. Intended public address: https://g11server.tailaff2e5.ts.net                                                                                                                                                                     |
| DASHBOARD_UPSTREAM_TOKEN    | Shared service bearer value, without the Bearer prefix. Must match the gateway/middleware service credential.                                                                                                                                               |
| DASHBOARD_USER_IDS          | JSON mapping approved email addresses to their actual internal user IDs, for example {"admin@example.test":"INTERNAL_ADMIN_ID","viewer@example.test":"INTERNAL_VIEWER_ID"}. These are placeholders; obtain the real IDs from trusted administrator records. |

Each ID must be unique, 1–128 ASCII letters/digits/dot/underscore/colon/hyphen,
starting with a letter or digit. Email keys are normalized; case-colliding keys,
duplicate IDs, invalid maps or missing current-user records fail closed with
503 DASHBOARD_IDENTITY_UNCONFIGURED. Populate records for all authorized readers,
not just the administrator. The map grants no role by itself; roles still come
from the verified cookie and current allowlist.

Never prefix these server variables with VITE_ or NEXT_PUBLIC_. No real secret or
production value was added. The example environment file contains no credential.
Do not reuse Google, Zoho or an end-user token as the service credential.

## Dashboard API functions

| Browser endpoint                | Fixed gateway target                     | Method |
| ------------------------------- | ---------------------------------------- | ------ |
| /api/device/g03/current-receipt | /integrations/device/g03/current-receipt | GET    |
| /api/device/g03/cancel-receipt  | /integrations/device/g03/cancel-receipt  | POST   |

Both static Vercel functions delegate to handleG03Request inside the existing
api/_lib/dashboard-gateway.ts. There is no second authentication implementation
or generic caller-selected proxy. The functions reuse the current session
verifier, URL validation, safe error convention and bounded JSON reader.

Outgoing headers are constructed server-side: Accept, Authorization: Bearer,
x-dashboard-user-id from the trusted record, x-dashboard-role from the explicit
role mapping, and a generated request ID. POST also sends Content-Type:
application/json and literal body {}. Cookies, arbitrary incoming Authorization,
identity/permission headers, Origin and connection/destination overrides are
never forwarded.

Cancellation requires local admin before any upstream request. As with the
existing logout convention, Origin must exactly equal DASHBOARD_AUTH_URL.
An explicitly supplied Sec-Fetch-Site must be same-origin. The signed cookie
retains HttpOnly/Secure/SameSite=Lax protections. Missing/foreign Origin, non-JSON
content type and non-empty/malformed bodies are rejected. No new CSRF token or
login mechanism is introduced.

Missing token/base configuration produces 503 UPSTREAM_UNCONFIGURED. Local
session failures remain 401/403. Upstream 401 becomes 502 with
error.upstreamStatus=401 so it cannot expire a valid dashboard login. Other
upstream error statuses are preserved, including structured cancellation failures.
Safe error codes/messages and correlation IDs are retained; secrets, stack traces,
cookies and internal transport errors are not exposed.

Requests use no-store, reject redirects and never retry. Device JSON is bounded
to 256 KiB. Read timeout is 8 seconds and cancellation timeout is 20 seconds;
the browser cancellation timeout is 25 seconds and Vercel device functions allow
30 seconds. A timeout is an unconfirmed outcome, not evidence the command failed.
No automatic cancellation follows a timeout or failed observation.

## Actual response/UI integration

The browser uses its own same-origin API and existing session cookie only.
It receives no bearer or user-ID configuration.

receiptStateSchema validates state, salesNumber, nullable VAT subtotals, checkedAt,
device connectivity/HTTP/result codes and the read error. HTTP 200 UNKNOWN stays
UNKNOWN. Available numeric diagnostics are preserved; absent diagnostics are not
invented. Known states must not contradict connectivity/result/error evidence.
Unlisted provider fields are stripped by the gateway projection.

The existing G03 page now displays the actual receipt state, sales number,
observation time, connectivity, HTTP status, result code and read error. Leading
zeros and decimal strings are displayed unchanged. Current read failures hide
cached known state. Foreground polling remains 15 seconds with shared query
caching, no background polling and no observation retries. The existing Overview,
Fiscalization, Monitoring and Operations receipt warnings use the same query.

The administrator cancellation button requires confirmed OPEN and no active
observation or cancellation. The existing confirmation, focus handling and
synchronous duplicate-submit guard remain. The request sends exactly one POST,
then refreshes receipt state in finally, even on errors. Operator/viewer/missing
roles do not see the control; the server independently enforces administrator
authorization. Mock and Vite development modes remain disconnected from device
transport under the project's existing API-mode conventions.

The provisional before/after/commandResponse/verified model is removed.
The UI consumes success, status, requestedAt, initialReceipt, cancellationCommand
and verification. It shows actual command status/result/error diagnostics and
independent verification separately, with a projected response-details view.

| Cancellation status          | UI interpretation                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| cancelled_and_verified       | Successful cancellation only with success=true, initial OPEN, acknowledged command/resultCode=0, no command error and independent CLOSED verification |
| no_open_receipt              | Already CLOSED; no cancellation command was needed. Not displayed as a performed cancellation                                                         |
| cancellation_rejected        | Failed; display command diagnostics                                                                                                                   |
| receipt_still_open           | Not successful; verification reports OPEN                                                                                                             |
| verification_required        | Unverified; inspect observation diagnostics                                                                                                           |
| cancellation_outcome_unknown | Unconfirmed; refresh and investigate without automatically retrying                                                                                   |

Contradictory success claims or missing closure proof fail contract validation.
Known non-success cancellation bodies are preserved even with non-2xx HTTP
responses so the UI can display actual diagnostic evidence. Generic API failures
remain visible as status/code/request-ID errors. No invented raw device response,
last-success timestamp, or top-level cancellation message is consumed.

## Files changed

| File                                                    | Change                                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `api/_lib/dashboard-gateway.ts`                         | Reuse session/config/bounded-response helpers; add fixed G03 identity relay and administrator POST boundary |
| `api/device/g03/current-receipt.ts`                     | Static dashboard-owned GET entry point                                                                      |
| `api/device/g03/cancel-receipt.ts`                      | Static dashboard-owned POST entry point                                                                     |
| `src/lib/api/client.ts`                                 | Same-origin G03 GET/POST transport; retain structured cancellation failures                                 |
| `src/features/api/device-contracts.ts`                  | Replace provisional model with supplied wire contract and closure invariants                                |
| `src/features/api/G03Device.tsx`                        | Actual diagnostics/outcomes and one post-operation refresh while the action guard remains held              |
| `api/_lib/g03-gateway.test.ts`                          | Signed-session, trusted identity, role, CSRF, configuration, contract and transport regressions             |
| `src/features/api/device-contracts.test.ts`             | Actual receipt/cancellation schema tests                                                                    |
| `src/features/api/G03Device.test.tsx`                   | Real browser-transport tests with mocked middleware outcomes                                                |
| `src/features/api/__fixtures__/g03-receipt-fixtures.ts` | Controlled actual-contract fixtures for all six cancellation statuses                                       |
| `api/_lib/browser-bundle.test.ts`                       | Verify the internal-ID record also stays out of browser assets                                              |
| `vercel.json`                                           | Local source configuration for 30-second device function duration; no production setting changed            |
| `.env.example`                                          | Placeholder-only trusted internal-ID mapping format                                                         |
| `docs/AUTHENTICATION.md`                                | Document narrow admin cancellation permission without changing login                                        |
| `README.md`                                             | Describe the G03 integration and link this report                                                           |
| `docs/G03-INTEGRATION.md`                               | Contract, relay, configuration, tests and deployment limits                                                 |

## Validation and deployment boundary

All automated device requests use mocked responses and signed fixture sessions.
No request was sent to the public gateway, middleware or physical G03. No
CancelReceipt, Zoho write, service restart, database change, push or deployment
was performed. Existing user changes and prior Overview/error-visibility work
were retained.

Validation results:

- Focused proxy/authentication/schema/UI/client suite: **177 passed**.
- Full suite: **681 passed, 8 skipped** (29 files passed, 1 skipped).
- Existing Google OIDC/session tests passed unchanged.
- The production-browser-bundle canary test passed: server credentials, the
  trusted ID record, and server API modules are absent from emitted browser assets.
- TypeScript and local production build passed. The existing large-bundle warning remains.
- Full-project ESLint, changed-file Prettier and whitespace checks passed.

The first focused run exposed duplicate post-operation reads. Polling now pauses
without toggling query enablement, and the submission guard is released only
after the single deliberate refresh completes. The regression verifies one POST
and the refreshed device state. A test-fixture literal-type error was also
corrected before the successful TypeScript build and full regression run.

A dedicated regression also verifies short legitimate internal IDs. They are
relayed from the trusted record without being mistaken for credential echoes in
receipt digits; bearer and signing-secret checks remain in place.

The skipped suite is the existing explicit opt-in desktop integration suite.

Before a separately authorized deployment:

1. Configure actual trusted DASHBOARD_USER_IDS records and existing server
   credentials in the appropriate environment. No such settings were changed here.
2. Confirm the public gateway exposes both fixed integrations/device paths,
   forwards the bearer plus trusted identity headers, and accepts the supplied
   relay-role contract. The dashboard cannot modify or establish that deployment.
3. Confirm middleware maps administrator/operations/viewer to the stated
   permissions and enforces device control only for administrator.
4. Verify dashboard-server-to-gateway HTTPS reachability. A public HTTPS URL does
   not establish G11SERVER filesystem access or access to its loopback listener.
5. Review/authorize deployment and any later live-device acceptance separately.

The local implementation and mocked tests do not claim a successful live
cancellation or production readiness. The read-only API's historical scopes do
not authorize unrelated new mutation routes.
