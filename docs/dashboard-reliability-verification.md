# Dashboard reliability verification

Verified 2026-11-18 by the mission's Reliability and Testing Specialist, exclusively
in the dashboard checkout. The final combined checks and deployment assessment
are recorded in [the implementation report](dashboard-implementation-report.md).

## Scope and dependency validation

The current environment runs Node.js `v22.22.0`, within the package requirement
`>=22.12.0 <23`. The declared package manager is `pnpm@12.16.1`.

The pnpm lock contains two YAML documents: package-manager engine dependencies,
then application dependencies. Both must be retained. All 31 root runtime and
development dependency specifiers in `package.json` match the application importer
in the second YAML document; all 31 corresponding installed package manifests
are present. For example, the actual locked/installed test runner is Vitest
`5.1.0`, which satisfies the declared `^5.0.5` requirement. Manifest ranges should
not be mistaken for exact installed versions.

These read-only checks establish manifest/lock consistency and local package
presence, not a clean network installation. The Deployment and Configuration
Specialist owns the isolated frozen-lock validation and records its exact result
in the deployment evidence. No dependency or package-manager input was changed
by this specialist.

## Overview failure root cause and regression

The repository's Git history provides the concrete routing fix in commit
`8f23fa250247c631211b37d70acfdb2f70e6776b`: the plain Vercel Node dynamic
`api/dashboard/[...path].ts` entrypoint was replaced by static resource files.
The former dynamic route injected an extra routing parameter into the request
query. The strict validator rejected that parameter even when the date bounds
were valid, producing `400 INVALID_QUERY` before the middleware was called.
Calling middleware directly bypassed this extra parameter.

The current static entrypoints and existing tests were preserved. Four regression
cases were added to `api/_lib/dashboard-routing.test.ts`:

- The exact valid timestamp bounds plus `...path=overview` reproduce the rejected
  query and never call upstream.
- The same bounds plus `path=overview` remain invalid rather than silently ignored.
- An exact 366-day overview range is accepted through the real authenticated
  static entrypoint.
- A range exceeding 366 days by one millisecond is rejected before upstream.

Existing successful static-entrypoint tests use the same valid ISO dates with
encoded/unescaped colons and fractional seconds. Existing calendar transport
tests also preserve Nairobi offsets, final milliseconds, leap days, host timezone
independence and valid offset datetime inputs. Invalid, missing, reversed and
oversized ranges remain explicit errors. No arbitrary query parameter was
accepted to conceal the routing defect.

## Focused automated verification

The focused command is:

```powershell
pnpm.cmd test api/_lib/dashboard-routing.test.ts src/features/api/queries.test.ts src/features/api/queries.integration.test.tsx src/lib/api/client.test.ts api/_lib/auth.test.ts src/lib/auth/AuthProvider.test.tsx
```

Do not insert `--` between `test` and these paths in this environment: the observed
pnpm/Vitest invocation forwards that separator literally and runs the full suite
instead of selecting the requested files.

The six suites exercise these behavior boundaries:

| Area                         | Evidence                                                                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static route behavior        | Real exported Vercel handlers, signed test sessions, exact fixed upstream paths, unknown/duplicate/invalid query rejection, offset/fraction preservation and injected-route regression. |
| Date/query serialization     | Bounded overview dates, document-specific filter names, pagination limits, strict unknown-key rejection and Nairobi calendar boundaries.                                                |
| Query integration            | Actual TanStack Query hooks and API client with mocked fetch; no fabricated rows/zero counters on API failures; response freshness and date normalization.                              |
| Browser API safety           | Same-origin allowlist, explicit demo isolation, cancelled requests, malformed JSON/DTO rejection, safe error code/request ID and expired-session notification.                          |
| OIDC/session server boundary | Missing configuration fails closed, state/nonce/PKCE, token signature/claim verification, role allowlist, user removal, protected cookies and same-origin logout.                       |
| Session provider             | Unavailable versus signed-out distinction, rejected HTML/invalid sessions, cache clearing, expiry, cross-tab logout and late-response races.                                            |

Result: **151 tests passed across all six files**, with no skips or failures in
this focused run. Focused ESLint for the changed routing regression passed. The
changed test and this report were formatted with the repository's Prettier
executable; focused Git whitespace validation passed. The final full-suite totals
are reported alongside the combined check results in the
[implementation report](dashboard-implementation-report.md).

## Verification limits

All six focused suites use synthetic sessions and mocked Google/upstream
responses. They do not authenticate against the live gateway, issue device
commands, or prove production middleware DTO compatibility. The existing eight
optional desktop middleware tests require a separate explicit opt-in and desktop
credential; their absence is not a passed live integration test.

An additional local Edge headless check used the dependency-free
`scripts/verify-dashboard-browser.mjs` helper with explicitly labeled demo data.
Nineteen checks passed at desktop 1440px and mobile 390px: overview, request
navigation and drawer/Escape, contained table scrolling, mobile menu/focus,
unavailable source-document states, invalid date errors, no uncaught runtime
exceptions, and no API requests. Screenshots exposed a request explanation split
into flex columns and an invisible refresh label on mobile. Scoped paragraph and
heading styles correct both. The helper now checks those styles explicitly.
Browser profiles/screenshots are ignored generated artifacts, excluded from
source lint/format traversal. Browser cold-start timeouts are distinct from app
assertions and are recorded in local artifacts.

This fixture browser run does not authenticate against production or establish
live document payload compatibility. Hosted OAuth remains unverified.

No test result here certifies deployed route inventory, Vercel environment
configuration or Vercel-to-gateway reachability. Those require authenticated
deployment evidence. No commit, push or deployment was performed.
