# Dashboard API and data integration

## Current data source status

Local development in `VITE_DATA_MODE=mock` uses local Zod-validated fixtures and shows DEMO labeling. Mock mode never calls `/api`. Production builds reject mock mode. API mode calls only the same-origin `/api/dashboard/*` Vercel Functions and never silently falls back to fixtures.

No independent dashboard testing API was found or verified in the dashboard or local middleware documentation. Consequently, the Vercel gateway is intentionally unconfigured by default and returns a safe `503 UPSTREAM_UNCONFIGURED` after server-side authentication. Do not configure the existing Zoho submission hostname or the live middleware as an upstream. See [the source-backed route comparison](API-CONTRACT-AUDIT.md).

## Browser-facing dashboard gateway

All routes are GET-only and protected by the server-side dashboard session and role allowlist:

| Route                                     | Response schema                        |
| ----------------------------------------- | -------------------------------------- |
| `/api/dashboard/capabilities`             | `dashboardCapabilitiesSchema`          |
| `/api/dashboard/invoices`                 | `dashboardInvoicePageSchema`           |
| `/api/dashboard/invoices/{requestId}`     | `dashboardInvoiceDetailSchema`         |
| `/api/dashboard/credit-notes`             | `dashboardCreditNotePageSchema`        |
| `/api/dashboard/credit-notes/{requestId}` | `dashboardCreditNoteDetailSchema`      |
| `/api/dashboard/overview`                 | `dashboardOverviewSchema`              |
| `/api/dashboard/writebacks`               | `dashboardWritebacksUnavailableSchema` |
| `/api/dashboard/manual-review`            | `dashboardManualReviewSchema`          |
| `/api/dashboard/reconciliation`           | `dashboardReconciliationSchema`        |
| `/api/dashboard/device`                   | `dashboardDeviceDiagnosticsSchema`     |
| `/api/dashboard/services`                 | `dashboardServiceHealthSchema`         |

The gateway validates filters, page bounds, date ranges and IDs, forwards only a fixed GET route allowlist, has an eight-second upstream timeout, rejects redirects, validates upstream bodies with Zod and returns normalized errors without forwarding upstream bodies. It accepts only an HTTPS origin and explicitly rejects `g11server.tailaff2e5.ts.net` and localhost. Its server-only upstream mode must be `DASHBOARD_DATA_MODE=testing-api` before any request is sent.

The configured test service must implement this dashboard DTO contract (or a separately reviewed server adapter must map its verified response schemas). Middleware source comparison shows the device and service source DTOs differ from the dashboard DTOs; no values may be fabricated to fill those gaps. Writeback and reconciliation collection routes are explicitly unavailable/partial in that source.

### Query parameters

Invoice list: `page`, `pageSize`, `search`, `createdFrom`, `createdTo`, `status`, `transmissionStatus`, `reconciliationStatus`, `writebackStatus`.

Credit-note list: `page`, `pageSize`, `search`, `createdFrom`, `createdTo`, `state`, `reconciliationState`, `writebackState`.

Manual review: `page`, `pageSize`. Overview requires `createdFrom` and `createdTo`. Dates are ISO datetimes, ordered and no more than 366 days apart. Page size is capped at 100. Search is bounded. Sort fields are not accepted because the source route does not implement sorting.

## Errors and provenance

Protected API errors use `{ "error": { "code": string, "message": string } }`. Expected statuses include 400 invalid parameters, 401 unauthenticated, 403 role not allowed, 404 absent route/record, 405 non-GET method, 502 unavailable or invalid upstream, and 503 unconfigured auth/upstream. Responses are `Cache-Control: no-store`.

Data provenance is shown distinctly:

- **DEMO:** local development fixtures only.
- **TESTING API:** only after a separately verified non-production upstream is explicitly configured.
- **UNAVAILABLE / UNKNOWN:** no reliable value is supplied. It is never replaced by a guessed value or sample record.

No dashboard API route can submit fiscalization, issue a receipt, retry/replay, mutate Zoho documents, resolve review cases, change reconciliation evidence or operate the G03 device.
