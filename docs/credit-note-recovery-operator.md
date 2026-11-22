# Credit-note operator recovery

An operator may explicitly execute an existing credit-note request again from
any terminal or reconciliation state, including when prior attempts have
uncertain outcomes or receipt evidence. Submit exactly
`{"operatorOverride":true}` to the existing execute endpoint. The request ID
and immutable intake snapshot are reused; no new Zoho intake is required. No
separate recovery bearer token or environment variable is required.

The retry preserves the request ID and starts the next append-only attempt. It
does not edit or delete previous attempts. The operator retry is recorded in
the new attempt metadata. The route continues to rely on the application's
existing API access controls; the override flag is an explicit action, not an
authentication credential.

Before retrying, inspect the request and attempt history through the read-only
GET routes. Confirm that no attempt is still active. The current capability,
snapshot, customer, original-invoice, line, and device preflight validations
still run. Then submit one POST to
`/integrations/zoho/credit-note-fiscalization-requests/{requestId}/execute`
with the JSON body above. Each accepted POST creates a new append-only attempt;
previous attempt and reconciliation evidence remains recorded. Device commands
are never retried automatically; each additional attempt requires a separate
operator POST.
