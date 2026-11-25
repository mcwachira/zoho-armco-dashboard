# Dashboard API trace

Scope: dashboard read route repair, 2026-11-22. The user has confirmed from the
middleware and Public Gateway source/tests that invoice request detail,
manual-review collection and manual-review case detail are implemented and
allowlisted. Those external source files are not present on this PC; this
dashboard maps only the supplied verified contracts and keeps strict response
validation.

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

| Page / caller                                                     | Browser and Vercel resource                            | Prepared gateway path            | Query and transformation                                                                                                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview, Monitoring / `ApiOverview`, `useDashboardOverviewQuery` | `/api/dashboard/overview`                              | `/overview`                      | Required offset-aware `createdFrom`, `createdTo`; grouped counters, no source-register total inference                                                                      |
| Invoice source register / `ApiDocuments`                          | `/api/dashboard/documents/invoices`                    | `/documents/invoices`            | `page`, `pageSize`, `search`, source `status`, `customerId`, `dateFrom`, `dateTo`, `sortBy`, `sortOrder`; allowlisted source projection and nullable joined fiscal evidence |
| Credit-note source register / `ApiDocuments`                      | `/api/dashboard/documents/credit-notes`                | `/documents/credit-notes`        | Same source parameters; original invoice references only from returned fields                                                                                               |
| Fiscalization/requests/recent invoice history                     | `/api/dashboard/invoices`                              | `/invoices`                      | Paging/search, `status`, transmission/reconciliation/writeback filters, `createdFrom`, `createdTo`; persisted requests only                                                 |
| Credit-note request history                                       | `/api/dashboard/credit-notes`                          | `/credit-notes`                  | Paging/search, `state`, `reconciliationState`, `writebackState`, date bounds; distinct from invoice enums                                                                   |
| Request alias                                                     | `/api/dashboard/requests`                              | `/invoices`                      | Existing invoice-history alias, not an invented unified requests endpoint                                                                                                   |
| Invoice request detail                                            | `/api/dashboard/invoice?id=<requestId>`                | `/invoices/<requestId>`          | Preserves the internal fiscalization request ID; validates strict `{ request }` DTO, reduced snapshot, nullable evidence and nonempty timeline                              |
| Manual-review collection                                          | `/api/dashboard/manual-review`                         | `/manual-review`                 | Forwards `page`, `pageSize`, optional `status`; validates `{ page, pageSize, total, items }` with strict summary rows and nullable values                                   |
| Manual-review case detail                                         | `/api/dashboard/manual-review-case?id=<caseId>`        | `/manual-review/<caseId>`        | Encodes the case ID in the path; validates the direct strict case DTO, supporting attempts, decisions and returned identity                                                 |
| Writeback / `ApiWritebackOperations`                              | `/api/dashboard/writebacks`                            | `/writebacks`                    | Paging, `documentType`, `status`, date bounds; existing strict operation schema; compatibility with actual audit payload pending                                            |
| Reconciliation operations view                                    | `/api/dashboard/reconciliation`                        | `/reconciliation`                | Paging, document type/status/date filters; blocked on exact response schema                                                                                                 |
| System events / `ApiOperationCollection`                          | `/api/dashboard/events`                                | `/events`                        | Paging, document type/date filters; blocked on exact response schema                                                                                                        |
| Pending operations / `ApiOperationCollection`                     | `/api/dashboard/operations`                            | `/operations`                    | Paging and document type; blocked on exact response schema; no queue-depth claim                                                                                            |
| Health and scoped diagnostics                                     | `/api/dashboard/services`                              | `/services`                      | No query; limited dependency/process observations, not complete system health                                                                                               |
| Passive G03 information / `ApiDevice`                             | `/api/dashboard/device`                                | `/device`                        | No query; existing strict diagnostics schema; actual response compatibility pending                                                                                         |
| Source detail navigation                                          | `/api/dashboard/documents/invoice` or `credit-note`    | Exact route pending audit report | Local `id` query; prepared plural collection/ID template remains blocked, not claimed verified                                                                              |
| Other request detail aliases                                      | `/api/dashboard/credit-note`, `/api/dashboard/request` | Exact route pending confirmation | Gates remain; this task enabled only the confirmed invoice `/invoice` route and manual-review reads                                                                         |

CU/KRA receipt comparison remains a separate, working source-document view.
`/reconciliation?view=operations` selects the persisted operational read.
Comparing receipt strings is not a KRA API verification or middleware decision.

## Exact error origin

`api/_lib/dashboard-contracts.ts` retains local unavailable-resource gates for
routes without verified contracts. The three confirmed routes above now have
strict validators and forward through the existing authenticated BFF. Other
unavailable definitions continue to return local route-unavailable errors;
these remain distinct from genuine upstream HTTP 503 responses. Forwarded
errors retain safe status information and request IDs.

Reconciliation/events/operations paths still fail with
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
