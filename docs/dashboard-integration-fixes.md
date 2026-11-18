# Dashboard integration fixes

Post-middleware-audit repair, dashboard repository only. Previous local changes
and the user's untracked documents are preserved. No push, deployment,
production setting, fiscalization logic or G11SERVER change occurred.

## Implemented

- Prepared fixed allowlist resources for all eleven canonical gateway names while
  preserving same-origin browser URLs, Vercel rewrites and the existing upstream
  `/api/dashboard` namespace pending the transferred matrix. Existing
  strict writeback/device validators can now process configured reads; they
  were not replaced by invented DTOs. Actual compatibility remains unverified.
- Confirmed paths without a supplied row DTO are distinguished as
  `CONTRACT_SCHEMA_UNAVAILABLE`. Detail routes remain explicitly pending exact
  audit evidence. Existing error codes are not suppressed.
- Monitoring now reuses `ApiOverview` with the selected rolling/custom range.
  Scoped service diagnostics remain supplementary; Services is not relabeled a
  complete monitoring or physical-health feed.
- Preserved CU/KRA source receipt comparison and added an explicit persisted
  reconciliation operations view, which truthfully shows the missing DTO gate.
- Added Overview custom calendar dates with Nairobi start/end boundaries.
  Only offset-aware `createdFrom`/`createdTo` are sent. Invalid, incomplete,
  duplicated, reversed and over-366-day applied ranges prevent overview/history
  requests and show a useful validation message. Default rolling ranges remain.
- Removed all G03 cancellation controls and browser POST transport. The retained
  dashboard cancellation function denies even authenticated administrators with
  `G03_CANCELLATION_DISABLED` before any upstream request.
- Added a dependency-free fixed-GET gateway status diagnostic. Its explicit
  unsigned mode never sends a configured bearer; namespace comparison uses only
  the current and historical fixed path inventories. It prints no DTOs or
  secrets and explicitly reports response mappings as unverified.

## What is not established

Local validation passes: **747 application/BFF tests, 8 optional skips**, four
standalone diagnostic tests, type checking, lint, formatting and production
build. These controlled tests do not establish real gateway DTO compatibility.

No successful authenticated gateway response sample was inspected in this
repair. The user reports that such GETs succeeded on G11SERVER, but the detailed
audit reports have not reached this checkout and the local service credential
is absent. Protected Production secrets could not previously be exported from
Vercel; that protection was not bypassed.

Fresh unsigned results are 404 at the literal root names and 401 under
`/api/dashboard/...`. The proxy retains its established namespace, with no
automatic retry of literal roots. The mappings are prepared rather than
certified working. The namespace question, exact detail paths and actual DTO mappings
remain dependent on the reports. See [route compatibility](dashboard-route-compatibility.md).

## Cancellation security finding

The separate G11SERVER cancellation endpoint was reported to trust identity and
role assertions behind a shared bearer. Local UI removal alone would not address
that risk, so the dashboard proxy is also disabled and regression tested against
forged headers and valid administrator sessions. This does not secure or disable
the G11SERVER endpoint. It must remain unavailable for dashboard use until a
separate backend authorization review and tests approve it. No live cancellation
or other device command was sent during this repair.

These dashboard changes are local and have not been deployed. They therefore
do not secure an older deployed dashboard either. Production cancellation must
not be used on the assumption that this unshipped fix has reached Vercel.

## Review files

Core changes are in `api/_lib/dashboard-contracts.ts`,
`api/_lib/dashboard-gateway.ts`, `src/features/api/ApiOperationalPages.tsx`,
`ApiOperations.tsx`, `OverviewDateFilters.tsx`, `G03Device.tsx`,
`src/lib/api/client.ts`, their focused tests and the gateway diagnostic scripts.
See [API trace](dashboard-api-trace.md),
[test results](dashboard-test-results.md) and
[remaining requirements](dashboard-remaining-backend-requirements.md).
