# Dashboard BFF gateway review

The current boundary is documented in [API-INTEGRATION.md](API-INTEGRATION.md)
and the [secure BFF report](SECURE-BFF-REPORT.md). The supplied separate server
investigation verifies the four GET paths, incoming bearer requirement and bearer
forwarding to the same middleware paths at `127.0.0.1:3001`. No additional routes
are inferred. No live gateway probe was performed during this review; actual
production response DTO compatibility and Vercel connectivity remain pending.

## Forwarding inventory

All local names below are relative to `/api/dashboard`. All GETs, including
unavailable responses, require the existing signed dashboard session and current
server-side allowlist role. Query validation precedes network access.

| Local handler                                                                     | Outbound path                                                | Result                                                                                                     |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `overview`                                                                        | `/api/dashboard/overview`                                    | Existing strict date/overview DTO                                                                          |
| `invoices`                                                                        | `/api/dashboard/invoices`                                    | Existing strict history page DTO                                                                           |
| `credit-notes`                                                                    | `/api/dashboard/credit-notes`                                | Existing strict history page DTO                                                                           |
| `services`                                                                        | `/api/dashboard/services`                                    | Existing strict passive health DTO                                                                         |
| `requests`                                                                        | `/api/dashboard/invoices`                                    | Compatibility alias; same invoice query/page checks                                                        |
| `invoice`, `credit-note`, `request`                                               | None                                                         | Protected 503 `GATEWAY_ROUTE_UNAVAILABLE`                                                                  |
| `device`, `capabilities`, `writebacks`                                            | None                                                         | Protected 503 `GATEWAY_ROUTE_UNAVAILABLE`                                                                  |
| `documents/invoices`, `documents/credit-notes`                                    | Corresponding `/api/dashboard/documents/...` GET collections | Confirmed envelopes and narrow provisional nested projections; authenticated live access unverified        |
| `documents/invoice?id=...`, `documents/credit-note?id=...`                        | Fixed document collection path plus validated encoded ID     | Confirmed detail envelope, matching ID and provisional nested projection; unknown provider fields stripped |
| `manual-review`, `manual-review-case`, `reconciliation`, `events`, `operations`   | None                                                         | Protected 503 `GATEWAY_ROUTE_UNAVAILABLE`                                                                  |
| `health`, `telemetry`, `writeback`                                                | None                                                         | Existing protected 503 `CONTRACT_ROUTE_UNAVAILABLE`                                                        |
| `actions/fiscalize`, `actions/invoice-writeback`, `actions/credit-note-writeback` | None                                                         | Function files and action dispatcher removed                                                               |

The document additions are local preparation authorized by the later document
task, not a claim that the separate server work is complete. See
[document integration status](DOCUMENT-API-INTEGRATION.md).

All data functions reject non-GET methods. No action schema/dispatcher, generic
proxy, arbitrary gateway path or operator session bridge is exposed. The Vercel SPA
rewrite continues to exclude `/api`; removed action URLs have no matching function
in this source. Existing Google OIDC/session and same-origin POST logout remain.

## Security verification

Tests exercise unsigned/tampered/expired sessions, changed or removed allowlist
roles, all three read roles, browser header overrides, exact URL/query allowlisting,
missing/malformed credentials, secret echoes, oversized/malformed JSON, upstream
errors, redirects and timeouts during headers/body. Filesystem tests verify static
routes and absence of action function files. Existing UI/mock tests are retained.
Current exact results are in [SECURE-BFF-REPORT.md](SECURE-BFF-REPORT.md).

Server URL/token names remain `DASHBOARD_UPSTREAM_BASE_URL` and
`DASHBOARD_UPSTREAM_TOKEN`. The latter must hold the middleware's existing
`DASHBOARD_SERVICE_BEARER_TOKEN` value. No actual secrets or production environment
variables were inspected or changed. Normal tests use mocks and do not contact
the gateway, middleware or device.
