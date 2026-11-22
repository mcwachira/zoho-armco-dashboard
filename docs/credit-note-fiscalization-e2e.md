# Credit-note fiscalization E2E runner

Run the existing middleware workflow in one invocation:

    .\credit-note-fiscalization-e2e.ps1 -ZohoCreditNoteId "CREDIT_NOTE_ID"

ApiBaseUrl selects the middleware instance. WhatIf performs health checks,
Zoho retrieval, validation and plan preview, then stops before request
registration or device I/O.

The normal flow retrieves the credit note and displays its mapping, then uses
the tenant-scoped idempotent request endpoint. Existing requests and snapshots
are reused unchanged. The original RelatedInvoiceNum is sourced from explicit
credit-note source metadata or a same-organization authoritative fiscalization
record for its linked invoice. It must be exactly 19 digits. The middleware
never substitutes the Zoho invoice number. The persisted TraderSystemInvNum is
limited to the G03 15-character field.

Immediately before the single execute request, the operator confirms the
credit-note number, related CU invoice number, total, device endpoint and
authorization by typing the displayed phrase. The script does not resubmit
execution after timeout or ambiguity. If an existing attempt is unresolved,
it calls request-scoped read-only device diagnostics and EJ reconciliation,
then stops unless the existing workflow confirms receipt evidence. The reads
use the middleware's serialized device client.

The checked-in Kenya definitions identify OpenCreditNoteWithFreeCustomerData
(0x30), SellPLUfromExtDB (0x31) once per credit-note line, and CloseReceipt
(0x38), followed by CU receipt-number correlation. The s_SellPLUfromExtDB XML
says corrections use a minus sign in Price; the middleware preview is the
exact payload it will submit. There is no separate payment or settlement
command. Do not substitute positive prices unless a version-matched vendor
definition establishes that behavior.

The script treats the G03 receipt number and correlated QR returned from the
device as fiscal evidence. A separate KRA/eTIMS transmission status is
informational and is not required to classify confirmed G03 issuance. After
the receipt is persisted, the script uses the existing credit-note Zoho
writeback route; writeback recovery does not call the G03.

The script prints persisted command arguments, raw responses, parsed values,
timestamps and device errors with customer PIN/token values redacted.
Automated tests use mocks and never call Zoho or physical hardware.
