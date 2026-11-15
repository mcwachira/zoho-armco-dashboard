# Dashboard gateway review

Reviewed 2026-11-15 against the complete local `dashboard-api-contract.md`. This is a dashboard-only source review. No middleware filesystem, database, Zoho, G03 or production operation was accessed.

## Architecture and authentication

The React application calls same-origin static Vercel functions. They require the dashboard's signed Google OIDC session. GET handlers forward only to fixed paths on `DASHBOARD_UPSTREAM_BASE_URL` with the server-only `DASHBOARD_UPSTREAM_TOKEN` bearer. Browser cookies, authorization headers and arbitrary paths are not forwarded. Redirects are rejected, responses are size bounded, and upstream authentication failures remain errors with their original status in `error.upstreamStatus`.

The three POST handlers require a local admin/operator session, an exact `DASHBOARD_AUTH_URL` origin, strict queries and the documented request body. They never send the GET bearer. The authoritative contract requires a separate middleware Better Auth session with `dashboard:operate`; it specifies no session exchange, cookie-forwarding allowlist, session cookie name or cross-machine session acquisition mechanism. The local OIDC session cannot establish that permission. Consequently valid actions return HTTP 503 `OPERATOR_SESSION_UNAVAILABLE` without submitting anything. This is an integration blocker, not a successful retry implementation. No arbitrary operator header or credential was invented.

## Endpoint mapping

Paths below are relative to `/api/dashboard`. `{id}` is encoded as one validated path segment. Detail aliases use `?id=...` to retain static Vercel filenames.

| Local handler                               | Middleware path                       | Result                                                                                                   |
| ------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| GET `overview`                              | `overview`                            | Existing validated grouped counts/unavailable contract                                                   |
| GET `invoices`                              | `invoices`                            | Validated persisted invoice history                                                                      |
| GET `credit-notes`                          | `credit-notes`                        | Validated persisted credit-note history                                                                  |
| GET `invoice?id=...`                        | `invoices/{id}`                       | Validated invoice detail, resource-ID check                                                              |
| GET `credit-note?id=...`                    | `credit-notes/{id}`                   | Validated credit-note detail, resource-ID check                                                          |
| GET `requests`                              | `invoices`                            | Alias for validated invoice history                                                                      |
| GET `request?id=...`                        | `invoices/{id}`                       | Alias for validated invoice detail; uses dashboard DTO                                                   |
| GET `services`                              | `services`                            | Existing validated passive dependency/process observations                                               |
| GET `device`                                | `device`                              | Existing validated passive device availability                                                           |
| GET `capabilities`                          | `capabilities`                        | Existing validated capability availability                                                               |
| GET `writebacks`                            | `writebacks`                          | Explicitly documented fields; separate retry/provider exchange counters retained                         |
| GET `documents/invoices`                    | `documents/invoices`                  | HTTP 503: exact row DTO missing                                                                          |
| GET `documents/credit-notes`                | `documents/credit-notes`              | HTTP 503: exact row DTO missing                                                                          |
| GET `documents/invoice?id=...`              | `documents/invoices/{id}`             | HTTP 503: detail envelope/DTO missing                                                                    |
| GET `documents/credit-note?id=...`          | `documents/credit-notes/{id}`         | HTTP 503: detail envelope/DTO missing                                                                    |
| GET `manual-review`                         | `manual-review`                       | HTTP 503: record DTO missing                                                                             |
| GET `manual-review-case?id=...`             | `manual-review/{id}`                  | HTTP 503: detail DTO missing                                                                             |
| GET `reconciliation`                        | `reconciliation`                      | HTTP 503: record DTO missing                                                                             |
| GET `events`                                | `events`                              | HTTP 503: derived event DTO missing                                                                      |
| GET `operations`                            | `operations`                          | HTTP 503: operation DTO missing                                                                          |
| POST `actions/fiscalize`                    | `actions/fiscalize`                   | Validates exact documented fields; blocked by missing operator-session integration                       |
| POST `actions/invoice-writeback?id=...`     | `actions/invoices/{id}/writeback`     | Empty body; blocked by missing operator-session integration                                              |
| POST `actions/credit-note-writeback?id=...` | `actions/credit-notes/{id}/writeback` | Empty body; blocked by missing operator-session integration                                              |
| GET `health?check=live/ready`               | None                                  | HTTP 503 `CONTRACT_ROUTE_UNAVAILABLE`; dashboard contract does not authorize separate health probe paths |
| GET `telemetry`                             | None                                  | HTTP 503 `CONTRACT_ROUTE_UNAVAILABLE`; use documented `services` snapshot                                |
| GET `writeback?id=...`                      | None                                  | HTTP 503 `CONTRACT_ROUTE_UNAVAILABLE`; independent writeback GET is not documented                       |

All unavailable DTO routes return `CONTRACT_SCHEMA_UNAVAILABLE`. They do not return empty successes or accept arbitrary provider JSON. The contract describes conceptual document fields but does not state whether JSON keys are Zoho snake_case or dashboard camelCase, the detail envelope name, nullable versus omitted fields, the complete request projection, or exact operational record fields. Response schemas and sanitized fixtures are needed to finish these integrations without inventing them. The `/integrations/zoho/...` compatibility routes in the contract are middleware-owned alternatives with different existing integration access; the dashboard does not bypass its namespace to call them.

## Validation and routing

Strict route-specific schemas retain documented filtering and pagination limits. Duplicate, extra and injected `...path` queries fail before network access. Pagination accepts safe decimal integers and rejects blank/whitespace, fractional, exponent and hexadecimal forms. Response page/pageSize must match the requested values; returned rows cannot exceed pageSize or total. Detail responses must match the requested request ID. Errors, malformed JSON, schema failures and unavailable data never become successful empty results. Server credential echoes and unsafe receipt URLs fail validation.

All 19 top-level dashboard functions plus document/action functions retain static filenames. No catch-all was introduced. Filesystem routing regression tests inspect the complete top-level inventory, nested absence of bracket routes, authentication, strict queries, ISO timestamps and exact upstream forwarding.

## Session and logout review

Local authentication verifies Google signatures, issuer/audience, expiry and nonce, and uses OAuth state/PKCE and a server allowlist. Cookies are host-only, Secure, HttpOnly and SameSite=Lax. Every protected API request checks signature, expiry and current allowlist role. Same-origin POST logout clears the session and OAuth cookies with `Max-Age=0` and returns 204 with no-store. Subsequent requests without the deleted cookie are unauthorized. This meets the current-browser cookie clearing requirement.

Sessions are stateless signed cookies. A copied cookie remains valid until its expiry; immediate revocation across function instances would require shared durable session infrastructure. No process-local revocation map was added because it would incorrectly imply cross-instance revocation. The frontend separately clears its query cache/session state on logout and expiry; that behavior is covered by its own tests.

## Focused verification

- `node_modules/.bin/vitest.cmd run api/_lib --pool=threads --maxWorkers=1`: 152 passed, 8 desktop integration tests skipped; four test files passed and one skipped.
- Tests cover GET bearer forwarding, no browser-cookie leakage, protected reads, exact namespace paths and detail DTOs, wrong-resource rejection, unsafe evidence/credential rejection, unavailable contract routes, pagination consistency, writeback counter differences, POST local session/operator/origin checks, strict action payloads and absent operator-session integration.
- Operational tests use mocks/fixtures only and make no fiscalization calls.

Full-suite, TypeScript, ESLint, formatting and production-build results belong to the integrated implementation report.
