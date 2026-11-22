# Read-only credit-note EJ range recovery

`credit-note-ej-range-recovery.ps1` performs a numeric CU-counter EJ lookup for an existing uncertain credit-note request. It does not issue an invoice or credit note and does not call the Zoho writeback endpoint.

The runner requires explicit start and end counters. The middleware does not derive these values from the 19-digit CU invoice number or from a later receipt-counter observation. For CN030990, the supplied observations do not establish how the 10-digit `StartCUInvoiceNum`/`EndCUInvoiceNum` values map to the 19-digit CU numbers, so an operator must obtain defensible 10-digit bounds before running the command.

The middleware first reads `ReadCurrentReceiptInfo` and sends the EJ command only when no receipt is open. Both commands and the EJ `RawRead` continuation use the same exclusive device command queue. The runner submits the HTTP reconciliation call once and never retries a timeout. An absent match remains inconclusive and is not proof of non-issuance.

## Command shape

Replace both counter values only with explicitly verified ten-digit counters:

```powershell
.\credit-note-ej-range-recovery.ps1 `
  -RequestId "7ca714fc-ed0a-4bca-b8cd-8422521c6675" `
  -StartCuCounter "<verified-10-digit-start>" `
  -EndCuCounter "<verified-10-digit-end>" `
  -OutputPath ".\artifacts\CN030990-EJ-range.json"
```

The exact middleware call made by the runner is:

```http
POST /integrations/zoho/credit-note-fiscalization-requests/7ca714fc-ed0a-4bca-b8cd-8422521c6675/reconcile
Content-Type: application/json

{"startCuInvoiceNumber":"<verified-10-digit-start>","endCuInvoiceNumber":"<verified-10-digit-end>"}
```

The middleware executes `ReadEJByCUInvoiceNum_JSON` (`0x7C`) in detailed format `N`, then reads exactly the returned `Length` through `RawRead(Count=Length)`. It correlates records against the trader reference stored in the request, `7GHJW1S9VZNBPV4`. The caller cannot supply or override that reference.

The result includes the returned EJ JSON payload for operator inspection and only the exact trader-reference match in the identified-record list. Treat the local output file as sensitive fiscal/customer data and store it according to the deployment's access-control policy.
