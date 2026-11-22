# External acceptance and production checklist

This checklist separates evidence still required from work that can be done
with local mocks. Synthetic adapter responses are not vendor or regulator
acceptance.

For the credit-note G03 protocol questions and XML evidence inventory, see the
[vendor acceptance request](tremol-g03-credit-note-vendor-acceptance.md) and
[credit-note lifecycle implementation notes](zoho-credit-note-flow.md).

For the on-site process, use the [customer access request checklist](customer-access-request-checklist.md)
and the offline [office acceptance runbook](customer-office-acceptance-runbook.md).

## Credit-note EJ and diagnostic evidence

- Provide a sanitized, version-matched detailed JSON EJ response for a successfully issued G03 credit note, including field names/types and explicit meanings for trader reference, credit-note document type, related original CU invoice, CU invoice number, completion outcome, and QR/verification evidence.
- Confirm whether the XML's `Length`/`RawRead` sequence returns a single complete UTF-8 JSON object, what a zero-length result means, and how long EJ indexing may take after receipt close.
- Define the supported timeout/restart recovery procedure for `CloseReceipt`, including how to distinguish successful issue, definitive rejection, absence, and inconclusive lookup. State when (if ever) `CancelReceipt` may safely clear an open document.
- Confirm diagnostic read command semantics and the deployed firmware/ZFPLabServer versions. `ReadLastAndTotalReceiptNum` counters and `ReadCurrentReceiptInfo` are observational only; they must not be accepted as proof that a particular credit note was issued.
- The local credit-note processing path uses the installed `OpenCreditNoteWithFreeCustomerData` → `SellPLUfromExtDB` correction lines → `CloseReceipt` sequence and correlates the returned CU number with the serialized readback. The checked-in XML defines negative correction prices and no separate credit-note settlement command. Physical hardware acceptance remains a separately authorized operator test; an ambiguous result is never automatically reissued. The detailed credit-note EJ schema is still needed to automate recovery of uncertain outcomes.

## Legal and business decision record

- Obtain written confirmation from the customer's Kenyan tax/legal adviser and
  relevant provider contacts for the required ordering between Tremol receipt
  issuance and VSCU/OSCU eTIMS submission.
- Confirm which sale, invoice, advance, credit, refund, and correction events
  require device fiscalization and/or eTIMS reporting.
- Approve treatment of unpaid, partially paid, credited, withheld, refunded,
  and reversed Zoho payments. Do not use invoice status alone as payment proof.
- Approve currency, decimal scale, rounding, discounts, inclusive/exclusive tax,
  exempt supplies, and line/tax reconciliation rules without embedding guessed
  Kenyan rates in this application.
- These decisions govern separate reporting/legal workflows. The G03 invoice
  route does not wait for optional eTIMS readiness; it uses the configured
  invoice plan, persisted request protections, and explicit invoice-number
  confirmation.

## Zoho Books tenant acceptance

- Select the tenant's Zoho Accounts data center and API domain. Verify the
  registered OAuth redirect URI, scopes, organization ID, offline refresh
  behavior, token expiry, revocation, and re-consent procedures.
- Run read-only invoice and invoice-payment requests against a non-production
  or explicitly approved test organization. Save sanitized response fixtures
  for invoice detail, line tax/discount data, payment pages, partial payments,
  refunds, credits, and malformed/error responses.
- Verify actual pagination metadata and maximum page size for invoice payment
  history, plus handling of duplicates and concurrent ledger changes while a
  page scan is in progress.
- Confirm whether Books API payment records represent applied accounting
  entries or independently settled funds for the customer's payment workflow.
- The shared middleware OAuth flow requests `ZohoBooks.fullaccess.all` and the
  explicit invoice scopes, `ZohoBooks.contacts.READ` for credit-note customer
  profile retrieval, credit-note `READ`/`UPDATE`, and
  `ZohoBooks.creditnotes.UPDATE` for unique-field credit-note PUT. Confirm that this
  full-access grant is approved for the intended Zoho organization before
  consent. Source support alone does not authorize invoice or credit-note
  updates; the writeback feature and tenant field mappings remain separately
  controlled.
- Validate the requested scopes and token refresh limits against Zoho's
  current contract. Use a separately restricted test grant if the acceptance
  environment requires read-only access.

### Fiscalization result writeback acceptance

- Do not reissue a previously confirmed fiscal receipt. Resolve recovery using
  the exact persisted request and invoice identifiers obtained from the
  authorized database; do not copy live identifiers into scripts or docs.
- Before enabling writeback, have the Zoho administrator confirm the exact
  organization, invoice, and five distinct invoice custom-field IDs for
  fiscalization status, CU receipt number, fiscal QR URL, fiscalized
  timestamp, and transmission status. The eTIMS reference, request ID, and device outcome fields are not used.
  Record the current value of each field as the acceptance baseline. Do not create
  fields automatically or substitute example IDs.
- Confirm OAuth consent contains `ZohoBooks.fullaccess.all`, the explicit
  invoice/credit-note scopes, `ZohoBooks.contacts.READ`, and
  `ZohoBooks.creditnotes.UPDATE` for the documented unique-field PUT.
  Reauthorize through the existing OAuth flow
  only with the customer's explicit approval. Local writeback is available
  through the loopback API after the existing persisted-result eligibility
  checks pass.
- Verify the persisted fiscalization record, immutable snapshot, receipt
  number/QR/actual issue time, and accepted, non-simulated eTIMS result with provider reference. `Fiscalized At` means device receipt issue time. If KRA
  transmission is pending, rejected, or uncertain, stop: the current durable model cannot represent a separately idempotent intermediate phase, so no invoice fields
  may be written and the status must not become `Fiscalized`.
- With customer approval and all eligibility checks satisfied, enable
  the Zoho invoice writeback service and its validated field mapping,
  restart the service, inspect the intended custom-field mapping, then POST
  `/integrations/zoho/fiscalization-requests/{requestId}/zoho-writeback`
  once. Do not call a fiscalization or device endpoint.
- Read the writeback status with GET and independently retrieve that same
  Zoho invoice through the approved read path. Compare each saved custom field
  with the authoritative receipt/eTIMS records and retain sanitized status,
  timestamps, and correlation IDs. If the PUT outcome is uncertain, allow the
  application's GET reconciliation; never manually repeat the update blindly.

## Tremol G03 / ZFP Lab Server acceptance

Use a designated test CU with vendor/customer approval. Do not test receipt
commands on a production CU.

- Record supported CU hardware revision, serial identity, firmware, Kenya
  protocol revision, ZFP Lab Server version, installed SDK/runtime, Windows
  version, and compatibility confirmation from Tremol or its authorized
  integrator.
- Confirm the supported server endpoint, authentication/access controls,
  transport security, command queue semantics, maximum request/response sizes,
  and permitted concurrent connections.
- Verify that the installed server emits the supplied named `Type="Status"`
  fields with `0`/`1` values and compare them with all six Kenya status bytes.
  The application maps only those source-defined fields when present; missing
  fields remain unknown and readiness is never inferred. Establish any
  readiness interpretation with the vendor.
- Verify command argument serialization and exact limits for invoice open,
  item sale, subtotal/discount, payment, close, cancellation, and correction.
  Resolve the documented signature discrepancies before implementing a sender.
- Verify operator identity/password behavior, payment-method mappings, CU
  receipt number and timestamp parsing, QR/signature fields, and expected
  behavior for each device result code.
- On a designated test CU, exercise timeout before command acceptance, timeout
  after command acceptance, lost close response, malformed response, CU busy,
  open receipt on restart, and electronic-journal/last-receipt reconciliation.
- Demonstrate that an uncertain receipt is found or confirmed absent using a
  vendor-supported read/reconciliation mechanism before any retry is permitted.
- Physical installation behavior still requires a controlled operator test.
  The middleware has no separate issuance feature flag; the E2E runner asks for
  the exact persisted invoice number before submitting one process request.

The local XML catalogue contains command definitions, not captured runtime
responses. Its examples and the simulator do not prove installed CU behavior.
See [Tremol protocol status](tremol-g03-kenya-protocol-status.md).

## KRA eTIMS acceptance

- Obtain the current official VSCU/OSCU integration specification and identify
  which model the taxpayer has enrolled for. Confirm the application is
  permitted to submit on that taxpayer's behalf.
- Obtain enrollment prerequisites, taxpayer/device identity rules, test vs
  production endpoints, network allowlists, authentication/certificate/key
  lifecycle, signing requirements, and token renewal behavior.
- Obtain official request/response schemas and examples for the supported
  invoice/document categories, customer/item identifiers, tax mapping, totals,
  discounts, and corrections.
- Confirm official meanings for duplicate responses (including any code such
  as `994`), rejection codes, accepted-but-pending results, throttling,
  idempotency keys, and correlation fields.
- Obtain a documented transaction lookup/reconciliation operation and its
  consistency window. Confirm how to resolve a timeout where the submission may
  have been accepted without blindly replaying it.
- Complete synthetic adapter contract tests first, then provider sandbox
  acceptance using approved taxpayer credentials and non-production fiscal
  records. Preserve sanitized, versioned fixtures.
- Keep `ETIMS_REPORTING_ENABLED=false` until application, legal, taxpayer
  enrollment, and provider acceptance gates are signed off.

See [eTIMS integration status](etims-integration-status.md).

## Database and operations acceptance

- Provision dedicated PostgreSQL test databases using the exact
  names and local connection constraints in [database-migrations.md](database-migrations.md).
- Verify the existing migration history before applying the new relational
  constraints. If the guarded migration finds orphan eTIMS rows, stop and
  review those rows; do not delete them to force migration success.
- Run provider integration tests for new schema, migrated schema, eTIMS and
  device attempts, concurrency, cleanup, stale recovery, and restart recovery.
- Agree retention, backup cadence, encryption-at-rest, restore test, database
  least-privilege grants, local firewall rules, and diagnostic access.
- In customer installation, bind the API to loopback and call it from a local
  client. Do not expose the API through a network interface or reverse proxy.
  Zoho Books access continues to use its configured OAuth grant.
- Test graceful stop/start during pending Zoho retrieval and uncertain device
  or eTIMS work. Verify operators can locate request, attempt, and correlation
  identifiers without logging access tokens, raw tax payloads, or credentials.
