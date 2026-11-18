# Read-only gateway integration

The browser uses same-origin Vercel API Functions. Each data GET validates the
existing dashboard Google OIDC session signature/expiry and the current
`DASHBOARD_ALLOWED_USERS` role before checking query inputs or calling upstream.
Admin, operator and viewer have read permission. Browser roles, user IDs,
authorization headers, cookies and connection headers are never forwarded.

## Supported paths

| Dashboard GET                                            | Fixed gateway GET             |
| -------------------------------------------------------- | ----------------------------- |
| `/api/dashboard/overview`                                | `/api/dashboard/overview`     |
| `/api/dashboard/invoices`                                | `/api/dashboard/invoices`     |
| `/api/dashboard/credit-notes`                            | `/api/dashboard/credit-notes` |
| `/api/dashboard/services`                                | `/api/dashboard/services`     |
| `/api/dashboard/requests` (existing compatibility alias) | `/api/dashboard/invoices`     |

These are the four existing reads. Four additional document GET mappings are
prepared locally as described below. There is no generic proxy or caller-selected
upstream path. Request detail, device, capability, writeback and operational
collections retain authenticated local unavailable responses with no upstream
access. Their existing UI, fixture mode and error presentation are retained.
Fiscalization and invoice/credit-note writeback action functions are removed.
All dashboard data functions reject non-GET methods with 405 and `Allow: GET`.
The separate existing same-origin POST logout remains an authentication endpoint.

### Document presentation; nested bindings provisional

The existing static `/api/dashboard/documents/invoices`, `credit-notes`,
`invoice?id=...` and `credit-note?id=...` handlers now forward only the four
document paths explicitly requested for integration. Detail aliases construct
encoded single-ID segments on `/api/dashboard/documents/invoices/{id}` or
`credit-notes/{id}`. Existing auth, role, query, GET bearer and error rules apply.
Authenticated gateway exposure is unverified in this checkout. Document responses
now use the user-confirmed envelopes and narrow optional provisional projections;
unknown provider fields are stripped. The register/detail presentation is covered
by synthetic mocked fixtures. Actual nested DTO compatibility is unverified. See
[document integration status](DOCUMENT-API-INTEGRATION.md) for the mappings,
known inputs, missing schema evidence and remaining work.

The separate server investigation supplied for the final review confirms these
four GET paths on `https://g11server.tailaff2e5.ts.net`: the gateway validates its
incoming service bearer, then forwards its configured bearer and the same paths
to middleware at `127.0.0.1:3001`. This is supplied verification, not a live network
test performed by this dashboard review. The local
[middleware contract](dashboard-api-contract.md) remains the query/DTO reference;
broader middleware routes do not establish additional gateway exposure.
Sanitized production response bodies/schemas were not supplied, so the existing
strict DTOs are tested with fixtures and actual production payload compatibility
remains pending. Invoice/credit-note collections are persisted fiscalization
history, never complete Zoho Books registers.

## Server configuration

The existing project conventions are retained:

- `DASHBOARD_UPSTREAM_BASE_URL=https://g11server.tailaff2e5.ts.net` — gateway HTTPS
  origin without credentials, path, query or fragment.
- `DASHBOARD_UPSTREAM_TOKEN` — same secret value as the middleware's existing
  `DASHBOARD_SERVICE_BEARER_TOKEN`. Configure manually in the dashboard Function
  environment after authorization; do not copy it into source or browser code.

`ZOHOAMARCO_GATEWAY_URL` and `DASHBOARD_SERVICE_BEARER_TOKEN` are not aliases read by
this dashboard. Never prefix server settings with `VITE_` or `NEXT_PUBLIC_`.
Missing/malformed settings return 503 `UPSTREAM_UNCONFIGURED` without fetching.
Keep the existing OIDC variables documented in [AUTHENTICATION.md](AUTHENTICATION.md).
Production browser configuration is `VITE_DATA_MODE=api`; `VITE_AUTH_MODE` is only
for explicit local demo development.

## Validation and failure handling

Overview requires ordered `createdFrom`/`createdTo` ISO timestamps with an offset,
at most 366 days apart. Invoice and credit-note history reuse the existing strict
route schemas: decimal page integers, page 1–100000, page size 1–100, bounded
search, documented status filters and optional date bounds. Services accepts no
query. Duplicate/unknown fields and destination/permission overrides fail before
fetch. Requests use the same validation as invoices.

Only Accept, the server-created Authorization bearer, and a generated request ID
are sent. Upstream redirects are rejected; fetch uses no-store and an eight-second
timeout covering response body reads. Success JSON is limited to 1 MiB and error
JSON to 16 KiB. Existing strict Zod response and pagination checks fail closed.
Upstream bodies, cookies, locations and arbitrary headers are never relayed.
Credential/configuration echoes are rejected, including valid DTO text fields,
error codes and correlation IDs. Request exceptions are not logged or returned.

All responses use no-store. Local session failures are 401/403; upstream bearer
rejection becomes 502 with its original status in `error.upstreamStatus`, preserving
the valid local session. Other upstream HTTP failures retain safe status/code
context; invalid JSON/schema is 502 and timeout is 504 `UPSTREAM_TIMEOUT`.

## Independent testing and production dependencies

Run `pnpm test` for mocked gateway/provider responses, signed fixture sessions,
and existing UI tests. An automated production Vite build in the test suite uses
dummy server canaries and checks emitted browser assets and the module graph for
credential/configuration leakage or server API imports. It does not write assets
or use real service credentials. Local `pnpm dev` with the example mock settings makes no
gateway calls. Normal tests skip eight legacy opt-in desktop tests; leave
`DASHBOARD_DESKTOP_TEST` unset. No live gateway, fiscalization or writeback request
is required for verification. The desktop tests remain separate optional GET-only
checks and were not run for this implementation.

Before a separately authorized deployment, verify Vercel-to-gateway network
reachability, all four actual sanitized responses and a real
Google sign-in/logout. A `.ts.net` hostname alone does not establish reachability
from Vercel. Local tests/build do not establish production readiness. No gateway,
middleware, database, Tailscale, production configuration or service change is part
of this work. See [the implementation report](SECURE-BFF-REPORT.md).
