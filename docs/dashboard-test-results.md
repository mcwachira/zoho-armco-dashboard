# Dashboard integration repair test results

Scope: the post-middleware-audit local repair. These results supersede neither
the user's authenticated server audit nor its untransferred response evidence.

## Completed checks

- Overview calendar/offset validation and UI transport tests: **23 passed**.
- Operations/service-scope/reconciliation UI focused suite: **19 passed**.
- Dependency-free diagnostic tests: **4 passed** with `node --test
scripts/probe-public-gateway.test.mjs`. CI now includes this no-network test
  command, covering credential withholding, fixed paths and namespace comparison.

Final combined checks after retaining the established gateway namespace:

| Check                                               | Result                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm.cmd test`                                     | PASS: **747 tests passed, 8 skipped**, 31 passing files and one skipped file |
| `node --test scripts/probe-public-gateway.test.mjs` | PASS: **4 tests**; synthetic transport only, no network                      |
| `pnpm.cmd run typecheck`                            | PASS; final production build also compiled TypeScript                        |
| `pnpm.cmd run lint`                                 | PASS                                                                         |
| `pnpm.cmd run format:check`                         | PASS                                                                         |
| `pnpm.cmd run build`                                | PASS: TypeScript plus Vite production output                                 |
| `git diff --check`                                  | PASS                                                                         |

The eight skipped tests are the existing opt-in desktop integration tests;
they are not successful G11SERVER tests. Cancellation-specific regressions now
assert denial rather than successful forwarding, which changes the test count
from the prior mission. The build retains its existing large-chunk advisory
(main JavaScript approximately 1.12 MB, 327 KB gzip), not a build failure.

## Fresh real Public Gateway requests

`node scripts/probe-public-gateway.mjs --unauthenticated --compare-namespaces`
made GET requests to the exact configured Public Gateway origin. The approved
network retry succeeded after sandbox network access failed.

| Namespace                                         | Requests | Actual HTTP status |
| ------------------------------------------------- | -------- | ------------------ |
| Literal-root canonical names from user            | All 11   | 404                |
| Existing `/api/dashboard` prefix plus those names | All 11   | 401                |

Overview used a valid 24-hour ISO `createdFrom`/`createdTo` window; collection
reads used page 1/pageSize 1; Services and Device had no query. No bearer,
browser cookie, role or identity assertion was sent. No response body was read
or logged. The diagnostic prints only fixed paths and status metadata and marks
every response contract unvalidated.

These are unsigned reachability/authentication-boundary observations. They do
not establish route authorization, record counts, actual DTOs, pagination,
detail navigation or successful production integration. The namespace result
requires resolution against the server route matrix.

## Actual success samples verified in this checkout

**None for this repair.** The five audit reports and successful gateway payloads
have not yet been transferred. The local gateway token is absent, and Vercel
previously refused exporting protected Production secrets. No fixture or
synthetic parser test is described as a successful live response.

## Known verification limits

Local proxy tests use signed fixture sessions and controlled upstream responses
to verify paths, filters, secret boundaries and failure behavior. Prepared detail
parsers are tested through explicit test-only activation; actual production gates
are independently tested to prevent forwarding before confirmation.
The older 66-check browser fixture result belongs to the previous phase, not a
fresh browser acceptance of these integration changes. Subsequent browser startup
timeouts were infrastructure failures before assertions; they were not converted
into success. No live cancellation, writeback or fiscalization was attempted.
