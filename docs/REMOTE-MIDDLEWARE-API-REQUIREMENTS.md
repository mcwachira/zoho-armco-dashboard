# Pending remote middleware capabilities

2026-11-17. Derived from the completed [initial audit](DASHBOARD-FEATURE-AUDIT.md).
These are proposed contracts, not existing endpoints. No remote implementation,
gateway forwarding, server/device configuration change or deployment was made.
The source needed to implement them is on the separate server and is unavailable
in this checkout.

## Evidence and scope

`api/_lib/dashboard-contracts.ts` disables the existing passive `/device` read.
`docs/dashboard-api-contract.md` describes passive device dependencies and expressly
says `/services` does not issue device commands. Neither supplies a current
receipt. The gateway is GET-only; no receipt cancellation handler exists.
The browser's former proposed cancellation URL was not evidence of an API.

Only the following two capabilities are established integration gaps. Do not
create duplicate document detail or reconciliation endpoints: the four document
GET mappings already exist locally. Their live exposure and nested DTOs need
verification, not an assertion that the remote implementation is missing.

## 1. Read current G03 receipt

Proposed method/path: `GET /api/dashboard/device/g03/current-receipt`.
No query or request body. Return JSON, `Cache-Control: no-store`, and a safe
request/correlation ID. Do not reuse the passive `/api/dashboard/device` DTO.

Authentication: existing dashboard session with `dashboard:read`, or the existing
dedicated server-held dashboard service bearer if this new GET is explicitly
authorized by the remote gateway. Browser code must use its same-origin signed
session; it never receives or supplies the bearer or the remote host.
Authorization and exposure must be verified before adding a local gateway path.

To reuse `receiptStateSchema` in `src/features/api/device-contracts.ts`, the
proposed response is a direct projection rather than the task's nested `device`
example. This is a proposal aligned to existing local UI bindings, not a claim
that the middleware uses these names today:

```json
{
  "status": "connected",
  "receiptOpen": true,
  "salesNumber": "000",
  "vatSubtotals": { "A": "0.00", "B": "0.00", "C": "0.00", "D": "0.00", "E": "0.00" },
  "checkedAt": "2026-11-17T19:00:00.000Z",
  "lastSuccessfulCheckAt": "2026-11-17T19:00:00.000Z",
  "error": null
}
```

| Field                   | Contract                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `status`                | `connected`, `unavailable`, `timeout`, or `error`                                             |
| `receiptOpen`           | Boolean only for a successfully parsed current receipt; otherwise null                        |
| `salesNumber`           | String or null; preserve leading zeros                                                        |
| `vatSubtotals`          | A–E string decimal values, or null for unavailable values; no invented zeros                  |
| `checkedAt`             | Offset ISO timestamp of this check                                                            |
| `lastSuccessfulCheckAt` | Offset ISO timestamp of last verified receipt read, or null; never advanced on failure        |
| `error`                 | Null, or bounded `{code,message}` without internal configuration, credentials or stack traces |

Only middleware executes `ReadCurrentReceiptInfo()` using its existing remote
ZFPLabServer integration. The representative server-loopback command
`GET http://127.0.0.1:4444/ReadCurrentReceiptInfo()` is documentation for that
implementation, never a browser/dashboard target. Middleware parses XML and
verifies response code and `OptionIsReceiptOpened` (0/1). Unreachable, malformed,
missing or ambiguous observations produce UNKNOWN (`receiptOpen:null`), never
CLOSED. Do not infer physical connectivity from an HTTP connection alone.
Preserve the existing device concurrency coordination; dashboard requests must
not overlap device operations outside that coordination. Consider a safely
serialized observation/cache for multiple viewers, with truthful observation age.

Known OPEN/CLOSED observations map to `connected`; failures return a truthful
unknown observation where possible. Authentication/input failures use the normal
error envelope below. A failing request must not masquerade as a fresh successful
observation. No automatic cancellation, fiscalization or writeback is permitted.

## 2. Cancel open receipt manually and verify

Proposed method/path: `POST /api/dashboard/device/g03/cancel-receipt`.

```json
{ "confirm": true }
```

Require explicit confirmation; reject false, absent, unexpected or oversized
inputs. This is a physical-device operation. Authentication must identify the
current operator. Authorize only an active admin/operator with the appropriate
remote operate permission; viewers receive 403. Revalidate current access on the
server. The GET service bearer must not gain mutation privileges. Establish an
approved operator-session or signed actor-delegation contract before any local
mutation forwarding is implemented. Never trust a browser-supplied role or actor.
Use existing origin/CSRF protections for session-authenticated mutation requests.

Required remote sequence, within existing device coordination:

1. Read/parse current receipt and record actual observation.
2. Continue only if the receipt is confirmed open. UNKNOWN is not permission.
3. Execute `CancelReceipt()` once via the middleware/ZFPLabServer integration.
4. Read/parse current receipt again, including after an unsuccessful/unverified
   command where the device can safely be observed.
5. Declare success only if command code is `0` and a fresh read verifies closed.

The remote loopback command is `GET http://127.0.0.1:4444/CancelReceipt()`.
It must never be called by the browser or the local dashboard server directly.
Do not retry this mutation automatically after timeout, ambiguous outcome or
transport failure. The operator must inspect current evidence first. No
automatic pre-fiscalization cancellation is allowed.

Response proposal aligned to existing `cancelReceiptSchema`:

```json
{
  "success": true,
  "status": "CANCELLED",
  "message": "Receipt cancellation verified closed.",
  "commandResponse": {
    "code": "0",
    "message": "OK",
    "rawResponse": "<bounded sanitized command response>"
  },
  "before": {
    "status": "connected",
    "receiptOpen": true,
    "salesNumber": "000",
    "vatSubtotals": { "A": "0.00", "B": "0.00", "C": "0.00", "D": "0.00", "E": "0.00" },
    "checkedAt": "2026-11-17T19:00:00.000Z",
    "lastSuccessfulCheckAt": "2026-11-17T19:00:00.000Z",
    "error": null
  },
  "after": {
    "status": "connected",
    "receiptOpen": false,
    "salesNumber": "000",
    "vatSubtotals": { "A": "0.00", "B": "0.00", "C": "0.00", "D": "0.00", "E": "0.00" },
    "checkedAt": "2026-11-17T19:00:01.000Z",
    "lastSuccessfulCheckAt": "2026-11-17T19:00:01.000Z",
    "error": null
  },
  "verified": true
}
```

All readings must be actual observations. Examples above are schema examples,
not substituted runtime data. `before` is required, `after` may be null on
unverifiable outcomes. `commandResponse` may be null only if not issued or its
actual result is unavailable. Return the actual bounded command code/message/
safe response and actual verification result, never simulated success.

| Result       | Required behavior                                                                        |
| ------------ | ---------------------------------------------------------------------------------------- |
| `CANCELLED`  | `success:true`, `verified:true`, before confirmed OPEN, code `0`, after confirmed CLOSED |
| `NOT_OPEN`   | `success:false`; no cancellation command issued; return actual closed-before observation |
| `FAILED`     | `success:false`; actual failure/error evidence, safe after-read if possible              |
| `UNVERIFIED` | `success:false`, `verified:false`; resulting state unknown or not closed                 |

The server must persist operation audit evidence: authenticated actor, correlation
ID, start/completion times, before/after observations and command/result/error.
Supply a safe operation reference/timestamp under a subsequently confirmed DTO
if operators need to correlate this evidence in the UI. No existing cancellation
history API is established; do not invent a history endpoint or claim the generic
derived events collection provides it.

## Errors and activation requirements

Use the existing JSON error convention, with a safe request ID:

```json
{
  "error": {
    "code": "DEVICE_UNAVAILABLE",
    "message": "Current receipt could not be verified.",
    "requestId": "safe-correlation-id"
  }
}
```

| HTTP status | Meaning                                                                             |
| ----------- | ----------------------------------------------------------------------------------- |
| 400         | Invalid input or missing confirmation                                               |
| 401         | Missing/expired authentication                                                      |
| 403         | Role/permission denied                                                              |
| 409         | Receipt not open or operation conflicts with current device work                    |
| 422         | Device rejected cancellation; return safe failed-operation evidence where available |
| 502         | Malformed/failed device command response                                            |
| 503         | Middleware/device unavailable or capability not implemented                         |
| 504         | Timeout; cancellation outcome may be unknown; never retry automatically             |

Prefer the typed failed-operation response for cancellation evidence on
409/422/502/503/504 once its exact contract is verified. Authentication errors
always use the safe error envelope. Bound responses and sanitize provider/device
diagnostics without erasing the actual outcome. Keep existing correlation and
server-secret protections.

Before local activation: obtain sanitized real responses for open, closed,
unavailable, malformed and device-error reads, and verified/failed/unverified/
forbidden cancellation outcomes; verify exact remote paths and authorization;
then add narrowly scoped gateway integration and mocked tests. Pending local
boundaries must not be enabled merely by adding a browser configuration switch.

Separately verify actual invoice/credit-note nested DTOs, safe evidence projection
and receipt provenance using the existing authenticated document GETs. Customer
PINs are excluded by the current documented server contract; do not bypass that
policy or forward arbitrary provider JSON. Global CU/KRA comparison filtering
would require a confirmed server-wide calculation/filter contract; local filtering
is explicitly scoped to loaded rows and needs no new remote endpoint.
