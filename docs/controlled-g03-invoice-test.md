# Controlled Tremol G03 invoice test

## Test12345

Test12345 is invoice `1462401000017395558`, request
`1d4892e9-a2ab-400a-9452-3d4c6438219d`, latest snapshot
`5e9bb88ce678245a7d69f6468f365a75df1f3cd2bf915588d9f35a5bac6c3bbd`. Its
two lines are already classified in the persisted snapshot: Sample Item Test
is a service with a blank source unit, and Ice Tray is goods with unit `EA`.
Both have VAT class A at 16%. Do not refresh the snapshot or create another
request unless the guarded refresh checks establish a real mapping change.

The invoice is unpaid (`KES 0.00` paid, `KES 50.00` outstanding). It remains
eligible for fiscalization. Fiscal invoice mode does not collect or register
customer payment and does not change Zoho's payment status.

## Implemented invoice sequence

For a multi-line invoice, the existing adapter sends, in order:

1. `OpenInvoiceWithFreeCustomerData` (`0x30`), whose installed XML hardcodes
   `InvoiceType=1` for a fiscal invoice.
2. `SellPLUfromExtDB` (`0x31`) once per source line, including the VAT class,
   VAT group rate, price, quantity, and source unit. Blank `MeasureUnit` is
   preserved; the XML permits an empty text value.
3. `ReadCurrentReceiptInfo` (`0x72`) to confirm the receipt remains open.
4. `CloseReceipt` (`0x38`), whose XML response supplies `InvoiceNum` and
   `QRcode`.
5. `ReadCurrentReceiptInfo` and `ReadLastAndTotalReceiptNum` (`0x71`) to verify
   closure and correlate the latest CU invoice number.

No `Payment`, `PayExactSum`, or `CashPayCloseReceipt` command is sent. Customer
collection remains a separate Zoho Books event. The adapter still treats any
timeout, malformed response, device rejection after open, missing receipt
evidence, or failed readback as a failure/uncertain outcome. It never retries a
physical command automatically.

The installed generic line command has no separate goods/service argument.
The source classification is retained in the snapshot and plan, but actual
G03 acceptance of a mixed service/goods invoice has not been physically
verified. Mock tests do not establish installation or legal acceptance.

## Current deployment controls

The configured real adapter is the normal processing path; there is no
separate physical issuance feature flag. The local `.env` selects the HTTP
`zfplabserver_multi_line` adapter at `http://127.0.0.1:4444` and simulation is
disabled. Before each ordinary submission, the middleware fetches the latest
Zoho invoice and checks CU Receipt Number `1462401000015933006` and Fiscal
QR/Tax URL `1462401000015933008`. Either populated field means already
fiscalized; both empty make the invoice eligible regardless of older request
or attempt state. The running server must be rebuilt and restarted from its
owning terminal after any source or environment change. Do not stop a process
from a terminal that does not own it, and do not start a second server on port 3001.

Before an authorized physical test, an operator must verify the live
`/health/integrations` values and the invoice's actual receipt plan. The plan
must be `multi_line_proposal`, `executable: true`, have no blockers, and show
the expected invoice, two classified lines, VAT data, and device argument
values. The integration and its protocol behavior have not been verified on
the physical G03; the operator must be authorized to perform this test and
must stop on any device rejection or uncertain outcome.

## Operator procedure

1. Confirm the G03 is in a safe test state and that the operator is authorized
   to issue this invoice. Confirm the live Zoho invoice and request IDs above.
2. Fetch the latest invoice through the ordinary submission flow. Stop if
   either Zoho fiscal receipt field is populated. Preserve and inspect prior
   request/attempt history for diagnostics; an older internal state does not
   independently block an otherwise eligible invoice. If an execution claim
   is currently active, wait for it to finish.
3. Inspect `/health/live`, `/health/ready`, `/health/integrations`, and
   `GET /integrations/zoho/invoices/1462401000017395558/tremol-receipt-plan`.
   Stop unless the configured adapter is `zfplabserver_multi_line`, transport
   is HTTP, device execution mode is `real`, simulation is disabled, and the
   plan is executable with no blockers. Health labels do not
   prove device acceptance.
4. After the physical test is separately authorized and any required
   owning-terminal restart is complete, run this command. It retrieves the
   latest invoice, checks the plan, and submits through the ordinary
   no-confirmation Zoho button flow:

   ```powershell
   .\fiscalization-e2e.ps1 `
     -ZohoInvoiceId "1462401000017395558" `
     -ExpectedRequestId "1d4892e9-a2ab-400a-9452-3d4c6438219d"
   ```

   Use `-PrepareOnly` for read-only preparation. The runner does not request
   an invoice-number confirmation or retry flag and never sends payment
   options. A current execution claim returns an already-processing response.

5. Inspect the final persisted request and verify the device-returned CU
   receipt number and QR. The process endpoint persists authoritative receipt
   evidence before attempting the existing Zoho custom-field writeback.
6. Confirm Zoho writeback is `COMPLETED`. If it is `PENDING`, allow the
   background worker to retry using the saved evidence. Do not issue the G03
   invoice again because writeback failed.

## Stop conditions

Stop without submitting if either Zoho fiscal receipt field is populated, the
plan is diagnostic/unavailable or has a genuine execution blocker, simulation
is active, the adapter is not real, or the invoice/request identity differs.
After a process POST timeout or connection failure, do not manually replay a
physical device command. A subsequent ordinary button submission performs a
fresh Zoho field check: either populated field stops issuance, both empty keep
the invoice eligible, and a current claim returns processing. Preserve the
attempt diagnostics. Do not send `CancelReceipt` or `CloseReceipt` manually to
clear an uncertain context.

## Automated versus physical verification

Automated tests use mocked Zoho and ZFPLabServer transport only. They verify
the serialized command order, unpaid/partial/paid eligibility, idempotency,
response evidence handling, and independent Zoho writeback retry. Physical
G03 and KRA acceptance remain pending until an operator performs the
controlled test and captures the actual device response.
