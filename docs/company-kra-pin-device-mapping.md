# Optional customer KRA PIN mapping

Zoho Books places the customer's tax registration number on the invoice response
as `invoice.tax_reg_no`. The Books client retains the raw invoice source and
exposes this value as `customerKraPin`. The invoice mapper accepts a value from
that property (or the preserved raw source), trims surrounding whitespace,
validates the Kenyan PIN shape, and carries it as `clientPin` on the fiscal
candidate. The immutable fiscalization snapshot records the normalized value
on both the invoice and customer portions of the snapshot. Existing snapshots
are not rewritten; the PIN fields are optional in snapshot version 1.

The G03 command field is `ClientPINnum`. It is declared for the invoice-opening
commands in `docs/XML/s_OpenInvoiceWithFreeCustomerData.xml` and
`docs/XML/s_OpenSellAndCloseInvoice.xml`; the checked-in SDK signatures in
`docs/JS/fp.d.ts` also expose it. The field description identifies it as a
client PIN. The serializer emits the normalized customer value only when it is
present and well formed. If the Zoho field is missing, null, blank, whitespace,
or malformed, the serializer omits the `ClientPINnum` argument altogether.
It does not send an empty string, a placeholder, or `COMPANY_KRA_PIN` as a
substitute.

The XML catalog exposes the argument but does not explicitly declare it
optional, and the SDK signature accepts a string. The middleware's omission
behavior is covered by mock contract tests; acceptance of an omitted argument
by the installed ZFPLabServer and G03 firmware remains unverified. Do not treat
this static definition as proof of device behavior or issue a real invoice
until the controlled acceptance procedure records that behavior.

`COMPANY_KRA_PIN` remains a separate, existing configuration and request
eligibility check. It is retained in the immutable snapshot as company
configuration data, but it is not mapped to `ClientPINnum`. This change does
not infer customer tax data from company identity, customer name, address, tax
treatment, or another Zoho field.

## Runtime invoice selection and verification

Invoice retrieval and preparation take the Zoho invoice ID supplied to the
existing application interface. `ZohoBooksClient.getInvoice` verifies that
the returned `invoice_id` matches the requested ID. Preparation checks for an
existing durable request before fetching or registering another one, and the
database uniqueness constraint arbitrates concurrent duplicates. There is no
automatic “latest invoice” selection or production fallback ID. Test-only
invoice selection is explicit and environment-gated.

For a request, supply the invoice ID in the existing route path:
`POST /integrations/zoho/invoices/{invoiceId}/fiscalization-requests` (empty
request body). This synchronizes an idempotent pending request; it does not
issue a fiscal receipt. The preview route is
`GET /integrations/zoho/invoices/{invoiceId}/tremol-receipt-plan`. The
PowerShell acceptance script also requires an explicit
`-ZohoInvoiceId "<approved invoice ID>"` argument. Its device processing option
is a separate, safety-gated operation.

Automated verification uses mocked Zoho, database, and device dependencies. It
covers a populated `tax_reg_no`, absent and blank values, snapshot retention,
and XML construction with and without `ClientPINnum`. These checks do not make
live Zoho calls or send device commands. Live acceptance requires an explicitly
approved new invoice, a confirmed authorized test CU, operator supervision,
and reconciliation of the actual device evidence before Zoho writeback.
