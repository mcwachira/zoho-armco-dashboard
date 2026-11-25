# Document dashboard implementation and verification

## Source compatibility follow-up (2026-11-17)

The user supplied raw Zoho/provider invoice and credit-note list/detail examples
and confirmed retaining the dashboard envelopes below. Reduced test-only samples
now establish safe numeric source IDs/postcodes, compact timestamp offsets,
credit-note `invoices[]` references, `updated_time`, source discount metadata,
and numeric invoice versus decimal-string credit-note tax amounts. Both supplied
examples use `taxes[]`; absent credit-note rates, tax percentages and totals stay
unavailable. Source tax references do not determine VAT mappings.

See the current [field audit](DASHBOARD-FEATURE-AUDIT.md) and
[implementation report](LOCAL-DASHBOARD-IMPLEMENTATION-REPORT.md) for exact
changes and validation. The response fixtures are provider examples, not live
authenticated middleware responses. Request/receipt joins remain provisional.
The candidate-field table and historical verification counts below predate this
follow-up. Customer PIN is now excluded by the projection and UI.

## Follow-up after the feature audit (2026-11-17)

The [feature audit](DASHBOARD-FEATURE-AUDIT.md) records the starting state of the
subsequent local work. Lists and details now share a CU/KRA comparison resolver:
supplied reconciliation evidence takes precedence, but its status and extracted
`invoiceNo` must agree with the shared calculation from its own CU/URL pair.
Inconsistent results are recalculated with an explanatory reason. Otherwise
persisted values from one source are compared as exact strings using the URL
`invoiceNo` query parameter. Nonblank CU strings are never trimmed. Receipt
comparison is separate from operational/eTIMS reconciliation.
The comparison filter applies only to the fetched source page and is never sent
to middleware. Source totals and `hasMore` retain their original meaning.

Invalid persisted QR URL candidates are retained as bounded text so they can be
classified as invalid instead of missing. Every verification hyperlink is checked
separately with `safeVerificationUrl`; unsafe URLs remain inert text. Unknown
provider fields are still stripped. This supersedes the earlier statement below
that invalid candidate QR values are discarded entirely. Nested middleware DTOs
and authenticated live compatibility remain unverified. See
[remote requirements](REMOTE-MIDDLEWARE-API-REQUIREMENTS.md) for device dependencies
and [local implementation report](LOCAL-DASHBOARD-IMPLEMENTATION-REPORT.md) for
the subsequent changes and actual verification results.

Updated 2026-11-17. Dashboard-only work, saved locally; no deployment.

## Result and limits

The existing /invoices and /credit-notes pages now render responsive registers
and linked detail views through the existing authenticated BFF. No second
gateway, navigation, authentication system, fiscalization operation or production
fallback data was introduced.

The user confirmed the list envelope:
`{ page, pageSize, total: number | null, hasMore, items }`.
The user confirmed the detail envelope:
`{ documentType, zohoDocumentId, document, fiscalizationRequest }`.

**Nested bindings remain provisional.** The middleware source and representative
responses are on a different machine. The user explicitly authorized isolated
provisional types and presentation while that contract is obtained separately.
This is a working presentation against synthetic UI fixtures, not a claim of
compatibility with actual nested middleware fields or live API success.
Unbound fields display an em dash or "Unavailable". An explicit null
fiscalizationRequest alone means "Not processed"; an absent summary does not.

## Four API integrations

| Existing dashboard GET                   | Existing upstream mapping                | Local mocked verification                                      | Authenticated live result                    |
| ---------------------------------------- | ---------------------------------------- | -------------------------------------------------------------- | -------------------------------------------- |
| /api/dashboard/documents/invoices        | /api/dashboard/documents/invoices        | List envelope, projection, filters, pagination and auth tested | Not tested: no upstream credentials          |
| /api/dashboard/documents/invoices/ID     | /api/dashboard/documents/invoices/ID     | Detail envelope, bounded ID, identity and auth tested          | Not tested: no upstream request in this task |
| /api/dashboard/documents/credit-notes    | /api/dashboard/documents/credit-notes    | List envelope, projection, filters, pagination and auth tested | Not tested: no upstream credentials          |
| /api/dashboard/documents/credit-notes/ID | /api/dashboard/documents/credit-notes/ID | Detail envelope, bounded ID, identity and auth tested          | Not tested: no upstream request in this task |

All mappings reuse DASHBOARD_UPSTREAM_BASE_URL, DASHBOARD_UPSTREAM_TOKEN and
the existing signed-session/current-allowlist check. Detail aliases preserve
existing Vercel routing and forward exactly one bounded ID segment through dynamic rewrites. List query
parameters remain validated and forwarded. The BFF accepts the configured public
HTTPS gateway hostname under its existing origin validation; no hostname validation
was removed or loosened. GET-only behavior, hostname/origin
validation, redirect rejection, secret checks, timeout, response-size bounds,
request IDs and safe upstream errors remain in place.

No production upstream configuration was available in this checkout. Earlier
unauthenticated probes of the four deployed dashboard aliases returned HTTP 404;
these are not authenticated document integration tests and do not prove a missing
public gateway mapping. No upstream hostname or bearer was guessed or substituted.
Public gateway exposure of all four middleware paths remains **unverified**, not
confirmed inaccessible. No missing gateway path can be precisely established
from this checkout. A separate authenticated read through the existing connection
is required; if it reports a missing path, stop that integration without bypassing.

## Presentation

- One shared register for invoices and credit notes with source number, customer,
  dates, currency, decimal-preserving amounts, separate Zoho/fiscalization status,
  CU receipt and fiscalization timestamp. Invoice due date and credit-note
  related invoice appear only from the corresponding optional binding.
- Search, Zoho status, customer, date and sorting filters use the source queries.
  No guessed status or sort enum is offered. Middleware-only filters remain in
  existing fiscalization history; no current-page filter claims to be global.
- Pagination follows hasMore, including on empty pages. A nullable total stays
  unavailable. Page-size/filter changes reset to page 1. Detail/back links
  preserve register filters and pagination.
- Detail sections show customer/address, dates, lines, quantities, rates,
  source discounts/taxes/totals, notes/reference/terms, request summary,
  execution status, device result/errors and attempt history when bound.
- Source statuses display verbatim. Badge colors identify Zoho versus middleware;
  no provisional enum is translated into success/failure. A paid Zoho invoice
  never becomes fiscalized through inference. Missing receipts remain absent.
- Monetary decimal strings are grouped without conversion to binary floats,
  rounding, currency assumptions or calculations. Date-only values remain UTC
  calendar dates; timestamp displays use Africa/Nairobi and require an offset.
- Safe http(s) QR verification links open separately without referrer/opener.
  The repository has no reusable QR renderer, so no image/QR endpoint was added.
- Loading, successful empty results, unavailable/malformed data, errors and manual
  retry are distinct. Invalid URLs/filters are rejected before a browser request.
- Existing theme, Inter/system typography, panels, buttons, badges and layout
  are reused. Tables scroll on small screens; controls have labels/focus states.

## Exact nested fields requiring middleware confirmation

Every name below is a **candidate binding**, not a verified middleware property.
The narrow schemas in document-provisional.ts strip unknown fields at the BFF.
They do not relay arbitrary provider records. Optional candidate scalar values
are used only if their runtime type is supported; otherwise they stay unavailable.
No alternative field spellings, status derivations or history-model casts are used.

| Context                  | Candidate keys                                                                                                             | Provisional supported display types; confirmation needed                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invoice row/document     | invoice_id, invoice_number                                                                                                 | string/null/absent; confirm list row nesting and ID format                                                                                                        |
| Credit-note row/document | creditnote_id, creditnote_number                                                                                           | string/null/absent; confirm spelling and list row nesting                                                                                                         |
| Common source document   | customer_id, customer_name, status, currency_code, reference_number, notes, terms                                          | string/null/absent; confirm names, nullability and status enums                                                                                                   |
| Source dates             | date, due_date                                                                                                             | string/null/absent; confirm calendar-date versus timestamp formats and applicability                                                                              |
| Source money             | total, balance, sub_total, discount_total, tax_total, adjustment                                                           | decimal string or finite number/null/absent; confirm precision, units and applicability                                                                           |
| Customer address         | billing_address: attention, address, street2, city, state, zip, country                                                    | object with optional string/null fields; confirm address/customer structure                                                                                       |
| Source lines             | line_items: name, description, quantity, rate, discount, discount_amount, tax_name, tax_percentage, tax_amount, item_total | array; text names/descriptions and decimal-string/number amounts; confirm discount units and line tax nesting                                                     |
| Source tax breakdown     | taxes: tax_name, tax_percentage, tax_amount                                                                                | array with optional text/decimal values; confirm shape and types                                                                                                  |
| Credit-note relationship | invoice_id, invoice_number                                                                                                 | optional source strings; confirm actual linkage, cardinality and whether an invoices array is used instead                                                        |
| List fiscalization join  | fiscalizationRequest                                                                                                       | optional object or explicit null; confirm row key/nesting and whether it is always supplied                                                                       |
| Fiscalization summary    | requestId, status, executionStatus, deviceResult, errorCode, errorMessage                                                  | optional string/null fields; confirm names, nesting, enum values, device result representation and safe error projection                                          |
| Receipt evidence         | cuReceiptNumber, kraQrUrl, fiscalizedAt                                                                                    | optional string/null fields; QR must be credential-free http(s), timestamp must be offset ISO; confirm actual property names and authoritative receipt provenance |
| Attempts                 | attempts: attemptNumber, status, startedAt, completedAt, deviceResult, errorCode, errorMessage                             | optional array; attempt number string/number, other fields optional strings; confirm collection location, order, identifiers and result/error structures          |

Also confirm documentType values (no enum is assumed), total semantics, supported
status/sort filters, list row wrappers, never-submitted rows, empty pages, nullable
summaries, monetary/date encodings and real ID formats. Obtain sanitized list and
detail examples for both types, with and without fiscalization and receipt evidence.

## Exact files changed in this task

Pre-existing uncommitted changes were preserved. This task additionally changed:

1. `api/_lib/dashboard-contracts.ts` — attach document envelope/projection schemas.
2. `api/_lib/dashboard-gateway.ts` — validate returned document identity; retain response guards.
3. `api/_lib/document-gateway.test.ts` — success/projection, auth/security and invalid-envelope tests.
4. `src/features/api/document-contracts.ts` — confirmed list/detail envelopes and bounded filters.
5. `src/features/api/document-provisional.ts` — new isolated optional bindings and display formatting.
6. `src/features/api/ApiDocuments.tsx` — register/filter/pagination/detail navigation.
7. `src/features/api/DocumentDetailView.tsx` — new reusable detail and source-status components.
8. `src/features/api/documents.css` — responsive tables and detail styling.
9. `src/features/api/ApiDocuments.test.tsx` — mocked presentation and navigation regression tests.
10. `src/features/api/__fixtures__/document-fixtures.ts` — new synthetic test-only fixtures.
11. `docs/DOCUMENT-API-INTEGRATION.md` — this report and field confirmation checklist.
12. `README.md` — update document feature/integration status.
13. `docs/API-INTEGRATION.md` — update current document response handling.
14. `docs/ARCHITECTURE.md` — update document response boundary.
15. `docs/gateway-review.md` — update document route/projection status.

## Verification

| Final check                                                                | Result                                                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Focused document gateway, document UI and unchanged request-history suites | 94 passed, exit 0                                                                          |
| Full `pnpm.cmd test --reporter=dot`                                        | 413 passed, 8 skipped, 0 failed; 23 files passed and 1 opt-in desktop file skipped; exit 0 |
| TypeScript check                                                           | Passed separately, exit 0; also passed as part of production build                         |
| Production `pnpm.cmd build`                                                | Passed, exit 0; 3027 modules; existing warning about chunks over 500 kB remains            |
| Full `eslint.cmd .`                                                        | Passed, exit 0                                                                             |
| Prettier check of all 15 task files                                        | Passed, exit 0                                                                             |
| `git diff --check` and diff review                                         | Passed; pre-existing unrelated working-tree edits preserved                                |

UI tests import synthetic fixtures directly; production code never imports them.
No actual middleware/API success, browser visual QA or Google sign-in is claimed.
There is no browser preview tool available in this session.

The first full run reported 402 passed, 2 failed, 8 skipped. The initial failure
was an existing request-history test timeout; the following test saw a leftover
request. The unchanged request-history suite passed in the focused rerun, and the
final full suite passed without changing its tests or timeout configuration.
The initial sandboxed build could not acquire pnpm's package-manager store lock;
the approved local build rerun passed. No deployment command was used.

No middleware, public gateway, Tailscale, server environment, Windows service,
database, device operation, VAT calculation/mapping, fiscalization/submission
logic or Zoho writeback was changed. Existing authentication code and the
configured two-user access restriction remain untouched. Actual production
allowlist values are unavailable locally and were neither read nor changed.
No deployment was performed.
