# G03 receipt monitoring and manual cancellation

## Local middleware implementation

The accessible middleware source exposes these routes:

### `GET /integrations/device/g03/current-receipt`

Requires an authenticated Better Auth dashboard session and `dashboard:read`.
The response is `200` with the following stable shape:

```json
{
  "state": "OPEN | CLOSED | UNKNOWN",
  "salesNumber": "00042",
  "vatSubtotals": { "A": "0.00", "B": "0.00", "C": "0.00", "D": "0.00", "E": "0.00" },
  "checkedAt": "2026-11-17T03:00:00.000Z",
  "device": {
    "connectivity": "connected | unavailable | unknown",
    "httpStatus": 200,
    "resultCode": 0
  },
  "error": null
}
```

When the device cannot be read or its response cannot be parsed, state is
`UNKNOWN`; receipt number and subtotals are null and `error` contains a
structured code and a non-sensitive message. `CLOSED` is returned only after a
successful `ReadCurrentReceiptInfo()` parse reports that no receipt is open.

### `POST /integrations/device/g03/cancel-receipt`

Requires an authenticated Better Auth dashboard session and
`dashboard:device:control`. The permission is assigned to the configured
`administrator` role only. The JSON request body must be empty. The handler
reads state, sends `CancelReceipt()` once only when state is confirmed `OPEN`,
then performs a separate `ReadCurrentReceiptInfo()` read. A success response
requires an acknowledged cancellation command and verified `CLOSED` state.
Other outcomes return a non-success HTTP status and include `success: false`.
An initially unknown state never triggers cancellation. There are no automatic
cancellation calls in fiscalization or `OutcomeUnknown` handling.

The response includes `status`, `requestedAt`, `initialReceipt`,
`cancellationCommand` (status and available device error codes), and
`verification`. The audit log records operator ID/role, request correlation
ID, initial/final states, command result code/status and outcome. It never
records the bearer credential or raw device response body.

The client calls the existing `ReadCurrentReceiptInfo()` read and the new
no-argument `CancelReceipt` command through its serialized command queue. A
successful HTTP response or command acknowledgement alone is not treated as
proof of closure.

## Authentication and deployment boundary

These are local source capabilities only. The configured dashboard session
must be forwarded to the middleware by a trusted server-side gateway. The
dashboard repository was not available in this workspace, and the accessible
middleware checkout has not been compared with or deployed to the remote
Windows server. Therefore, no production endpoint or dashboard control is
claimed to be available yet. Keep dashboard controls disabled until the
gateway route, session forwarding, role mapping, and deployed middleware
version are independently verified.

## Existing fiscalization monitoring

The existing authenticated dashboard data routes expose persisted invoice
statuses (`Pending`, `InProgress`, `Succeeded`, `Failed`, `OutcomeUnknown`)
and credit-note states including `IN_PROGRESS`, `MANUAL_REVIEW_REQUIRED`, and
`RECONCILIATION_REQUIRED`, along with attempts and timestamps. They provide
evidence for pending, failed, unknown, manual-review, and still-in-progress
records. A long-running request can be identified by its persisted state and
timestamps, but these records do not prove that a G03 receipt is open. No
automatic retry, cancellation, or resubmission should follow from these
statuses alone.

## Verification still required

- Add the authenticated gateway routes and dashboard UI in the separate
  dashboard repository.
- Confirm its two-user/operator authorization and session forwarding.
- Deploy this middleware change through the normal reviewed process.
- Verify the deployed version and perform any live device verification only
  under separate authorization.
