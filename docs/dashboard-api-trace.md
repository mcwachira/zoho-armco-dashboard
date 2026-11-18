# Dashboard API trace

Scope: post-middleware-audit repair, 2026-11-18, dashboard checkout only.
The user's completed G11SERVER audit confirms operational services and real
authenticated GETs. Its five detailed reports have not yet been transferred to
this checkout. No successful response samples from that audit were inspected.

## Transport and authentication

The browser uses `src/lib/api/client.ts`: same-origin GETs with
`Accept: application/json`, its HttpOnly dashboard session cookie through
`credentials: same-origin`, no-store caching and redirect rejection. It never
receives the service bearer. Vite development explicitly refuses live transport.
TanStack Query keys include filters and pagination; fixture mode is explicit.

Vercel fixed rewrites map `/api/dashboard/<resource>` to
`api/dashboard.ts?dashboardResource=<fixed-resource>`. The adapter removes only
that selector. `handleDashboardRequest` validates the signed session/current
allowlist, method and strict query before selecting `dashboardReadRoutes`.
Unknown/duplicate query keys fail locally. GET forwarding supplies the server's
`DASHBOARD_UPSTREAM_TOKEN`, `Accept: application/json` and a generated request ID.
It does not forward browser cookies or caller identity headers for dashboard
reads. The configured base must be an HTTPS origin in production.

Successful responses are bounded, parsed by the existing Zod validator and
projected into the allowed response shape. Secret echoes, malformed bodies,
incorrect pagination, identity mismatches and wrong overview ranges fail
validation. No replacement records are generated.

## Existing callers

All reads below use GET. The gateway column lists canonical resource paths,
not complete external URLs. The proxy explicitly prepends the established
`/api/dashboard` namespace while the transferred route matrix is pending.
For example, Overview currently targets
`https://g11server.tailaff2e5.ts.net/api/dashboard/overview` with the ISO query.
The namespace discrepancy in [route compatibility](dashboard-route-compatibility.md)
remains unresolved; no automatic alternate-path retry is used.

| Page / caller                                                     | Browser and Vercel resource                         | Prepared gateway path            | Query and transformation                                                                                                                                                    |
| ----------------------------------------------------------------- | --------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview, Monitoring / `ApiOverview`, `useDashboardOverviewQuery` | `/api/dashboard/overview`                           | `/overview`                      | Required offset-aware `createdFrom`, `createdTo`; grouped counters, no source-register total inference                                                                      |
| Invoice source register / `ApiDocuments`                          | `/api/dashboard/documents/invoices`                 | `/documents/invoices`            | `page`, `pageSize`, `search`, source `status`, `customerId`, `dateFrom`, `dateTo`, `sortBy`, `sortOrder`; allowlisted source projection and nullable joined fiscal evidence |
| Credit-note source register / `ApiDocuments`                      | `/api/dashboard/documents/credit-notes`             | `/documents/credit-notes`        | Same source parameters; original invoice references only from returned fields                                                                                               |
| Fiscalization/requests/recent invoice history                     | `/api/dashboard/invoices`                           | `/invoices`                      | Paging/search, `status`, transmission/reconciliation/writeback filters, `createdFrom`, `createdTo`; persisted requests only                                                 |
| Credit-note request history                                       | `/api/dashboard/credit-notes`                       | `/credit-notes`                  | Paging/search, `state`, `reconciliationState`, `writebackState`, date bounds; distinct from invoice enums                                                                   |
| Request alias                                                     | `/api/dashboard/requests`                           | `/invoices`                      | Existing invoice-history alias, not an invented unified requests endpoint                                                                                                   |
| Writeback / `ApiWritebackOperations`                              | `/api/dashboard/writebacks`                         | `/writebacks`                    | Paging, `documentType`, `status`, date bounds; existing strict operation schema; compatibility with actual audit payload pending                                            |
| Reconciliation operations view                                    | `/api/dashboard/reconciliation`                     | `/reconciliation`                | Paging, document type/status/date filters; blocked on exact response schema                                                                                                 |
| System events / `ApiOperationCollection`                          | `/api/dashboard/events`                             | `/events`                        | Paging, document type/date filters; blocked on exact response schema                                                                                                        |
| Pending operations / `ApiOperationCollection`                     | `/api/dashboard/operations`                         | `/operations`                    | Paging and document type; blocked on exact response schema; no queue-depth claim                                                                                            |
| Health and scoped diagnostics                                     | `/api/dashboard/services`                           | `/services`                      | No query; limited dependency/process observations, not complete system health                                                                                               |
| Passive G03 information / `ApiDevice`                             | `/api/dashboard/device`                             | `/device`                        | No query; existing strict diagnostics schema; actual response compatibility pending                                                                                         |
| Source detail navigation                                          | `/api/dashboard/documents/invoice` or `credit-note` | Exact route pending audit report | Local `id` query; prepared plural collection/ID template is blocked, not claimed verified                                                                                   |
| Request detail navigation                                         | `/api/dashboard/invoice`, `credit-note`, `request`  | Exact route pending audit report | Local `id`; existing parsers retained but forwarding blocked until exact route/sample confirmation                                                                          |

CU/KRA receipt comparison remains a separate, working source-document view.
`/reconciliation?view=operations` selects the persisted operational read.
Comparing receipt strings is not a KRA API verification or middleware decision.

## Exact error origin

`api/_lib/dashboard-contracts.ts` defines local unavailable-resource gates.
`api/_lib/dashboard-gateway.ts` emits the literal
`GATEWAY_ROUTE_UNAVAILABLE` before any fetch for those entries. The browser
preserves the safe message, code and request ID. The G11SERVER audit's finding
that gateway/middleware do not generate that literal is consistent with this
source trace. The exact deployed Vercel failure is not yet tied to a logged
request or authenticated response.

Confirmed reconciliation/events/operations paths now fail with
`CONTRACT_SCHEMA_UNAVAILABLE` when the missing response validator prevents a
read. Unconfirmed detail templates use `CONTRACT_ROUTE_UNAVAILABLE`.
Neither is evidence of an upstream failure. Forwarded errors carry
`upstreamStatus`; upstream bearer 401/403 becomes 502 without expiring the valid
local session. Auth failures in the local dashboard remain 401/403.

## G03 security boundary

Cancellation UI/modal and browser POST transport were removed. The retained
`POST /api/device/g03/cancel-receipt` function authenticates then returns
403 `G03_CANCELLATION_DISABLED` before identity, configuration or upstream work.
The existing supplemental current-receipt GET relay remains separate from the
passive `/device` projection and is not evidence of complete physical health.
Disabling this dashboard route does not disable the underlying G11SERVER POST.
