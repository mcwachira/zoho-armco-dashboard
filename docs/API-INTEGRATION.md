# Dashboard gateway integration

The authoritative integration reference is the complete local
[dashboard-api-contract.md](dashboard-api-contract.md). Middleware source is on
another machine and was not inspected. Historical source-audit documents do not
override this contract. The production origin and environment configuration were
not changed.

Browser ? authenticated static dashboard API ? public gateway ? middleware.
`DASHBOARD_UPSTREAM_BASE_URL` and `DASHBOARD_UPSTREAM_TOKEN` remain server-only.
All integration paths are fixed; no browser-provided origin or authorization is
accepted. The complete route/authentication table is in
[gateway-review.md](gateway-review.md).

## Reads

Overview, persisted invoice/credit-note requests, their detail endpoints,
services, capabilities and device reads reuse the project's strict DTOs.
Writebacks use the explicit `{ page, pageSize, total, items }` contract including
independent retry/provider-exchange counts and nullable timestamps.

Dashboard details use `/api/dashboard/invoice?id=...` and
`/api/dashboard/credit-note?id=...`, mapped to middleware
`/api/dashboard/invoices/{requestId}` and
`/api/dashboard/credit-notes/{requestId}`. These are request IDs, distinct from
Zoho document IDs on `/api/dashboard/documents/*`.

All GET forwarding uses the dedicated service bearer. The local session cookie
and caller authorization are never forwarded upstream. Pagination, filters,
response schemas and response/request identity are checked. New read models whose
DTOs are absent from the contract fail with `CONTRACT_SCHEMA_UNAVAILABLE`; their
presence in the contract is acknowledged and their records are not fabricated.

Manual-review, reconciliation, derived events and pending-operation collections
have page cap 100. Live document page size is at most 200. Zoho totals remain
unknown (`total: null` and authoritative `hasMore`) and are not inferred from
loaded pages. Zoho filtering cannot constrain middleware-only state; persisted
request history provides supported middleware-state filters separately.

## Operations

Exactly three middleware action mappings exist:

- `actions/fiscalize` ? `POST /api/dashboard/actions/fiscalize` with only
  `org_id`, `document_type`, `document_id`, `source`.
- `actions/invoice-writeback?id=...` ?
  `POST /api/dashboard/actions/invoices/{requestId}/writeback`, empty body.
- `actions/credit-note-writeback?id=...` ?
  `POST /api/dashboard/actions/credit-notes/{requestId}/writeback`, empty body.

All require a local operator/admin session and same-origin request. The middleware
requires its own Better Auth session with `dashboard:operate`. Its session bridge,
cookie-forwarding protocol and complete action response DTOs are absent from the
contract. Handlers therefore fail closed after request validation. They do not
substitute the GET bearer, forward the custom local cookie or invoke device logic.
These actions are not claimed as complete.

## Errors and boundaries

Strict query validation rejects duplicates, unknown keys, invalid pagination,
invalid identifiers and date ranges. Upstream requests reject redirects, bound
response bodies and have an eight-second timeout; browser reads use ten seconds,
`cache: no-store` and `redirect: error`. APIs send `Cache-Control: no-store`.
Service-credential rejection retains upstream status context without expiring a
valid local dashboard session. Sensitive raw upstream errors and credentials are
not returned. Failed transport and schema checks remain errors.

No undocumented integration GET routes, direct database/provider/device access,
production actions, fallback fixture results or production configuration changes
are introduced. The legacy health/telemetry/writeback-detail handlers report
explicit contract-route errors; the active health UI reads `/services`.

See [middleware dependencies](MIDDLEWARE-DEPENDENCIES.md) for precise contract gaps,
and [implementation report](IMPLEMENTATION-REPORT.md) for verification.
