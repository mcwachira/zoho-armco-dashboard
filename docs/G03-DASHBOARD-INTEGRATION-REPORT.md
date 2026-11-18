# G03 dashboard integration report

2026-11-17. Work stayed in
`C:\Users\pc\Documents\GitHub\zoho-armco-dashboard`.
**The integration is not complete. The contract is now present and was read
completely, but its required authenticated-session bridge is not implemented or
documented for this dashboard.** Gateway integration stopped at the explicit
stop condition in the task. No middleware, production service or device was
contacted or modified.

## Coordinated review

Three independent agents reviewed the gateway/authentication boundary, monitoring
and cancellation. The lead acted as Agent 4 for combined review, validation and
this report. All read [G03-RECEIPT-CONTROL.md](G03-RECEIPT-CONTROL.md) completely
before considering API changes. Gateway and monitoring owners made no edits
because authentication blocks their integration. The cancellation owner made
only independent UI corrections in two exclusively assigned files. Existing
invoice/credit-note work and unrelated uncommitted changes were preserved.

The earlier report said the contract was missing; that is superseded. The current
limitation is the actual compatibility gap below, not the file's availability.

## Exact endpoint and authorization contract

| Requested dashboard route                       | Documented middleware route                    | Required middleware authority                                                                                                | Implementation status                                                                    |
| ----------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /api/dashboard/device/g03/current-receipt` | `GET /integrations/device/g03/current-receipt` | Better Auth dashboard session plus `dashboard:read`                                                                          | No forwarding route added; session bridge unavailable.                                   |
| `POST /api/dashboard/device/g03/cancel-receipt` | `POST /integrations/device/g03/cancel-receipt` | Better Auth dashboard session plus `dashboard:device:control`, configured `administrator` role only; empty JSON request body | No forwarding route added; session bridge and complete cancellation schemas unavailable. |

The contract's authentication/deployment section explicitly says to keep controls
disabled until gateway routing, session forwarding, role mapping and the deployed
middleware version are independently verified. No browser flag enables these
operations. Existing capability flags stay false and receipt/cancel client helpers
still reject before fetch. Current gateway non-GET rejection remains unchanged.

## Precise authentication capability missing

`api/_lib/auth.ts` implements the dashboard's existing Google OIDC login and signs
its own `__Host-dashboard_session`. Its session contains only `email`, local
`role` (`admin`, `operator`, `viewer`) and `expiresAt`. It validates its own HMAC,
expiry and current local email-to-role allowlist. It does not hold or create a
middleware Better Auth session, middleware actor ID or middleware permission grant.
`docs/SECURE-BFF-REPORT.md` also explicitly documents this distinction.

`api/_lib/dashboard-gateway.ts` forwards existing reads with only a server-held
read service bearer, Accept and a request ID. It deliberately does not forward
browser cookies, arbitrary authorization, actor or role headers. That bearer is
not evidence of a Better Auth user session and must not gain cancellation power.

The supplied contract requires a trusted gateway to forward the configured Better
Auth session, but does not define how this dashboard obtains that session, where
it is held, the supported cookie/session-forwarding or exchange protocol, identity
binding, origin/CSRF requirements, or the authoritative mapping of local `admin`
to middleware `administrator` and its permission. No such bridge exists in the
current dashboard implementation.

Forwarding the dashboard's unrelated HMAC cookie, trusting browser identity
headers, minting an undocumented actor token or promoting the read bearer would
invent an authentication protocol. None was implemented. Existing Google login,
session handling, logout, role allowlist and server-secret isolation are unchanged.
The middleware remains the required authority for `dashboard:device:control`;
that permission is **not currently forwarded by this dashboard**.

## Actual documented fields and mapping gaps

| Area                    | Contract evidence                                                                                                                    | Dashboard state / remaining mapping work                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Physical state          | `state`: OPEN, CLOSED, UNKNOWN                                                                                                       | Current proposed model uses `status` and `receiptOpen`; an actual-contract adapter is still needed.                            |
| Receipt number          | `salesNumber`, string in known-state example; null when UNKNOWN                                                                      | Preserve as string; do not substitute invoice/request IDs.                                                                     |
| VAT                     | `vatSubtotals` with A-E decimal strings; null when UNKNOWN                                                                           | Current proposed schema requires an object with nullable cells; it does not match the documented null container.               |
| Observation time        | `checkedAt`, ISO timestamp in example                                                                                                | Use actual observation age for freshness, not fetch completion time. Explicit stale-age presentation remains outstanding.      |
| Connectivity            | `device.connectivity`: connected, unavailable, unknown                                                                               | Current proposal combines connectivity/read failure in top-level status.                                                       |
| Device result           | `device.httpStatus` and `device.resultCode`, numeric in example                                                                      | Unknown/unreachable-case nullability or omission is unspecified; do not fabricate diagnostic values.                           |
| Read error              | `error: null` on successful example; structured code and non-sensitive message on UNKNOWN                                            | Exact failure payload/nullability examples still needed.                                                                       |
| Proposed-only timestamp | No `lastSuccessfulCheckAt` field is documented                                                                                       | Do not treat current proposed display binding as an actual wire field.                                                         |
| Cancellation request    | Empty JSON body; no `confirm` property specified                                                                                     | Explicit confirmation stays a UI action; no old proposed `{confirm:true}` payload should be reused.                            |
| Cancellation response   | Names `status`, `requestedAt`, `initialReceipt`, `cancellationCommand`, `verification`; non-success outcomes include `success:false` | Nested schemas, status enums, command code types, nullability, success payload and error HTTP/body mappings are not specified. |
| Closure proof           | Initial OPEN; acknowledged cancellation; separate read verifies CLOSED                                                               | Old proposed `before`/`after`/`verified`/`commandResponse` fields cannot be substituted for undocumented actual nested fields. |

No actual response fields were newly consumed in production in this follow-up.
No old proposed cancellation enum, rawResponse field or string result code was
represented as the new middleware schema. The contract establishes the required
verification sequence, but does not yet define enough JSON detail to implement
and test that sequence's response projection without guessing.

## Independent corrections completed

| Changed file                               | Change and reason                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/api/G03Device.tsx`           | Hide the cancellation control and confirmation dialog from non-admin users. Recheck explicit confirmation, current admin eligibility, capability, no active read, confirmed OPEN and existing duplicate-submit guard inside the handler. Disable confirmation when the observation becomes CLOSED/UNKNOWN. Move query cancellation inside try/finally so preparation failure releases the running guard and still refreshes state. |
| `src/features/api/G03Device.test.tsx`      | Preserve existing scenarios and strengthen unauthorized assertions from a disabled button to no control. Add missing-role, initial UNKNOWN, confirmation dismissal, state-change during confirmation and query-stop rejection/recovery coverage. Existing command-acknowledgement/verified-closure/no-retry tests retained.                                                                                                        |
| `docs/G03-DASHBOARD-INTEGRATION-REPORT.md` | Replace obsolete missing-file explanation with the actual contract, authentication gap, mapping inventory, exact scope and validation results.                                                                                                                                                                                                                                                                                     |
| `docs/dashboard-implementation-audit.md`   | Formatting only: the initial full Prettier check identified this pre-existing imported historical audit. No historical statement, middleware source or contract was changed.                                                                                                                                                                                                                                                       |

No API handler, auth utility, browser transport, wire schema, query hook, dependency,
permission grant, fiscalization rule or device configuration changed. The
cancellation handler checks are UI eligibility defenses, not middleware grants.
They affect only the physical receipt action, not invoice/credit-note eligibility.

## Monitoring, cancellation and regression behavior

Production receipt state remains UNKNOWN because the real integration is disabled.
Existing passive device/service diagnostics stay separate. The dormant monitoring
presentation has manual refresh and foreground polling only under test-enabled
proposed capabilities. It hides cached known observations after read failure;
explicit age-based stale-reading presentation still needs the actual integration.
No historical fiscalization status is used to infer OPEN or CLOSED.

Only administrators can see the dormant cancellation action. It requires an
explicit physical-receipt confirmation and a current confirmed OPEN observation,
including a recheck when confirmation is submitted. CLOSED/UNKNOWN or an observation
refresh in progress prevents submission. The existing in-flight submission guard
remains; it is not a fiscalization lock or cooldown. No cancellation retries were
added. The proposed model's acknowledged-but-unverified result remains failure,
and post-operation receipt refresh remains in finally, including preparation errors.
Actual-contract command/verification display is still pending the missing schema.

Existing invoice/credit-note execution history, manual-review/reconciliation
states, document mappings, shared CU/KRA comparison, VAT mappings, submission
eligibility and retries remain intact. No automatic receipt cancellation,
fiscalization resubmission or OutcomeUnknown recovery was added.

## Validation

All device scenarios are mocked and explicitly use the existing proposed model.
They validate local UI defenses, not compatibility with the newly supplied wire
contract. The desktop middleware suite must remain disabled; no real endpoint,
physical receipt read, cancellation, fiscalization or writeback is permitted here.

Final validation results will be recorded after source review and checks.

## Remaining dependencies and acceptance

To continue, supply the middleware-supported Better Auth session acquisition and
forwarding/exchange contract, authoritative actor/role/permission binding, and
origin/CSRF requirements. Supply complete read-UNKNOWN and cancellation success,
command-rejection, OPEN/UNKNOWN verification, timeout and authorization-error JSON
examples/schemas with HTTP status mappings. No credentials or tokens are needed.

After that contract is established, the dashboard can add the two fixed gateway
routes, exact projections/client mappings and actual-contract UI/query tests.
Authenticated local user validation and administrator eligibility must accompany
an actual middleware-valid user session; the shared read token cannot substitute.

The monitoring transport, actual wire mapping, explicit stale-reading display,
cancellation transport, middleware permission forwarding and actual response
verification acceptance criteria remain **unmet**. The existing proposed UI tests
and successful dashboard build cannot be used to mark those items complete.

**Production deployment and real-device verification remain outstanding.** No
production deployment, Windows service restart, G03 command, middleware source
change or direct browser-to-ZFPLabServer connection occurred. This report makes
no production-readiness or live-device verification claim.
