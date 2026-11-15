# Dashboard implementation report

Reviewed and implemented locally on 2026-11-15. **The full definition of done is
not met.** Existing request, writeback and health capabilities were integrated
and tested; missing JSON DTOs and middleware operator-session integration prevent
completion of the live document/operational collections and retry actions.
No placeholder-backed feature is counted as complete.

## Initial dashboard audit

The repository already contained extensive uncommitted operational work. It was
preserved and reviewed; the file inventory below includes inherited changes.
No claim is made that every uncommitted file was first created during this run.

| Area              | Initial finding                                                                                                                         | Result                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Framework/entry   | React 19, TypeScript, Vite 8; `src/main.tsx` mounts QueryClient, AuthProvider, BrowserRouter and App                                    | Retained                                                                                                         |
| Pages/navigation  | Overview, Fiscalization, Requests, Device, Writeback, Monitoring, Health, Settings, Login                                               | Preserved; added protected document and operational collection routes                                            |
| Components/design | Existing dark CSS/token system, Lucide, Framer Motion, Recharts, tables, drawers, shared status/availability components                 | Reused; navigation scrolls on short screens and tables retain horizontal scrolling                               |
| API               | Static Vercel Node functions with shared gateway and Zod schemas; newer static routes present but browser allowlist incomplete          | Fixed browser routing, static detail hooks, strict gateway consistency checks and tests                          |
| Requests          | Legacy request screen/hooks expected raw integration serializers while gateway maps dashboard serializers                               | Replaced screen with documented invoice/CN dashboard hooks and shared detail drawer; removed unused legacy hooks |
| Authentication    | Google OIDC with signed local session, server allowlist and role validation; distinct from middleware Better Auth                       | Preserved; GET/POST authorization separation verified                                                            |
| Session/logout    | Same-origin POST logout deletes protected cookies; cache/expiry/cross-tab and stale-response protection already present in working tree | Reviewed and tested; stateless copied-cookie revocation remains a limitation                                     |
| Environment       | Server `DASHBOARD_UPSTREAM_BASE_URL`, `DASHBOARD_UPSTREAM_TOKEN`, dashboard OIDC settings; explicit development mock settings           | Retained; no production values read or changed                                                                   |
| Tests             | Vitest threads/maxWorkers=1, Testing Library/jsdom, routing/auth/gateway/UI/schema tests, 8 opt-in desktop tests                        | Expanded and run locally with fixtures/mocks                                                                     |
| Vercel            | Static API routes; SPA rewrite excludes `/api`; security headers and function time limits                                               | Preserved; no dashboard catch-all added                                                                          |
| Documentation     | Historical documents described unavailable local middleware checkout and old integrations                                               | Current architecture/integration/dependency/handoff docs corrected; historical audit remains historical          |

The complete local `docs/dashboard-api-contract.md` was read before integration
changes. No middleware filesystem, SSH, database, Zoho API or device access was
used. The middleware runs on another machine. The local-only Sites skill workflow
was applied; no Site registration or publication occurred.

## Contract and endpoint mapping

The complete per-handler table is [gateway-review.md](gateway-review.md).
All names below are relative to `/api/dashboard`.

| Middleware read family                                | Local static mapping                                        | Current implementation                                               |
| ----------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| overview                                              | `overview`                                                  | Existing strict aggregate DTO, required ordered UTC range <=366 days |
| invoices / credit-notes                               | same collection names                                       | Persisted request lists; middleware-state filters and pagination     |
| invoices/{requestId} / credit-notes/{requestId}       | `invoice?id=...` / `credit-note?id=...`                     | Full existing safe request DTO, correct resource-ID check            |
| services / device / capabilities                      | same names                                                  | Existing strict DTOs; passive observations                           |
| writebacks                                            | `writebacks`                                                | Explicit documented operation fields; filtered persisted page        |
| documents/invoices / documents/credit-notes           | same collection names                                       | Strict query plumbing; exact row DTO missing, explicit 503           |
| documents/invoices/{id} / documents/credit-notes/{id} | `documents/invoice?id=...` / `documents/credit-note?id=...` | Zoho ID lookup; exact detail envelope missing, explicit 503          |
| manual-review / manual-review/{id}                    | `manual-review` / `manual-review-case?id=...`               | Query/detail plumbing; missing record DTO, explicit 503              |
| reconciliation / events / operations                  | same names                                                  | Documented filter plumbing; missing record DTOs, explicit 503        |

Compatibility `requests`/`request?id=...` handlers map to invoice dashboard
request DTOs. Legacy health/telemetry/writeback-detail handlers return explicit
`CONTRACT_ROUTE_UNAVAILABLE`; active health/telemetry uses `services`. No raw
integration access is substituted for documented dashboard access.

Existing strict DTOs for the older dashboard reads are retained, not treated as
proof of deployed compatibility. Actual upstream schema errors remain visible.

## Authentication and authorization mapping

| Operation                         | Local authorization                                                             | Upstream authorization / behavior                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Dashboard GET                     | Valid signed, unexpired dashboard session; current allowlist role               | Dedicated server-only service Bearer; browser credentials never forwarded                                                 |
| POST actions/fiscalize            | Admin/operator session, exact origin, strict four-field body and no extra query | Requires middleware Better Auth `dashboard:operate`; missing integration protocol, returns 503 without network submission |
| POST invoice-writeback?id=...     | Admin/operator session, exact origin, strict ID, empty body                     | Maps to middleware actions/invoices/{id}/writeback; same operator-session blocker                                         |
| POST credit-note-writeback?id=... | Admin/operator session, exact origin, strict ID, empty body                     | Maps to middleware actions/credit-notes/{id}/writeback; same operator-session blocker                                     |
| Logout                            | Same-origin POST                                                                | Deletes current-browser session and OAuth cookies; confirms 204; client clears cached records and broadcasts logout       |

No POST uses the service bearer. No custom dashboard cookie is presented as a
middleware Better Auth session. No new operator header, token exchange, cooldown,
attempt blocker, eligibility rule, device command or VAT calculation was invented.

## Pages and features completed or improved

- Overview retains middleware aggregate counts, separates confirmed receipts,
  ordinary failures, uncertain outcomes and independent writeback states. Metrics
  link to appropriate pages; reliable total Zoho counts remain unavailable.
  Recent request activity is explicitly a bounded first-page sample.
- Requests now supports invoice and credit-note history with URL-backed search,
  dates, paging, middleware execution/reconciliation/writeback filters, invoice
  transmission filtering and request-ID lookup. Never-submitted documents are
  not misrepresented as request records.
- Request detail reuses the existing accessible drawer, safe snapshot, receipt/QR
  evidence, device attempts, invoice eTIMS attempts, reconciliation/manual-review
  details and independent writeback fields. Credit-note timelines include attempt
  completion events. Missing writeback operations do not produce a zero retry count.
- Writeback operations uses the documented collection with filters, pagination,
  request links, status/errors, retry count, provider-exchange count and nullable
  scheduling/completion timestamps. Distinct persistence counters are retained.
- System health reads only documented `services`, displaying middleware process
  uptime, database/dependency observations and optional counters, HTTP-duration
  observations and worker history. Unknown, unverified, absent and zero values
  remain distinct. No device polling commands or invented response times.
- Protected routes/navigation now include `/invoices`, `/credit-notes`,
  `/manual-review`, `/reconciliation`, `/events` and `/operations`; command palette
  links use the same destinations. Document/operational collection screens expose
  only supported inputs and explicit errors while their DTOs are unavailable.
- Browser GET allowlist now permits all static dashboard resources. Detail hooks
  use static URLs. Requests use same-origin credentials, no-store and redirect
  rejection. Manual-review query failures no longer become invented successful
  unavailable responses.
- Gateway checks pagination input/output consistency, request IDs, bounded JSON,
  strict fields, no secret echoes, safe external URLs, error propagation and
  GET/POST authorization separation. Static Vercel routing remains intact.

## Contract limitations and incomplete features

[Exact dependency matrix](MIDDLEWARE-DEPENDENCIES.md) distinguishes endpoint
availability from missing response definitions.

1. Live Zoho invoice/CN rows, never-submitted coverage, reliable hasMore paging and
   full original document details remain incomplete: the contract names routes
   and concepts but omits exact JSON row keys, detail envelope, optionality,
   custom fields and request projection. Permissive JSON parsing would violate
   the task's strict validation/no-invention requirement.
2. Separate manual-review case/detail, reconciliation, derived-event and pending-
   operation collections remain unavailable: exact record DTOs are omitted.
   Their per-request evidence remains visible where existing DTOs provide it.
3. Fiscalization retry and Retry Zoho Writeback are not working actions. The
   contract requires a distinct upstream Better Auth operator session but does
   not define acquisition/forwarding for this local OIDC dashboard. Complete
   action result DTOs are also absent. Requests validate and fail closed.
4. No manual-review resolution mutation exists. No unified queue, generic durable
   audit log, reliable queue depth, reliable Zoho register totals or historical
   uptime is invented. Unsupported values stay unavailable.
5. Full device-command/response evidence and detailed writeback attempt history
   cannot exceed existing safe DTOs. Provider payloads and customer tax IDs are
   not exposed.

## Security/session/accessibility review

Server handlers independently enforce authentication; protected SPA views render
operational components only for an active session. OIDC state/nonce/PKCE, signature,
issuer/audience/expiry, verified email and allowlist checks remain intact. Cookies
are Secure, HttpOnly, host-only and SameSite=Lax. Every API request validates the
current allowlist and expiry. Logout clears both cookies; failed logout does not
pretend success. Expiry/401, cross-tab logout, focus/page-restore revalidation and
stale-session-response races clear or protect client data appropriately.

A previously copied stateless cookie can still replay until expiry. Durable
cross-instance revocation would require shared session infrastructure and is not
claimed implemented. The GET bearer remains server-side, with fixed HTTPS paths,
redirect rejection, bounded responses and no-store. No production credentials
were printed. Receipt links accept safe HTTP(S) URLs without embedded credentials.

Source/Testing Library checks cover labeled controls, status/error text, table
headers/captions, modal labeling/focus/Escape/Tab behavior, protected routes and
logout. CSS retains responsive layouts with scrolling navigation/tables.
Desktop/tablet visual inspection and a live screen-reader/browser audit remain
unverified. An independent final-review subagent could not finish because of a
session usage limit; the lead performed the integrated source review instead.

## Verification

Final integrated results are recorded below. All operational
actions are mocked or rejected; no production fiscalization testing occurred.
Earlier intermediate failures included stale endpoint assumptions, a stale dialog
accessible-name assertion and import-time contention. The assertion was corrected;
no production schema was loosened or test disabled to hide a failure.

| Command/check                                                                                              | Final result                                                                                               |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npm.cmd test -- --reporter=dot`                                                                           | **313 passed, 8 opt-in desktop tests skipped**; 20 files passed, one skipped; 97.52 seconds                |
| `npm.cmd run typecheck`                                                                                    | Passed                                                                                                     |
| `npm.cmd run lint`                                                                                         | Passed                                                                                                     |
| `node_modules/.bin/prettier.cmd --check api src docs .github README.md index.html "*.json" "*.ts" "*.js"`  | Passed; source/config/docs scope equivalent to project formatting check, excluding local dependency caches |
| `npm.cmd run build`                                                                                        | Passed: TypeScript and Vite production build                                                               |
| `git diff --check`                                                                                         | Passed; Windows line-ending conversion notices only                                                        |
| `node_modules/.bin/vitest.cmd run api/_lib/dashboard-routing.test.ts --configLoader native --reporter=dot` | **37 passed**; static filesystem/SPA route validation, no catch-all                                        |

Formatting initially hit sandbox EPERM while scanning an ignored local pnpm
cache; the escalated check ran and identified formatting changes. Prettier was
then applied to project source/docs. Dependencies and production configuration
were not changed. The installed Vercel CLI is unavailable; no linked environment
or production configuration was downloaded. Equivalent static routing validation
is used instead of a Vercel platform package/deployment build. A final broad
format-check retry encountered a tool-runtime interruption; the explicit project
scope above then passed without traversing ignored dependency caches.

The production bundle is 1,071.68 kB JavaScript (315.87 kB gzip) and 65.58 kB CSS
(15.07 kB gzip). The build retains the existing >500 kB chunk warning. No dependency
installation or lockfile change was required. Browser automation tools were not
available; automated DOM/interaction and routing results do not claim live visual QA.

## Files created and modified

The accompanying [file inventory](IMPLEMENTATION-FILES.md) lists tracked changes
and untracked artifacts relative to Git HEAD, including inherited work. The supplied
contract and copied middleware authentication/audit documents already existed at
initial audit and are inputs, not newly implemented middleware source. The
historical middleware audit received formatting only.

Main implementation areas are `api/_lib` (gateway/contracts/tests), static
`api/dashboard` handlers, `src/features/api` (requests/documents/operations/health,
contracts/query hooks/tests/CSS), `src/app` (protected routes/navigation/tests),
`src/components/layout/CommandPalette.tsx`, API client/session tests and docs.
`api/_lib/auth.ts`, production environment settings and middleware source were
not changed.

## Remaining issues and steps before deployment

- Expand the existing local contract with concrete safe response schemas/fixtures
  and the supported middleware operator-session integration. This does not require
  transferring the same document again or accessing server files.
- Complete and validate blocked read/action adapters against those definitions,
  including all optional fields and successful/failed/uncertain outcomes.
- Verify authenticated public-gateway reads and operator permissions in a separately
  authorized safe environment. A 202/SUBMITTED result must never imply a receipt.
- Perform desktop/tablet and keyboard/screen-reader browser review; review the
  production bundle warning and consider route splitting as a performance follow-up.
- Decide whether durable copied-cookie revocation is required before deployment.
- Validate Vercel project function/packaging limits and the final static route map.
  No deployment, commit, push or production change has been performed.
