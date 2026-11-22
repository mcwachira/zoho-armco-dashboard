# CN030990 G03 validation incident

This investigation used read-only middleware GET endpoints. It did not send a
device command or write to Zoho Books.

## Persisted execution evidence

Request `7ca714fc-ed0a-4bca-b8cd-8422521c6675` remains in
`RECONCILIATION_REQUIRED`, with one attempt. The request records
`deviceResponseMetadata.open = acknowledged`; it has no CU receipt number, QR,
or fiscalization timestamp. Its attempt row has no error details or response
metadata. The request's generic error text therefore does not contain the
original exception.

The failure can be reconstructed from the persisted input and the checked-in
client validation: the line's Zoho product name, `Armco Table Top,3 Burner`,
was copied into `HSName`. The installed `SellPLUfromExtDB` definition limits
`HSName` to 20 characters; the client throws exactly:

> `HSName exceeds the documented 20-character limit.`

That validation runs before constructing or submitting the line command.
However, the earlier `OpenCreditNoteWithFreeCustomerData` command had already
been submitted and acknowledged. Therefore, no sell-line command or
`CloseReceipt` was submitted, but the G03 receipt was open. The receipt was not
issued/closed; the open device state still requires reconciliation. Do not
retry or reissue this request before the device state is resolved.

The workflow now persists local validation errors and per-attempt evidence,
including the failed step, whether the failed command was transmitted,
whether `CloseReceipt` was transmitted, and the known receipt outcome. It records a local
pre-close validation as a failed command attempt while keeping the request in
reconciliation when an open receipt was acknowledged. Retry remains blocked.

## Tax and price interpretation

The original electronic-journal values are `TotalInvoiceAmount=34.48`,
`TotalTaxableAmount=29.72`, and `TotalTaxAmount=4.76`. KRA defines these as the
total invoice amount, taxable amount excluding tax, and total VAT respectively.
Thus `29.72 + 4.76 = 34.48`; `34.48` is not the untaxed base. See KRA's
[Revised Electronic Tax Register Specifications](https://www.kra.go.ke/images/publications/Revised-Electronic-Tax-Register-Specifications.pdf).

The credit note is tax-exclusive in Zoho: subtotal `34.48`, VAT `5.52`, total
`40.00`. Where Zoho omits a line tax amount but supplies a 16% tax rate, the
mapper now calculates VAT per line to cents using half-up rounding. For this
line, `34.48 × 16% = 5.5168`, rounded to `5.52`; the VAT-inclusive G03 unit
price is `40.00000`. It preserves positive quantities and prices and does not
apply tax twice to Zoho-inclusive amounts. HS name comes only from the original
fiscal HS classification and is blank when that source has none; product names
are not HS descriptions.

The credit-note gross `40.00` exceeds the original G03 gross `34.48`. The
middleware does not cap or rewrite the requested amount. The device's
cumulative-credit validation remains authoritative, and this mismatch must be
resolved through ordinary credit-note/device reconciliation before a new
issuance request is considered.

## Writeback

Zoho writeback was correctly not attempted: no confirmed receipt, QR,
fiscalization timestamp, or complete persisted device evidence exists. The
credit note must not be marked fiscalized. Writeback remains independently
retryable after confirmed receipt evidence exists; retrying it does not run the
credit-note fiscal command.

## Read-only G03 state check

The middleware's read-only diagnostics collected at `2026-11-03T10:37:59.921Z`
reported `OptionIsReceiptOpened=1`; all VAT-group subtotals were `0.00`;
`SalesNumber=000`; `OptionClientReceipt=1`; and `Opened_Fiscal_Receipt=1` in
status flags. `ReadLastAndTotalReceiptNum` returned the unchanged last CU invoice
`0110162170000104696` and receipt counter `0249037`. These values are consistent
with an empty open receipt, and no new CU receipt is recorded.

The checked-in `ReadCurrentReceiptInfo` schema exposes only open status, sales
number, VAT-group subtotals, receipt format, client-receipt flag, and power-down
status. It does not expose receipt transaction type, `RelatedInvoiceNum`, or
`TraderSystemInvNum`. The server-communication read also returned only a
generic receipt/status result. Thus this snapshot cannot prove that the current
open receipt is the same credit note, nor verify its original invoice or trader
reference. It is unsafe to resume line registration or close this receipt.

The XML catalog documents `CancelReceipt` (`0x39`) as canceling all sales in an
unclosed receipt and closing it. It does not provide a verified application
recovery sequence that establishes this command's safe applicability to this
particular credit note. Do not issue it automatically. Have the device inspected
and obtain Tremol-authorized recovery guidance. After any separately authorized
recovery, re-read current receipt state and reconcile the original request; do
not send another `OpenCreditNoteWithFreeCustomerData` for this request.

The request and attempt rows remain unchanged. The read-only diagnostics were
appended as a new snapshot. Because the old attempt contains no raw validation
exception, its row cannot be truthfully rewritten as if the error had been
captured then. The source workflow now persists exact validation errors and
transmission-stage metadata on future attempts; the incident reconstruction
above remains explicitly documented as a reconstruction.
