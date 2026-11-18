# Current gateway integration evidence — 2026-11-17

## Status and scope

Integration remains incomplete. This report records this task's code inspection
and actual HTTPS observations, rather than treating older audits as current
middleware evidence. No middleware source was inspected on G11SERVER. HTTPS
gateway access does not establish filesystem or remote command access.

The development repository is C:\Users\pc\Documents\GitHub\zoho-armco-dashboard,
branch main. It already contained substantial tracked and untracked user changes,
including deleted action entry points. Those changes have been preserved.

## Architecture and reused implementation

The application uses React 19, Vite, React Router and TanStack Query. Vercel Node
API functions call the existing shared api/_lib/dashboard-gateway.ts handler.
api/dashboard/[...path].ts is absent; static route files delegate to that handler.
Git history and routing tests explain this intentional replacement: plain Vercel
dynamic routing injected query fields that strict route validators rejected.
Do not reintroduce a catch-all or a second gateway.

api/auth/[...auth].ts delegates to api/_lib/auth.ts. Existing Google OIDC uses state,
nonce, PKCE, signature/claim verification and the approved-email role map.
Eight-hour HMAC-signed HttpOnly/Secure host-only sessions are checked for expiry
and current allowlist membership. Existing admin/operator/viewer roles remain.
Logout uses the existing same-origin POST endpoint.

The gateway validates that session, validates an exact read path and query,
constructs a fixed upstream HTTPS URL and sends GET with Authorization: Bearer
using DASHBOARD_UPSTREAM_TOKEN. Browser cookies and authorization are not
forwarded. Redirect rejection, response-size limits, timeouts, response projection,
protected-value checks and safe error handling remain in place.

There is no DASHBOARD_DATA_MODE=testing-api gate in the current code.
VITE_DATA_MODE=api selects real same-origin requests. Explicit development mock
mode is separate, and production mock mode produces a configuration error.
Vite development deliberately disables API transport; a static Vite server alone
does not run the authenticated Vercel functions.

## Actual public HTTP observations

Read-only, unauthenticated GET probes reached
https://g11server.tailaff2e5.ts.net on 2026-11-17. No bearer token was available
in the development process or a local environment file. No successful
authenticated response was obtained. The public root returned 404.

The observed error envelope is { error: string, request_id: string }. For example,
invoices returned error "Unauthorized" with a UUID request_id; missing paths
returned "Not found". These are gateway responses, not middleware DTO evidence.
A 401 does not prove the downstream route works, and a 404 does not conclusively
distinguish an absent gateway mapping from middleware behavior.

All paths below are GET. Upstream paths are relative to /api/dashboard.
The query column describes existing dashboard expectations, NOT a verified
current middleware contract. Existing local API functions require a dashboard
session; upstream success and bearer scope still need verification.

| Page / feature              | Existing dashboard API function | Intended upstream suffix              | Public status | Existing local mapping / expected response                                                                                             |
| --------------------------- | ------------------------------- | ------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Overview                    | overview.ts                     | overview                              | 401           | Enabled; required createdFrom/createdTo; aggregate DTO with availability, metrics, sources and unavailable metrics                     |
| Invoice request history     | invoices.ts, requests.ts alias  | invoices                              | 401           | Enabled; page/pageSize/search/status/transmissionStatus/reconciliationStatus/writebackStatus/createdFrom/createdTo; numeric-total page |
| Credit-note request history | credit-notes.ts                 | credit-notes                          | 401           | Enabled; page/pageSize/search/state/reconciliationState/writebackState/createdFrom/createdTo; numeric-total page                       |
| Invoice request drawer      | invoice.ts, request.ts alias    | invoices/{requestId}                  | 404           | Local unavailable; expected request/details envelope; request ID, not Zoho ID                                                          |
| Credit-note request drawer  | credit-note.ts                  | credit-notes/{requestId}              | 404           | Local unavailable; expected request/details envelope                                                                                   |
| Invoice register            | documents/invoices.ts           | documents/invoices                    | 404           | Local mapping prepared; provisional document page projection                                                                           |
| Invoice document detail     | documents/invoice.ts?id=...     | documents/invoices/{invoiceId}        | 404           | Local mapping prepared; Zoho document ID; provisional detail projection                                                                |
| Credit-note register        | documents/credit-notes.ts       | documents/credit-notes                | 404           | Local mapping prepared; provisional document page projection                                                                           |
| Credit-note document detail | documents/credit-note.ts?id=... | documents/credit-notes/{creditNoteId} | 404           | Local mapping prepared; Zoho document ID; provisional detail projection                                                                |
| Writeback history           | writebacks.ts                   | writebacks                            | 404           | Local unavailable; page/pageSize/documentType/status/createdFrom/createdTo; persisted-operation validator exists                       |
| Manual review               | manual-review.ts                | manual-review                         | 404           | Local unavailable; page/pageSize/status/createdFrom/createdTo; current exact DTO unknown                                               |
| Manual-review detail        | manual-review-case.ts?id=...    | manual-review/{caseId}                | 404           | Local unavailable; current exact DTO unknown                                                                                           |
| Reconciliation              | reconciliation.ts               | reconciliation                        | 404           | Local unavailable; page/pageSize/documentType/status/createdFrom/createdTo; current exact DTO unknown                                  |
| Events                      | events.ts                       | events                                | 404           | Local unavailable; page/pageSize/documentType/createdFrom/createdTo; current exact DTO unknown                                         |
| Operations                  | operations.ts                   | operations                            | 404           | Local unavailable; page/pageSize/documentType; current exact DTO unknown                                                               |
| G03 diagnostics             | device.ts                       | device                                | 404           | Local unavailable; no query; existing passive diagnostics validator                                                                    |
| Health and monitoring       | services.ts                     | services                              | 401           | Enabled; no query; existing dependency-status and observability validator                                                              |
| Settings / capabilities     | capabilities.ts                 | capabilities                          | 404           | Local unavailable; no query; capability availability/source validator                                                                  |

Detail probes were repeated with a synthetic UUID for request/case IDs and a
synthetic numeric Zoho ID; both forms returned 404. No real document was selected.

Document list queries currently support page, pageSize, search, status,
customerId, dateFrom/dateTo and sortBy/sortOrder. The UI expects a hasMore live
register envelope and optional nested projections. Those optional fields are
explicitly provisional, not proof of the server's actual DTOs.

The existing /reconciliation UI is a document-based current-page receipt
comparison. Its separate operational collection component is not routed there.
The operational collection component also uses z.never() while schemas remain
unverified. Enabling gateway paths alone would not connect these features.

## Implemented in this task

- Accept the public gateway's observed top-level request_id error alias, applying
  the existing request-ID syntax and protected-data checks. Preserve safe header
  precedence and the existing browser error envelope. Upstream auth failures still
  become 502 without logging the user out.
- Add controlled tests for observed 401/404/503 errors, safe correlation IDs,
  token/hostname/header-injection rejection and header precedence.
- Supply scripts/Get-DashboardContractInventory.ps1 for transfer to G11SERVER.
- Record this current endpoint mapping and the remaining server verification work.

No success DTOs were guessed, missing reads enabled, authentication replaced,
action routes restored/removed, or middleware/gateway files modified.

## Actions

The pre-existing working tree deletes the fiscalize, invoice-writeback and
credit-note-writeback API entry points. Git HEAD previously routed these to
handleDashboardAction, which validated the local operator and Origin, then
returned OPERATOR_SESSION_UNAVAILABLE without forwarding a POST. It documented
a middleware Better Auth operator-session requirement that cannot be satisfied by
the read-only service bearer. This is historical evidence only.

There is no verified functioning action bridge in the current checkout. Preserve
the user's existing deletions until current middleware authentication and action
contracts are established. Do not send the read bearer for a mutation, implement
fiscalization in the dashboard, issue device commands, or auto-retry workflows.

## Server inspection handoff

Known server locations supplied by the user:

- Runtime: C:\ZohoAmarco\app
- Public gateway: C:\ZohoAmarco\scripts\zohoamarco-public-gateway
- Middleware loopback listener: http://127.0.0.1:3001

These locations were NOT accessed from the development PC. The inventory script
is read-only and makes no HTTP calls. It returns filenames, SHA-256 hashes,
matching contract keywords and line numbers, plus Git revision when present.
It omits source lines, environment values, credentials, runtime settings and logs.
It skips dependencies and junctions, and reports truncation.

Transfer the inventory script and its companion Test-DashboardContractInventory.ps1
to the server. The companion test uses only synthetic temporary files. Run the
inventory under the existing server script-execution policy:

    & .\Get-DashboardContractInventory.ps1

If approved source is elsewhere, pass the actual roots:

    & .\Get-DashboardContractInventory.ps1 -SourceRoot 'C:\actual-source', 'C:\ZohoAmarco\scripts\zohoamarco-public-gateway'

The script itself writes no files. It is an inventory, not automatic source
extraction, and cannot determine which copy is approved from hashes alone.

From the inventory, obtain the current route registration, handlers/DTOs, auth
middleware, configuration VARIABLE NAMES (not values), tests and the public
gateway allowlist. Compare the runtime revision/build with the approved source.
Review and redact source before transferring it. No SSH credentials are needed.

For the separate server-side task, first establish whether each public 404 path
exists in approved middleware. If it does, review a fixed GET-only gateway
mapping to the exact same path on 127.0.0.1:3001, preserving query parameters and
the established bearer validation/forwarding. This is a change request, not a
source-verified patch. Do not modify gateway scope blindly or add a generic proxy.
The existing four 401 paths also need authenticated read-only verification.

Only after source verification, update this dashboard's existing route definitions
and validators, wire the existing operation tables/detail views, reconcile the
/reconciliation UI, and test the real safe response fixtures. Action integration
needs separate verification of the existing operator flow; do not create new auth.

## Configuration and verification

Retain server-only DASHBOARD_UPSTREAM_BASE_URL with the exact public origin
https://g11server.tailaff2e5.ts.net (no API path), and DASHBOARD_UPSTREAM_TOKEN
without a Bearer prefix. The actual middleware variable name and gateway token
relationship remain unverified; do not infer them from historical docs.

Keep existing DASHBOARD_AUTH_URL, DASHBOARD_SESSION_SECRET, GOOGLE_CLIENT_ID,
GOOGLE_CLIENT_SECRET and DASHBOARD_ALLOWED_USERS. Never use VITE_ or NEXT_PUBLIC_
prefixes for server settings. No real secret was read or committed; no production
configuration was changed.

Baseline: 569 passed, 8 skipped (27 test files passed, 1 skipped). The initial
sandbox run had a logout timeout; the isolated 20 route/logout tests and full
unsandboxed baseline rerun passed. Skipped tests are legacy opt-in desktop checks.

Post-change validation:

- Full suite: **577 passed, 8 skipped** (27 files passed, 1 skipped).
- Focused gateway, auth and routing suite: **150 passed**.
- TypeScript build check: passed.
- ESLint for the changed gateway and test file: passed.
- Prettier for the changed TypeScript and report files: passed.
- Git whitespace check for the changed TypeScript files: passed.
- Synthetic inventory checks: passed for exclusions, keyword evidence, no
  source-body disclosure, read-only behavior, missing roots and bounded traversal.
  Both the inventory and its companion test ran locally, not on G11SERVER.

Files changed by this task (all in the dashboard checkout):

| File                                        | Purpose                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| api/_lib/dashboard-gateway.ts               | Accept the observed safe request_id error alias.                              |
| api/_lib/dashboard-gateway.test.ts          | Eight additional controlled error-correlation and non-disclosure regressions. |
| scripts/Get-DashboardContractInventory.ps1  | Read-only source inventory for transfer to G11SERVER.                         |
| scripts/Test-DashboardContractInventory.ps1 | Standalone synthetic tests for the inventory; no network or device access.    |
| docs/CURRENT-GATEWAY-INTEGRATION.md         | Current evidence, endpoint mapping, configuration, limits and server handoff. |

No physical fiscalization, writeback, device command, Zoho write, service restart,
deployment, commit or production environment change occurred.
