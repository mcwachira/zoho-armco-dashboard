# G03 dashboard audit and independent improvements

2026-11-18. Dashboard checkout:
C:\Users\pc\Documents\GitHub\zoho-armco-dashboard, branch main.
Existing user changes were preserved. No server, middleware or public-gateway
source was modified, and no physical device or Zoho operation was performed.

## Audit before changes

| Requested capability          | Existing implementation and limitation                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Read current G03 receipt      | getCurrentReceiptState exists, but rejects before fetch. monitoringAvailable is false.                                                                                               |
| Show OPEN/CLOSED/UNKNOWN      | G03Device and receiptStateLabel implement this against a provisional local model. UNKNOWN is used when reads fail or are unavailable.                                                |
| Warn on confirmed OPEN        | Device and G03PreflightWarning already implement warnings. Preflight appeared on Fiscalization and Monitoring, not Overview or Operations.                                           |
| Cancel Open Receipt           | Existing button and confirmation dialog are visible only for local admin. The button is disabled because cancellationAvailable is false.                                             |
| Verify cancellation           | Existing provisional schema requires before-OPEN, command acknowledgement, verified=true and after-CLOSED before accepting success. This is not the authoritative middleware schema. |
| Explain errors/unavailability | Device error text, disabled reasons, cancellation result/error panel and notifications exist. Preflight hid the specific read error; CLOSED/UNKNOWN button reasons were implicit.    |

The existing cancellation handler rechecks confirmation, local administrator role,
capability, no active observation and OPEN before submission. Its synchronous
runningRef blocks duplicate submissions. Polling pauses during cancellation;
observation is refreshed in finally after success, failure or preparation errors.
There is no automatic cancellation or mutation retry.

## Confirmed routes and permission dependencies

The checked-in G03-RECEIPT-CONTROL.md establishes:

| Method and middleware path                   | Required middleware authority                                                                      | Request                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------ |
| GET /integrations/device/g03/current-receipt | Authenticated Better Auth session and dashboard:read                                               | No query/body documented |
| POST /integrations/device/g03/cancel-receipt | Authenticated Better Auth session and dashboard:device:control; configured administrator role only | Empty JSON object        |

Public gateway exposure is not confirmed. The current dashboard API gateway has
no forwarding definition for either route and accepts GET only. The existing
passive /api/dashboard/device resource does not supply a current receipt.
The two integrations/device paths above are the exact server-side dependencies;
do not substitute older proposed /api/dashboard/device/g03 paths as existing
remote routes. The eventual browser-facing route must remain same-origin and use
the dashboard's existing API architecture.

The user confirmed that read-only dashboard service authentication uses
DASHBOARD_SERVICE_BEARER_TOKEN on the server. This dashboard reads
DASHBOARD_UPSTREAM_TOKEN and sends it only from its server gateway. Neither
credential establishes an administrator identity or device-control permission.

No live receipt route was probed because a GET would initiate a device
observation. Existing capability flags and disabled transport helpers remain
unchanged. No switch, fake response, bearer POST or direct device access was added.

## Wire-contract mismatch

The documented receipt read uses state (OPEN/CLOSED/UNKNOWN), salesNumber,
vatSubtotals, checkedAt, nested device connectivity/httpStatus/resultCode and
error. UNKNOWN has null receipt number and null subtotals.

The current dormant view model instead uses status, receiptOpen,
lastSuccessfulCheckAt and an object of nullable subtotal cells. These are
provisional presentation/test fields, not proof of current middleware JSON.

The cancellation documentation names status, requestedAt, initialReceipt,
cancellationCommand and verification, but omits their complete nested schemas,
success status values, code types, nullability and failure HTTP/body mappings.
The old before/after/commandResponse/verified proposal cannot be represented as
the actual middleware response. No new response fields or adapter were invented.

## Changes completed independently

- Reused the shared receipt warning on Overview and the operational collection
  pages, including Operations. Existing Fiscalization and Monitoring warnings remain.
- OPEN stays visibly warned during a refresh. UNKNOWN has alert semantics and
  includes the actual available read error; CLOSED remains a normal status.
- Added explicit CLOSED/UNKNOWN cancellation-disabled reasons and clarified the
  administrator-authorized integration dependency.
- Kept physical receipt state distinct from request progress, unknown
  fiscalization outcomes and Zoho writeback failures.
- Added a Processing diagnostics section to existing invoice and credit-note
  request drawers, using existing DTO fields only. It groups the affected
  document, request ID, most recent attempt with recorded error, stage, recorded
  outcome, code/message, receipt evidence, contact-evidence limits and separate
  writeback status/error.
- Missing attempt/contact/outcome data is labelled as not reported or not
  established. An attempt or failure is never treated as proof the device was
  contacted, that a receipt is open, or that a KRA operation succeeded.
- Added regressions for warning states, read errors, administrator access loss,
  insufficient closure evidence and invoice/credit-note diagnostic rendering.
  Existing confirmation, duplicate-submission, cancellation failure, independent
  closure, authorization and post-operation refresh tests are retained.

No authentication, gateway, client transport, wire schema, fiscalization
eligibility, VAT mapping, price, button submission or writeback logic changed.

## Required authentication bridge — requirements, not an invented protocol

The dashboard's Google OIDC __Host-dashboard_session contains email, local role
and expiresAt, signed by its existing HMAC secret. Its /api/auth/session endpoint
returns user email/role and expiry. Middleware has a separate Better Auth login,
callback, get-session and sign-out lifecycle. The user confirmed there is no
approved session exchange or forwarding bridge.

Before enabling device routes, the separate server-side task must establish:

1. An existing-session validation or explicit exchange/delegation mechanism that
   middleware supports. The dashboard HMAC cookie is not a Better Auth cookie.
   Neither browser headers nor the read service bearer may assert administrator identity.
2. Authoritative binding from the verified dashboard identity to a middleware
   actor ID, including verified email, expiry, revocation and current account status.
3. Explicit mapping of local admin to the approved middleware administrator
   identity/role. Operator and viewer remain ineligible for cancellation.
4. Middleware enforcement of dashboard:read for observation and
   dashboard:device:control for cancellation on every request. UI eligibility
   is not permission enforcement.
5. Same-origin POST and CSRF validation at the dashboard API boundary, plus the
   middleware's actual trusted-origin/CSRF rules for the approved server-to-server
   request. Do not forward arbitrary Origin, cookies or role headers.
6. Fixed route/method forwarding, no redirects, bounded safe responses and
   server-held credentials only. Cancellation must not inherit automatic retries.
7. Actor-correlated auditing, before/after observation and command evidence,
   without logging bearer values or raw device responses.
8. Correct expiry/authorization error propagation without treating a valid
   dashboard login as an authenticated middleware session.

The smallest compatible integration preserves both existing authentication
implementations and extends the existing dashboard server gateway with only the
two fixed routes plus a middleware-supported user-session binding. The server
must authenticate and authorize that actor before the existing device workflow.
Whether this can use an existing middleware session or requires an approved
exchange cannot be decided without its actual source/auth tests. No new login
provider, token service, role system or concrete delegation protocol is proposed
as if already supported.

## Cancellation examples still required from actual source behavior

Exact JSON cannot be produced from this checkout. The following are required
source-derived fixtures, not fabricated example bodies:

| Scenario                              | Source behavior and fixture evidence required                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Confirmed success                     | Actual HTTP status and full JSON after initial OPEN, acknowledged command and independent CLOSED read |
| Initial CLOSED                        | Actual HTTP status/body; command not issued                                                           |
| Initial UNKNOWN                       | Actual HTTP status/body and read error; command not issued                                            |
| Command failure                       | Actual command error/status/code structure and any verification performed                             |
| Verification failure                  | Actual failed-read structure and HTTP/body mapping                                                    |
| Cancellation sent, closure unverified | Actual acknowledgement plus OPEN/UNKNOWN or missing-closure evidence; never report verified success   |

On G11SERVER, inspect the approved route registration/handlers, device service
return types, authentication/permission middleware, gateway allowlist and their
controlled tests. Compare approved source with the deployed runtime at
C:\ZohoAmarco\app; the public gateway is at
C:\ZohoAmarco\scripts\zohoamarco-public-gateway. These are server locations supplied
by the user, not paths accessed from the development PC. Capture sanitized
fixtures using source-level mocks, not live receipt cancellation. The existing
read-only Get-DashboardContractInventory.ps1 can assist source discovery.

After that evidence is available, implement the exact read adapter and
cancellation projection in this dashboard, extend its existing server API safely,
and test the six real fixture shapes and authoritative permission flow. Do not
enable controls solely by changing the capability flags.

## Files changed in this task

| File                                     | Purpose                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| src/app/App.tsx                          | Reuse receipt warnings on Overview and operational pages                 |
| src/app/App.test.tsx                     | Route smoke assertions for the added warnings                            |
| src/features/api/G03Device.tsx           | OPEN/UNKNOWN warning and actionable disabled/error messages              |
| src/features/api/G03Device.test.tsx      | Warning, refresh-error, authorization-loss and closure-proof regressions |
| src/features/api/ApiOperationalPages.tsx | Existing DTO-based processing diagnostics                                |
| src/features/api/ApiRequests.test.tsx    | Invoice/credit-note identity, stage, error and evidence regressions      |
| docs/G03-RECEIPT-DASHBOARD-AUDIT.md      | This audit, exact dependencies and verification limits                   |

## Validation

Baseline: 67 tests passed in the G03 controls, proposed receipt schemas and
request-detail suites. All receipt/cancellation scenarios use controlled
provisional fixtures, not actual middleware-response or physical-device evidence.

Post-change validation:

- Focused G03, receipt-schema, request-details and route tests: **99 passed**.
- Full regression suite: **618 passed, 8 skipped** (28 files passed, 1 skipped).
- Twelve additional G03/error-visibility regressions; existing route smoke tests
  also assert the Overview and Operations warning placement.
- TypeScript and local production build: passed. The existing large-bundle
  warning remains.
- Full-project ESLint: passed.
- Prettier for all seven changed files: passed.
- Git whitespace checks for changed tracked source/test files: passed.

The first focused run exposed two newly added tests asserting before asynchronous
query notifications; the corrected waits passed in the focused and full reruns.
No assertion requires a live middleware response, device command or writeback.
The skipped tests are the existing opt-in desktop integration checks.

No production deployment, push, commit, service restart, fiscalization, Zoho write
or device command occurred. Live monitoring and cancellation remain unavailable.
