# Dashboard middleware integration

Browser → dashboard server → authenticated public gateway → middleware dashboard API.
Existing Google login, session cookies and the role allowlist protect browser reads.
No middleware credential is sent to the browser. Vite development remains fixture-only.

## Server configuration

Set `DASHBOARD_UPSTREAM_BASE_URL=https://g11server.tailaff2e5.ts.net` and
`DASHBOARD_UPSTREAM_TOKEN` to a dedicated dashboard read credential only in a separately
authorized deployment. No testing-only mode is required. Missing origin or credential
returns 503. The example file does not change production configuration.

The gateway and middleware must support the same credential and preserve their existing
organization boundary. Only these dashboard GET resources are forwarded:

| Route                         | Parameters                                    | Schema in `src/features/api/schemas.ts` |
| ----------------------------- | --------------------------------------------- | --------------------------------------- |
| `/api/dashboard/overview`     | Required `createdFrom`, `createdTo`           | `dashboardOverviewSchema`               |
| `/api/dashboard/invoices`     | Paging, search, dates and invoice filters     | `dashboardInvoicePageSchema`            |
| `/api/dashboard/credit-notes` | Paging, search, dates and credit-note filters | `dashboardCreditNotePageSchema`         |
| `/api/dashboard/services`     | None                                          | `dashboardServiceHealthSchema`          |

The server forwards JSON Accept, Bearer authorization and `X-Request-ID`, never browser
cookies or user-supplied target hosts. Queries are validated, redirects rejected,
responses bounded to 1 MiB, and JSON schema-validated. The upstream timeout is 8 seconds;
the browser timeout is 10 seconds. Pagination uses integers (page 1–100000, size 1–100).
Dates are ordered ISO datetimes with timezone, at most 366 days apart.

## Unsupported resources

The manual-review UI reports unavailable without requesting the nonexistent collection.
Its local demo fixtures remain available. Capabilities, device, writeback/reconciliation
collections and document detail endpoints are outside this four-resource integration;
the client rejects them without fetch. No replacement dashboard subsystems are added.

Schemas are unchanged until actual desktop responses demonstrate a mismatch. In particular,
verify the services/gateway fields against current middleware output. The historical
`API-CONTRACT-AUDIT.md` does not establish current production compatibility.

## Errors

Responses contain `{error:{code,message,requestId,upstreamStatus?}}` and `X-Request-ID`.
Validated upstream request/correlation IDs and error codes are retained. Known disabled-auth
errors have actionable messages. Raw upstream bodies and private diagnostic messages are
not exposed. The client displays safe messages, codes and request IDs.

Upstream 400/404/429/503 retain their status. Upstream 401/403 become 502 so service-credential
rejection does not expire the user's dashboard session. Unsupported methods return 405
before any upstream fetch. Dashboard-session authentication behavior is unchanged.

## Desktop integration tests

`api/_lib/dashboard-desktop.integration.test.ts` always targets `http://127.0.0.1:3004`.
This exact HTTP origin is accepted only outside production and Vercel. Normal tests do
not contact it. Supply `DASHBOARD_DESKTOP_TEST=1` and a dedicated desktop-only
`DASHBOARD_DESKTOP_TEST_TOKEN` through the test process environment, then run:

```powershell
npm.cmd test -- api/_lib/dashboard-desktop.integration.test.ts
```

Prerequisite: the matching desktop middleware is already running with isolated data,
read authentication configured and execution/device workers disabled. Tests exercise the
four resources, two pages, date filters, schema validation and missing/invalid credentials.
No environment file is loaded or changed by these tests. Empty datasets cannot establish
filter selectivity; known records inside/outside the window are required for that check.

Normal regression tests cover dashboard sessions, service-header forwarding, rejected
writes/unsupported resources and error correlation using fixture responses. They do not
prove live middleware behavior. Device/fiscalization side-effect assertions also require
spies on those services in the matching middleware tests; successful GETs alone are not proof.

Production deployment requires separate authorization. Gateway/middleware implementation
requires their matching source. The Zoho submission POST and G03/fiscalization logic are
outside these dashboard changes.
