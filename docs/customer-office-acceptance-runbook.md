# Customer office acceptance runbook

This offline runbook is for a developer who has not previously operated
ZohoAmarco. It orders checks from low risk to higher risk and makes stop points
explicit. Complete the [access request checklist](customer-access-request-checklist.md)
before the visit. Current contract evidence is in the
[implementation inventory](implementation-inventory.md),
[integration evidence register](integration-contract-evidence.md),
[Tremol Kenya protocol status](tremol-g03-kenya-protocol-status.md), and
[external acceptance register](external-acceptance.md).

## Quick start and printable visit checklist

- [ ] Confirm named business approver, IT administrator, device operator,
      written scope, maintenance window, stop authority, and escalation contacts.
- [ ] Establish whether this visit is observation only or approved read-only
      diagnostics. This runbook does not authorize fiscal mutations.
- [ ] Confirm the Windows host, middleware host, LabServer host, network path,
      PostgreSQL target, backup owner, and service owner with customer staff.
- [ ] Record the installed LabServer and G03 versions/configuration from the
      responsible operator; do not infer a service name, port, or endpoint.
- [ ] Confirm the middleware build, sanitized environment identity, database
      migration status, and health endpoints.
- [ ] If separately approved, retrieve one known Zoho test invoice using its
      read-only route. A successful read does not authorize writeback or fiscal work.
- [ ] Stop on timeout, unexpected XML, device error, uncertain outcome, wrong
      tenant/database, or missing approval. Never blindly retry a potentially
      non-idempotent operation.
- [ ] Complete the evidence worksheet and have the customer approver review
      the result and outstanding blockers.

## Controlled physical invoice acceptance

The configured Tremol adapter is the normal invoice execution path. There is
no separate application issuance switch. The operator remains responsible for
confirming the exact invoice number in the E2E runner immediately before the
single process request. Physical behavior is not established by automated
tests and must be treated as an operator-controlled acceptance test.

The checked-in invoice-mode sequence uses `OpenInvoiceWithFreeCustomerData`
(`0x30`, XML `InvoiceType=1`), `SellPLUfromExtDB` (`0x31`) per line, and
`CloseReceipt` (`0x38`), with receipt-state and CU-number readbacks. The
one-line `OpenSellAndCloseInvoice` (`0x2C`) command remains available for its
single-line contract. The generic article operation has no distinct goods or
service argument; source classification is retained, and service-line
acceptance must be established by a controlled device test.

The invoice-mode path does not register customer payment. Do not configure or
send `Payment`, `PayExactSum`, or `CashPayCloseReceipt` as part of invoice
fiscalization. An unpaid Zoho invoice is eligible; the middleware never turns
its outstanding balance into a cash tender. Only genuine protocol, mapping,
configuration, request-state, or physical-issuance controls may stop execution.

For an explicitly authorized invoice acceptance test:

1. Back up the middleware database and confirm the target tenant and device.
2. Verify the selected adapter and HTTP endpoint in `/health/integrations`,
   simulation is false, and the request's diagnostic plan is executable.
3. Rebuild and restart the Windows server from its owning terminal after code
   or environment changes; verify `/health/ready` before the operator proceeds.
4. Run the existing E2E PowerShell command through the ordinary invoice
   button flow. It does not ask for invoice-number confirmation or a retry
   flag. Before execution it fetches current Zoho receipt fields: either
   populated field stops issuance; both empty make the invoice eligible even
   after an older `OutcomeUnknown` attempt. A current claim returns processing.
5. Retrieve the persisted request and verify the device response includes the
   fiscal invoice number and QR evidence. Preserve rejection, missing-evidence,
   or uncertain-result diagnostics. Do not manually replay a physical device
   command. Any subsequent ordinary button submission repeats the fresh Zoho
   field preflight. Do not write to Zoho until issuance is confirmed and the
   separately configured writeback workflow is authorized.

Use the following role-based interview before touching provider or device
systems. Ask each question aloud, inspect only the requested approved evidence,
and record aliases/statuses rather than secrets or full customer records. If an
answer is unavailable, record its owner and stop the dependent activity.
A satisfactory answer is specific, versioned or written where contract or
authorization matters, agrees with the live configuration being inspected,
and names a responsible owner. A verbal assumption, HTTP response, mock, or
successful build is not a substitute for an approval or provider contract.

## Customer interview guide

### Customer sponsor, finance, and operations

- **Ask:** “What business outcome should this integration support, and which
  invoice types are in scope?” **Why:** Scope determines whether the current
  invoice mapping is adequate. **Request:** Approved process note or example
  with identifying data masked. **Record:** In-scope document types and
  excluded cases. **If unknown:** Sponsor/finance defines scope; do not prepare
  a fiscal transaction.
- **Ask:** “Which exact invoice and payment scenario may we inspect, and is it
  confirmed non-production?” **Why:** A test invoice is not authorization to
  issue a receipt. **Request:** Written invoice alias/ID approval and business
  status confirmation. **Record:** Alias, organization, status, and approval
  reference. **If unknown:** Zoho administrator and finance approver must
  confirm it; do not retrieve it.
- **Ask:** “What are the approved rules for tax, rounding, discounts, currency,
  customer/item mapping, credit notes, cancellations, refunds, and partial
  payments?” **Why:** The middleware must not invent accounting/fiscal policy.
  **Request:** Approved finance policy and examples. **Record:** Rule/document
  references and unresolved cases, not unnecessary invoice contents. **If
  unknown:** Finance/compliance owns the decision; block mapping approval and
  any fiscal mutation.
- **Ask:** “Who may approve this specific test, operate the device, stop it,
  and reconcile Books, CU, and eTIMS records?” **Why:** The developer cannot
  grant business authority. **Request:** Named role/approval chain and contact
  path. **Record:** Names/roles, stop authority, window, escalation number or
  approved channel. **If unknown:** Sponsor assigns owners; observation only.
- **Ask:** “What evidence would prove success, and who accepts or rejects the
  result and owns support afterward?” **Why:** HTTP success alone is not fiscal
  acceptance. **Request:** Acceptance criteria and support procedure.
  **Record:** Evidence references, decision owner, and support owner. **If
  unknown:** No acceptance claim; sponsor and compliance owner define criteria.

### Zoho Books administrator

- **Ask:** “Which Books organization and Accounts data center are intended, and
  what organization ID should the application use?” **Why:** OAuth tenant and
  API routing must match. **Request:** Zoho admin screen or approved
  configuration record. **Record:** Organization alias/ID, DC host, verifier
  and approval reference. **If unknown:** Zoho administrator resolves it;
  do not retry invoice GETs against guessed tenants.
- **Ask:** “Who owns the OAuth app, what redirect URI is registered, and can
  we authorize read-only access first?” **Why:** Callback validation and least
  privilege depend on the correct app. **Request:** OAuth app configuration
  screen and granted scope names, viewed by the administrator. **Record:** App
  owner, URI match, read grant status; never tokens/secrets. **If unknown:**
  App owner must confirm; do not ask for secrets in chat/email.
- **Ask:** “What is the exact approved invoice ID, does it belong to this
  organization, and can the integration user read it?” **Why:** The previous
  404 does not establish absence or wrong permissions. **Request:** Admin
  confirmation in the UI and user access check. **Record:** Approved alias/ID,
  organization match and status. **If unknown:** Stop; do not enumerate
  invoices or substitute another ID.
- **Ask:** “Which customer, items, taxes, currency, discounts, and payment
  records should be used to validate mapping?” **Why:** Mapper fixtures are
  synthetic and business meaning is tenant-specific. **Request:** Approved
  invoice view and payment detail, shown by the administrator. **Record:**
  Field names and sanitized expected categories/amount policy. **If unknown:**
  Finance/admin confirms expected meaning; do not calculate missing values.
- **Ask:** “Is custom-field writeback explicitly part of this approved scope;
  if yes, which tenant fields and who authorizes a test update?” **Why:** Code
  support does not authorize a real write. **Request:** Written permission,
  field IDs and customer reversal procedure if supported. **Record:** In-scope
  field aliases, permission owner and separate approval. **If unknown:** Keep
  writeback unconfigured and use read-only access only.

#### Historical 404: read-only diagnostic order

The repository retains a prior written report that a guarded invoice GET
returned HTTP 404 after OAuth decryption, read-scope, and data-center checks;
it does **not** retain the primary response/log. This visit has not reproduced
that request and its cause is unknown. Diagnose in this order, with approval
for one read-only request:

1. Confirm the intended organization in Zoho Books and compare its identifier
   with the application configuration using the approved secret/configuration
   channel. Do not print `.env`.
2. Confirm the Accounts data center and the trusted API domain stored with the
   OAuth grant are in the same region. Record hostnames only.
3. Have the administrator confirm the integration user and granted
   `ZohoBooks.invoices.READ` scope. Do not request or copy token values.
4. Confirm the exact invoice ID in that organization and that the integration
   user can view it. Do not enumerate or substitute invoices.
5. If all prior checks pass, retrieve that one invoice through the approved
   read route or guarded verifier. Record HTTP category, safe numeric Zoho API
   error code if returned, timestamp and correlation ID. Do not retain raw
   response bodies or invoice content in the handover.
6. In this client, HTTP 404 with Zoho API code `1002` is classified as
   invoice-not-found; a bare/unclassified 404 is an upstream error, not proof
   of absence. If the response does not expose a safe code, ask Zoho support to
   interpret its own request evidence.

**Stop** on tenant, data-center, permission, invoice-ID, or response ambiguity.
Do not change organization settings, grant write scope, run invoice import, or
update a real invoice to diagnose a read failure.

### Windows, network, and security administrator

- **Ask:** “What Windows Server build and patch level is this, and which host
  is the middleware expected to run on?” **Why:** Runtime compatibility and
  routes depend on the actual host. **Request:** System information view or
  approved inventory. **Record:** Host alias, OS/build, role, local time zone.
  **If unknown:** Windows administrator identifies it; do not install software.
- **Ask:** “What named, time-limited access method and service identity are
  approved?” **Why:** Interactive-user access may differ from the service
  account. **Request:** Approved VPN/jump-host/session process and service
  identity permissions. **Record:** Account alias, permission scope, access
  ticket; never password. **If unknown:** IT provisions/supervises a named
  account; do not share/bypass credentials.
- **Ask:** “Which process supervisor starts/stops the API, from what working
  directory, and where are logs retained?” **Why:** There is no installer or
  Windows service wrapper in this repository. **Request:** Service/task
  configuration and log/retention policy. **Record:** Supervisor, service
  account, paths and restart/stop permissions. **If unknown:** Service owner
  decides before deployment; do not improvise a service installation.
- **Ask:** “What bind address, caller path, TLS/reverse proxy, firewall,
  outbound proxy, DNS and TLS inspection rules apply?” **Why:** Local host
  success does not prove service/network reachability. **Request:** Approved
  network diagram/rules and named source/destination endpoints. **Record:**
  Aliases, ports, proxy state, approver. **If unknown:** Network admin confirms;
  no scans or firewall changes.
- **Ask:** “What are the approved maintenance window, clock/time policy,
  restart policy, monitoring and rollback owner?” **Why:** Timestamps and
  orderly shutdown matter for audit and uncertain outcomes. **Request:** Change
  window and operations procedure. **Record:** Time zone, NTP status, owner,
  escalation channel. **If unknown:** No restart/configuration change; escalate
  to IT operations.

### PostgreSQL DBA and infrastructure owner

- **Ask:** “Which database host and database belong to ZohoAmarco, and can you
  confirm this is not the Syspro database?” **Why:** This application persists
  only to its own PostgreSQL database. **Request:** Approved inventory and
  sanitized connection identity. **Record:** Alias, hostname, port, DB name,
  provider. **If unknown:** Stop before connecting; never probe Syspro.
- **Ask:** “What role does the service use, what are its minimum grants, and
  are TLS/certificate requirements enabled?” **Why:** Startup and Prisma access
  must be appropriately scoped. **Request:** DBA role/grant and TLS policy
  review. **Record:** Role alias, TLS mode, grant owner—not password or URL.
  **If unknown:** DBA provisions/reviews; do not use administrator credentials.
- **Ask:** “What migration history is present and has the current backup been
  verified?” **Why:** Applying a migration changes the schema and an
  application rollback may not reverse it. **Request:** Read-only migration
  status and backup/restore evidence. **Record:** Last applied migration,
  backup reference, restore-test date/owner. **If unknown:** No migration;
  DBA/release owner resolves it.
- **Ask:** “Who owns retention, monitoring, restore, maintenance window and
  rollback?” **Why:** The repository has no backup/restore agent. **Request:**
  Operations responsibility matrix and recovery process. **Record:** Named
  owners, RPO/RTO if approved, backup location alias. **If unknown:** Deployment
  approval remains blocked.

### Tremol, LabServer, and authorized device operator

- **Ask:** “What exact G03 model, masked identity, firmware and approved Kenya
  configuration are installed?” **Why:** Command compatibility can depend on
  firmware and configuration. **Request:** Device label/status screen and
  vendor/customer record viewed by the operator. **Record:** Model, masked
  serial, firmware, evidence reference. **If unknown:** Vendor/operator
  identifies them; no command beyond explicitly approved read diagnostics.
- **Ask:** “Which ZFP LabServer version/build is installed, where, under what
  account, and how is its process supervised?” **Why:** Supplied manual/SDK
  versions may not match the installation. **Request:** About/version screen,
  installation metadata, process/service status and relevant logs. **Record:**
  Build, install alias, service identity, status. **If unknown:** Windows admin
  or Tremol confirms; do not assume service name or restart it.
- **Ask:** “What endpoint/listener and network route are actually configured,
  and which callers may reach it?” **Why:** Reachability depends on the
  middleware service host and access controls. **Request:** Server listener
  configuration, firewall rule and approved route. **Record:** Scheme/host/port
  alias, source/destination, ACL reference. **If unknown:** Network/vendor
  confirms; do not assume a default port or open a firewall.
- **Ask:** “For this exact version, does the LabServer support direct GET,
  SDK-style POST/XML, or both, and what version-matched manual defines the
  command signatures and result XML?” **Why:** Supplied sources show different
  transports and do not prove installed compatibility. **Request:** Written
  vendor confirmation, matching manual/SDK release and response examples.
  **Record:** Version/document IDs, supported method/route/body, command names,
  argument/response contract. **If unknown:** Keep to the app's bounded
  allowlisted GET read path only if separately authorized; never switch modes
  or implement receipt calls.
- **Ask:** “Which read-only diagnostic does the vendor recommend first, what
  does its response prove, and how should a timeout be reconciled?” **Why:** A
  successful HTTP response is not device or fiscal readiness. **Request:**
  Vendor procedure and status-code interpretation. **Record:** Command,
  expected safe fields, timeout/reconciliation contact. **If unknown:** Use no
  alternative command; stop after one unexpected result or timeout.
- **Ask:** “Who may restart LabServer or change its settings, and who interprets
  an open receipt/error state?” **Why:** Operational changes can alter device
  behavior and uncertain fiscal state. **Request:** Operator authorization and
  escalation procedure. **Record:** Names/roles and exact authorization scope.
  **If unknown:** No restart, configuration method, generic SDK dispatch, or
  fiscal action.

### KRA/eTIMS and compliance owner

- **Ask:** “Which eTIMS model applies, and who has confirmed taxpayer
  enrollment and environment?” **Why:** OSCU and VSCU are separate contracts.
  **Request:** Current official/customer enrollment evidence. **Record:**
  Selected model, environment, evidence owner/reference. **If unknown:** Keep
  adapter non-operational; compliance/KRA contact resolves it.
- **Ask:** “Which official versioned schema, authentication, response,
  idempotency, and reconciliation contracts apply?” **Why:** Mocks do not prove
  provider acceptance or retry safety. **Request:** Official specification,
  sandbox access process, and vendor/KRA support contact. **Record:** Document
  version/date and gaps. **If unknown:** Do not create speculative payloads or
  enable submission.
- **Ask:** “What is the required ordering relative to the device, and how are
  rejection, delay, duplicate, timeout, correction, cancellation, and refund
  handled?” **Why:** Sequence and recovery affect whether a transaction is
  legally and operationally correct. **Request:** Written decision from the
  responsible compliance authority. **Record:** Approved sequence/recovery
  references and decision owner. **If unknown:** Combined workflow remains
  blocked; no fiscal mutation.
- **Ask:** “Is there a specifically approved sandbox/test environment and who
  can authorize each test?” **Why:** Environment labels alone do not prove it
  is safe or enrolled. **Request:** Written scope, credentials provisioning
  owner, test plan and stop authority. **Record:** Environment alias and
  approval ID only. **If unknown:** No KRA request.

### Customer change approver

- **Ask:** “Do you approve this exact build, invoice alias, device, allowed
  actions, operator and time window?” **Why:** General project approval is not
  transaction-specific authorization. **Request:** Written change/acceptance
  ticket. **Record:** Revision, aliases, individual permitted actions and
  approver role. **If unknown:** Observation/read-only scope only.
- **Ask:** “What are the stop conditions, recovery owner, evidence location,
  and authority for a later fiscal transaction?” **Why:** Uncertain outcomes
  must not be retried or improvised. **Request:** Recovery/reconciliation plan
  and sign-off path. **Record:** Stop authority, evidence owner, escalation and
  recovery reference. **If unknown:** No mutation; close with blockers.
- **Ask:** “Who formally accepts or rejects the result and owns future support?”
  **Why:** Technical success does not equal customer acceptance. **Request:**
  Acceptance criteria and named support owner. **Record:** Decision, name/role,
  date and conditions. **If unknown:** Mark acceptance pending.

## What this system does and does not establish

ZohoAmarco reads a Zoho Books invoice, maps and validates it, then persists a
durable request and immutable input snapshot in its own PostgreSQL database.
Database uniqueness and atomic claims protect duplicate/concurrent work.
Device and eTIMS stages have separate attempt histories. Confirmed failure is
distinct from an uncertain external outcome; the latter requires evidence and
manual reconciliation rather than automatic retry. Writeback is a separate
operator-authorized action and is available only after validated authoritative
non-simulated outcomes.

The PostgreSQL database belongs to ZohoAmarco. It is separate from the
customer's Syspro database; this application has no Syspro connector. SQL
Server is not a ZohoAmarco persistence provider.

The production Tremol client is bounded, asynchronous, serialized, and
allowlisted to four read commands. The health device route currently invokes
`ReadVersion()` only and reports connection status, not fiscal readiness or
the version itself. The supplied manual documents direct HTTP GET commands;
the supplied generated JavaScript SDK uses synchronous HTTP POST with an XML
body. Whether either mode is supported by the installed LabServer/firmware is
not established by source inspection or mocks. The eTIMS and combined legal
workflow are also gated pending authoritative contract and customer acceptance.
No real device acceptance or live fiscal transaction has been performed.

## Visit phases and stop/go decisions

### Numbered execution sequence

Use this order even if the visit is shortened. The detailed authorization,
host, device, health, and Zoho procedures below supply the exact evidence
fields. A phase cannot be skipped to reach a higher-risk action.

| Phase                            | Purpose and action                                                                                                                                                                                                                                                                            | Observable result / evidence                                                                                                                                                                                           | Stop condition                                                                                                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Pre-visit preparation        | Run the local checks in the [developer handover](developer-handover.md); record `git rev-parse HEAD` and whether the worktree has changes; review implementation/contract evidence; confirm appointment, named roles, access, approved invoice, and written scope; save this runbook offline. | Check outputs, revision plus dirty-state note, approvals, contacts, rollback/stop path, and blank worksheet. The repo has no release-checksum script; use a customer-approved artifact/checksum process if one exists. | Missing approver, access, approved scope, rollback owner, or wrong/unknown target. Do not clean or alter the checkout to make it appear clean.                                                                                                              |
| 1 — Introductions and scope      | Meet sponsor/operator; read back allowed actions, approved invoice/device, test window, and stop authority.                                                                                                                                                                                   | Written scope/change reference and named authority for each action.                                                                                                                                                    | No explicit authorization for a provider call means discussion/observation only.                                                                                                                                                                            |
| 2 — Host and service             | Verify Windows host/build, actual service identity, approved working directory, environment source, network path, PostgreSQL alias/migration state, logs and health endpoints. Do not print environment values.                                                                               | Correct host and middleware database confirmed; `/health/live` and `/health/ready` interpreted only for process/database health; backups and rollback owner known.                                                     | Unknown DB target, Syspro target, missing backup approval for schema changes, unexpected enabled feature, or inaccessible sanitized logs.                                                                                                                   |
| 3 — Zoho read-only               | Confirm organization, data center, read grant, exact invoice and integration-user permission. Retrieve only that invoice using the approved authenticated `GET /integrations/zoho/invoices/{invoiceId}` route; use fiscal-candidate only if field mapping is approved.                        | Sanitized HTTP/API category, correlation ID, expected field-presence result and timestamp; no invoice write.                                                                                                           | Tenant/invoice/scope ambiguity, 401/403, unclassified 404, malformed response or missing business policy. Do not enumerate or substitute.                                                                                                                   |
| 4 — LabServer/G03 identification | With IT/operator, record installed versions, actual endpoint, listener, process/logs, route and firmware/configuration. Compare with authoritative version-matched vendor material.                                                                                                           | Host/port alias, LabServer build, CU model/firmware and contract document references.                                                                                                                                  | Unknown installed version, unsupported/unconfirmed transport, device error, or request to change settings/restart without authorization.                                                                                                                    |
| 5 — One approved device read     | If the owner authorizes and `TREMOL_ADAPTER=zfplabserver_readonly` is configured, call `GET /health/device` once. Source shows this invokes bounded `ReadVersion()` and reports `endpoint_reachable`/`unavailable`, with physical identity unverified. It does not return the version.        | HTTP status/body category, duration, timestamp, correlation ID, sanitized app and LabServer log references.                                                                                                            | Timeout, unexpected status/XML/error, or any uncertain delivery. Do not retry, send another method, or switch GET/POST. An alternative POST probe needs separate written vendor/customer approval for that exact read-only request and must not be retried. |
| 6 — eTIMS contract review        | Review enrollment, model, environment, authoritative schema, sequence and reconciliation evidence with compliance/vendor contacts. Current production adapter is non-operational.                                                                                                             | Official doc versions, owner, environment and unresolved contract questions.                                                                                                                                           | Missing sandbox authorization or any unresolved contract means no provider request and no submission.                                                                                                                                                       |
| 7 — Closeout                     | Review each row with owner; classify PASS, FAIL, BLOCKED, NOT TESTED or NOT APPLICABLE; record evidence location, blocker owner and next action; request acceptance/rejection.                                                                                                                | Sanitized worksheet and written customer decision.                                                                                                                                                                     | Never label mocked/source checks as external pass. No receipt or production eTIMS action is authorized by this runbook.                                                                                                                                     |

The sections below provide detailed steps for these gates. Phase labels in the
legacy checklist map as follows: A→1, B→2, C→4/5, D→2, E→3, and F is the
future fiscal mutation gate described below.

### Phase A — Arrival and authorization

**Purpose:** Make sure the work is authorized and the right people are present.

1. Confirm the customer contact, change/ticket reference, scope, time window,
   named stop authority, escalation route, and whether each activity is
   observation, read-only, configuration change, or fiscal mutation.
2. Ask who owns the Windows server, network, PostgreSQL, Zoho tenant, LabServer,
   physical CU, and applicable compliance decisions. One person may not own all
   of them.
3. Read back the explicit allowed and prohibited actions. Identify the host,
   tenant, invoice, and database by approved aliases before connecting.
4. Confirm that no one expects the developer to use Syspro, share credentials,
   disable gates, issue/cancel a receipt, or submit to a production endpoint.

**Evidence:** approval reference, roles, scope, window, stop authority, allowed
operations, forbidden operations, and escalation contact.

**STOP** if the customer cannot identify an approver or if the requested action
exceeds written scope. Continue only with discussion or supervised observation.

### Phase B — Windows, network, time, and database baseline

**Purpose:** Confirm that the systems under inspection are the intended ones.

1. Using the customer's approved VPN, jump host, or on-site session, confirm
   the Windows host name and purpose with the administrator. Record Windows
   edition/build and the approved runtime version (`node --version`) where
   relevant. Do not assume a service name or middleware/LabServer co-location.
2. Record local time, time zone, and clock status without changing the clock.
   Ask the administrator to investigate drift; do not alter time settings.
3. Confirm the actual middleware environment source and deployment identity
   with its owner. Never print `.env`, a complete database URL, or environment
   secrets. Confirm the PostgreSQL host/database alias against the approved
   change record and check `/health/ready` when the application is running.
4. Establish whether the target is the ZohoAmarco PostgreSQL database. Do not
   connect to Syspro. Ask the DBA to confirm the service role, backup time,
   restore owner, migration window, and whether a restore has been rehearsed.
5. Confirm network path and DNS only to administrator-identified hosts and
   ports. Do not scan networks or change firewall rules.

**Evidence:** host aliases, platform/runtime versions, timestamp/time zone,
sanitized PostgreSQL database name and migration state, reachability result,
backup reference, access ticket.

**STOP** if host, environment, or database identity is ambiguous, if the
configured database is production/customer data without approved scope, or if
a migration/change is requested without DBA approval and a verified backup.

### Phase C — ZFP LabServer and physical G03

**Purpose:** Distinguish network reachability, HTTP service response, device
communication, and legal readiness; they are different facts.

1. Ask the Windows administrator/vendor to identify the installed ZFP
   LabServer version, install location, process/service identity, startup mode,
   status, and log location. The repository does not define the customer's
   Windows service name or actual endpoint.
2. Ask the administrator to verify the actual listening host/port on the
   server. Compare it with configured `TREMOL_BASE_URL` through the approved
   configuration channel without printing credentials. The example default
   `http://127.0.0.1:4444` is not a customer fact. Do not weaken production
   validation to accommodate a site endpoint.
3. With network approval, perform one reachability check from the middleware
   host to the confirmed endpoint. A TCP connection proves only a route/listener
   exists; an HTTP response proves only that something answered.
4. Have the authorized operator confirm CU model, identity, firmware, Kenya
   configuration/registration evidence, connection type, and visible device
   state. Let the vendor/operator interpret status codes.
5. If the app is configured to use the read-only Tremol adapter, call
   `GET /health/device` once. It makes one bounded `ReadVersion()` probe and
   responds with `endpoint_reachable` or `unavailable`, explicitly reports
   `physicalDevice: unverified` and `fiscalReadiness: unknown`, and does not
   return the version. `GET /health/dependencies` also runs bounded database and
   device diagnostics. Do not call both consecutively merely to repeat the
   device probe. There is no public raw command endpoint for the other allowlisted
   reads.
6. Record outcome, elapsed time, HTTP status, sanitized category, and
   correlation ID. Correlate application logs with LabServer logs locally.
   Do not copy device settings, passwords, customer data, or raw XML containing
   sensitive fields into the report.

**STOP** on timeout, nonzero result, malformed/unexpected XML, device
unavailable/busy, or unexplained HTTP response. A timed-out command may have
reached the server; do not retry without vendor guidance and a specific
reconciliation plan. Escalate transport/firmware questions to Tremol. Do not
call settings/configuration commands, generic SDK dispatch, or
`PrintDiagnostics()` (absent from supplied generated SDK). The SDK POST/XML and
manual GET transport compatibility remains unverified. Any probe of an
alternative mode requires separate written vendor/customer approval, is
read-only only, and must not be retried after uncertain outcome.

### Phase D — Middleware health and diagnostics

**Purpose:** Establish application/database process health without implying
provider or fiscal readiness.

1. Start or inspect the middleware only using the approved deployment owner and
   actual service manager. The repository provides `pnpm dev` for development
   and `pnpm start` for the built process; it does not provide a Windows service
   installer/wrapper. Do not install or restart a service unless separately
   authorized.
2. Check `GET /health/live` for process liveness, `GET /health/ready` for the
   bounded PostgreSQL readiness check, and `GET /health/integrations` for
   configured integration/blocker state. These do not verify Zoho credentials,
   KRA, LabServer transport, or device readiness. If device diagnostics are
   approved, use the single `GET /health/device` described above.
   The current `/health/*` routes are registered before the bearer-authenticated
   `/integrations/zoho` routes. Keep the API loopback-bound or within an
   approved, restricted network boundary; `GET /health/device` and
   `/health/dependencies` can cause the configured read-only device probe for
   any network caller that can reach them.
3. Record application version/Git revision if available, process/service
   identity, startup time, health status, migration status, and any sanitized
   errors. Use `X-Correlation-ID` from responses/logs when following one request.
4. Verify the service is not silently falling back to SDK POST, another
   provider, simulation, or an unverified workflow. Do not enable simulation in
   production or report simulated outcomes as receipts.

**STOP** if database readiness fails, required migrations are pending, logs
contain unexpected secrets, or health output contradicts the approved
configuration. Do not run migrations in a customer environment without an
approved change and backup.

### Phase E — Zoho read-only verification

**Purpose:** Confirm tenant scoping, OAuth read access, and mapping for exactly
one approved invoice.

1. The Zoho administrator confirms the organization, Accounts data center,
   OAuth owner, and `ZohoBooks.invoices.READ` grant. Credentials are provisioned
   through approved secret management; never request or handle raw tokens or
   client secrets in chat or evidence.
2. Confirm the invoice reference with the business approver and verify it
   belongs to the approved organization. Do not enumerate invoices or select a
   substitute if it fails.
3. From the local loopback API, retrieve the
   one invoice with `GET /integrations/zoho/invoices/{invoiceId}`. The
   `.../fiscal-candidate` route additionally maps and validates it. Neither
   route changes Zoho. Do not invoke invoice import/sync or any writeback route
   during read-only acceptance.
4. Record status/category, sanitized response fields needed for mapping,
   correlation ID, and elapsed time. Avoid copying invoice content, names,
   addresses, or totals unless customer policy requires a protected evidence
   location.

A Zoho `404` is not automatically proof that the invoice is absent. The client
maps HTTP 404 with Zoho API error code `1002` to explicit not-found; a bare or
unclassified 404 is treated as an upstream error. A prior written report says
the configured invoice request returned HTTP 404, but its underlying response
evidence is not retained in the repository; the cause remains unknown. That
report does not confirm the intended organization or successful invoice access.
Ask the Zoho administrator to confirm organization, data center, invoice ID,
and permission. Do not repeat requests blindly or expose tokens.

**STOP** if the organization or invoice cannot be confirmed, OAuth errors, the
response is malformed, or required mapping fields are missing. A successful
read does not enable fiscal execution or writeback.

### Phase F — Fiscal acceptance gate

**This is a gate, not an instruction to issue a receipt. Current visit scope is
read-only. Fiscal mutations remain prohibited.** Before any later controlled
mutation, the project owner must review a separate test plan and confirm all of
the following in writing:

1. Exact G03 model, identity, firmware, installed LabServer version, and
   approved Kenya configuration are recorded.
2. The authoritative command contract, exact arguments/encoding, operation
   sequence, response validation, result mapping, timeouts, and recovery path
   match the installed build. POST-versus-GET support is resolved by vendor
   evidence and approved acceptance evidence; source mocks alone are not enough.
3. The customer approves the exact test transaction, invoice, device, operator,
   date/time window, expected output, reporting obligations, and stop authority.
4. The responsible customer/compliance contact and any required vendor/KRA
   contact confirm applicable workflow and acceptance evidence. Do not infer
   compliance requirements.
5. The operator can distinguish confirmed success, confirmed failure, and
   unknown outcome and has a recovery/reconciliation plan for timeout, partial
   receipt, process restart, and duplicate risk.
6. The application release, database backup/restore, gates, credentials,
   monitoring, rollback owner, and escalation contacts are reviewed.
7. The test cannot accidentally fiscalize a real invoice or submit to an
   unauthorized production endpoint.

If any gate is missing, stop at read-only acceptance. Do not invent payloads,
disable gates, enable receipt issuance, run KRA production submissions, or retry
an uncertain transaction.

## Troubleshooting decision paths

Use the route's correlation ID and timestamp, plus sanitized application and
provider logs. Do not paste raw request/response bodies or environment files
into tickets.

| Symptom                                              | Safe first checks and evidence                                                                                                                                                    | Do not do                                                                                                                              | Escalate when                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Middleware does not start / config validation fails  | Capture error category, app revision, runtime version, and variable **names** implicated; compare required keys to `.env.example` and `src/config/env.ts` without showing values. | Do not dump environment or relax production validation.                                                                                | Windows administrator for service identity/permissions; application owner for schema/config issue. |
| PostgreSQL unavailable or readiness fails            | Confirm approved host/port/database alias, PostgreSQL process, network path, role provisioning, and `/health/ready`; check sanitized DB logs.                                     | Do not try Syspro, print URL, change password, or point at another database as a shortcut.                                             | DBA for reachability/role/backup; application owner for pool or query errors.                      |
| Migration pending or fails                           | `prisma migrate status` against the confirmed middleware DB; record migration name and sanitized error. Review backup and migration approval before any deployment.               | Do not run `migrate reset`, delete migration history, edit applied migrations, or migrate the existing dev/test DB as a fresh install. | DBA and release owner before applying or repairing anything.                                       |
| LabServer endpoint cannot be reached                 | Confirm configured endpoint with admin; verify listener, DNS, route, and firewall for that exact port. Record source/destination aliases and time.                                | Do not scan ports, open firewall, guess defaults, restart, or switch to SDK transport.                                                 | Windows/network administrator or LabServer vendor.                                                 |
| HTTP answers but device does not                     | Compare LabServer logs and device connection state; distinguish listener response from device availability and fiscal readiness.                                                  | Do not equate HTTP 200 with device success or receipt success.                                                                         | Tremol and authorized device operator.                                                             |
| Read-only device request times out                   | Record command (`ReadVersion` via `/health/device`), time/duration, status, sanitized error, correlation ID, and LabServer/device log references. Treat delivery as uncertain.    | Do not blindly retry or call a mutating command.                                                                                       | Tremol/vendor and customer stop authority.                                                         |
| Device returns error/malformed XML/unexpected fields | Preserve sanitized error category and response schema facts; have vendor interpret result code against installed version.                                                         | Do not invent result-code meanings or copy raw sensitive XML.                                                                          | Tremol/vendor; application owner if parser contract mismatch.                                      |
| Zoho OAuth failure                                   | Check configured data center/organization, OAuth grant/scopes, redirect setup, token encryption configuration, and safe application category.                                     | Do not request or print tokens/secrets.                                                                                                | Zoho administrator for grant/tenant; application owner for client error.                           |
| Zoho invoice GET returns 401/403                     | 401: verify OAuth connection/expiry and Accounts data center. 403: verify organization and read scope. Record status/category and correlation ID.                                 | Do not keep retrying auth errors or broaden scopes without approval.                                                                   | Zoho administrator.                                                                                |
| Zoho invoice GET returns 404                         | Confirm exact tenant, invoice ID and API error code. Only API code `1002` is treated as not-found; bare 404 remains upstream/ambiguous.                                           | Do not conclude invoice absent, enumerate invoices, or choose a different record.                                                      | Zoho administrator and application owner.                                                          |
| Zoho returns 429/5xx                                 | Record response category, timing, and retry headers only if sanitized; client has bounded GET behavior. Wait for service recovery and follow operator guidance.                   | Do not launch parallel requests or re-run sync/import.                                                                                 | Zoho administrator/provider support if persistent.                                                 |
| Mapping rejects invoice                              | Record field names and validation category, not unnecessary invoice values. Confirm customer/tax/currency data with approved business owner.                                      | Do not alter invoice or infer tax treatment.                                                                                           | Zoho/business owner; application owner for mapping contract.                                       |
| Fiscal request pending/in progress/unknown           | Read durable request/status and attempt history using authenticated read route; correlate logs. Unknown requires external evidence and reconciliation.                            | Never process again, submit another request, switch provider, or call reconciliation without authority.                                | Customer stop authority, device/vendor, compliance owner, application operator.                    |
| Shutdown or dependency restart during operation      | Record signal/time, request ID, stage/attempt status, and service/dependency logs. External result may be unknown even if process stopped cleanly.                                | Do not assume graceful shutdown means provider did not receive the operation. Do not retry.                                            | Service owner and relevant provider/operator for outcome evidence.                                 |

### Failure-to-code diagnostic map

Use this map after the safe first checks above. The named tests are local
unit/fixture tests unless explicitly called an integration test; they do not
contact the customer provider or hardware.

| Symptom                                                                           | Source and focused test                                                                                                                                                                                                                   | Next safe action / evidence                                                                                                                                                                                                                                          | Escalation                                                                                                  |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Environment/startup validation fails                                              | `src/config/env.ts`; `tests/unit/env.test.ts`; wiring in `src/server.ts`                                                                                                                                                                  | Capture only setting names and safe error category; compare requirements with `.env.example`; do not dump environment.                                                                                                                                               | Application owner; Windows service administrator if service-only.                                           |
| PostgreSQL unavailable or migrations differ                                       | `src/infrastructure/database/postgresql-client.ts`; `src/infrastructure/database/postgresql-fiscalization-repository.ts`; `tests/unit/postgresql-fiscalization-repository.test.ts`; DB suites in `tests/integration/`                     | Confirm approved host/port/database alias, role/TLS, `/health/ready`, and read-only migration status. No migrate command until backup and approval.                                                                                                                  | DBA / database owner.                                                                                       |
| OAuth callback, token, or scope failure                                           | `src/application/zoho/zoho-oauth-service.ts`, `src/routes/zoho-oauth-routes.ts`; `tests/unit/zoho-oauth-service.test.ts`, `zoho-oauth-routes.test.ts`, `zoho-token-exchange.test.ts`                                                      | Check callback URI, account/DC, grant and stored scope names; record category/correlation ID, never token contents.                                                                                                                                                  | Zoho admin/app owner.                                                                                       |
| Organization/data-center mismatch                                                 | `src/integrations/zoho/accounts-domain.ts`, `api-domain.ts`, `src/application/zoho/zoho-oauth-service.ts`; `tests/unit/zoho-api-domain.test.ts`, `zoho-oauth-service.test.ts`                                                             | Compare admin-confirmed organization and allowed Accounts/API hostnames. Do not switch tenants by guess.                                                                                                                                                             | Zoho administrator.                                                                                         |
| Zoho invoice 404                                                                  | `src/integrations/zoho/books-client.ts`, `src/routes/zoho-books-routes.ts`; `tests/unit/zoho-books-client.test.ts`, `zoho-books-routes.test.ts`                                                                                           | Confirm tenant, DC, exact ID, integration-user access and READ scope; collect safe API code and correlation ID. `1002` is explicit not-found per current mapping; bare/unclassified 404 remains upstream. Historical event lacks retained primary response evidence. | Zoho administrator, then Zoho support/application owner if still ambiguous.                                 |
| Zoho 401/403, 429, timeout, 5xx or malformed response                             | `src/integrations/zoho/books-client.ts`; `tests/unit/zoho-books-client.test.ts`                                                                                                                                                           | Record status/category/timing and safe provider error code; respect bounded GET retry behavior. Do not multiply retries or broaden scopes.                                                                                                                           | Zoho admin/support for persistent service/permission issue; application owner for parsing defect.           |
| Invoice mapping or required-field failure                                         | `src/application/zoho/zoho-invoice-mapper.ts`, `prepare-fiscalization-request.ts`, `fiscalization-snapshot.ts`; corresponding mapper/preparation/snapshot tests                                                                           | Record missing/invalid field names, not personal/commercial values; finance confirms expected meaning.                                                                                                                                                               | Finance/Zoho admin; application owner if documented fields parse incorrectly.                               |
| Duplicate registration or concurrent claim                                        | `src/application/fiscalization/register-fiscalization-request.ts`, `src/infrastructure/database/postgresql-fiscalization-repository.ts`; `tests/unit/register-fiscalization-request.test.ts`, `tests/unit/fiscalization-workflow.test.ts` | Read the existing request by approved org/invoice identity and inspect attempts; never create an alternate request to bypass uniqueness.                                                                                                                             | Application operator and DBA if persistence state conflicts.                                                |
| Previous invoice request is `OutcomeUnknown`, `Failed`, or another terminal state | Invoice button route and persisted attempt history; `tests/unit/zoho-button-submission-routes.test.ts`, fiscalization repository tests                                                                                                    | Fetch the latest invoice. If either Zoho receipt field is populated, report already fiscalized and do not send G03; if both are empty, ordinary fiscalization is eligible. Keep prior requests and attempts as history.                                              | Zoho Books retrieval failure; device execution remains subject to adapter availability and invoice mapping. |
| LabServer endpoint unreachable                                                    | `src/infrastructure/device/tremol-zfplabserver-transport.ts`; `tests/unit/tremol-zfplabserver-transport.test.ts`, `tests/unit/health.test.ts`                                                                                             | Verify exact configured origin from approved configuration channel, listener, route and firewall for that one endpoint; no port scans.                                                                                                                               | Windows/network administrator or Tremol support.                                                            |
| LabServer HTTP response but XML/result parse error                                | `src/infrastructure/device/tremol-zfplabserver-client.ts`; `tests/unit/tremol-zfplabserver-client.test.ts`                                                                                                                                | Record HTTP status, safe error class, result-code presence and sanitized schema facts; compare with matching server definition.                                                                                                                                      | Tremol/vendor for contract; application owner for parser regression.                                        |
| Device unavailable, busy, or status is unexpected                                 | `src/infrastructure/device/tremol-device-diagnostics.ts`, `tremol-zfplabserver-client.ts`; `tests/unit/tremol-device-diagnostics.test.ts`, client tests                                                                                   | Have the authorized operator inspect physical connection and LabServer logs; do not interpret undocumented status/result codes as healthy.                                                                                                                           | Device operator/Tremol.                                                                                     |
| Read-only request timeout or disconnect                                           | `src/infrastructure/device/tremol-zfplabserver-transport.ts`, `src/infrastructure/device/tremol-zfplabserver-client.ts`; transport/client tests                                                                                           | Record command, start/end time, duration, correlation ID and service logs. Treat delivery as uncertain and stop; do not retry or switch transport.                                                                                                                   | Tremol plus customer stop authority.                                                                        |
| Receipt proposal rejected/blocked or unexpected receipt result                    | `src/infrastructure/device/tremol-receipt-command-builder.ts`, `tremol-fiscal-device.ts`; `tests/unit/tremol-receipt-command-builder.test.ts`, `tremol-fiscal-device.test.ts`                                                             | Current adapter intentionally blocks before sending. Preserve the gate. If a future implementation exists, reconcile actual device records before any further operation.                                                                                             | Application owner, authorized operator, Tremol and compliance approver.                                     |
| eTIMS auth/schema rejection/timeout/unknown                                       | `src/integrations/etims/`, `src/application/fiscalization/etims-reporting-service.ts`; `tests/unit/kra-protocol-clients.test.ts`, `etims-reporting.test.ts`, `etims-reconciliation-worker.test.ts`                                        | Identify OSCU or VSCU contract and environment; retain safe category/reference only. Never assume a rejected or timed-out write was not accepted.                                                                                                                    | KRA/eTIMS support, compliance owner and provider integrator.                                                |
| Works interactively but not as Windows service                                    | `src/server.ts`, `src/config/env.ts`, `src/infrastructure/database/postgresql-client.ts`; `tests/unit/env.test.ts`, `graceful-shutdown.test.ts`                                                                                           | Compare service identity, working directory, injected setting names, DNS/proxy/ACL and device/database route. Reproduce only under authorized service identity.                                                                                                      | Windows/network/DB administrator.                                                                           |
| Health says blocked/unconfigured or integrations unavailable                      | `src/app.ts`; `tests/unit/health.test.ts`                                                                                                                                                                                                 | `/health/integrations` reports configured state/blockers; `/health/dependencies` may probe device; `/health/device` sends one `ReadVersion()` if configured. Record exact endpoint and response.                                                                     | Application owner for wiring; respective provider/IT owner for connectivity.                                |

## Evidence worksheet

Keep the completed worksheet in the customer's approved restricted location.
Use aliases where possible and redact before anything leaves that environment.

```text
Visit date/time and time zone:
Customer-approved scope / change reference:
Approver (name/role) / stop authority:
Customer, Windows, network, DBA, Zoho, device/vendor, compliance contacts:
Authorized activities and explicit exclusions:
Windows host alias / purpose / OS build:
Middleware version or Git revision / runtime / service identity:
Build artifact identifier/checksum reference if the approved release process has one:
API bind alias / reverse proxy / caller route / TLS boundary:
PostgreSQL host alias / safe database name / readiness / migration status:
PostgreSQL role alias / TLS requirement / DBA owner:
Backup reference / last backup / retention / restore owner / restore readiness:
LabServer version / install alias / process status / endpoint scheme-host-port / transport evidence:
Device model / masked identity / firmware / Kenya configuration evidence reference / operator:
Approved read command / start / end / duration / HTTP status / device result category:
Sanitized result or error category / correlation ID / evidence location:
Zoho organization alias / organization confirmation / Accounts data center / approved invoice alias:
Zoho read-scope confirmation / sanitized error code/category / mapping outcome / correlation ID:
KRA/eTIMS model / environment / enrollment-contract evidence reference / compliance owner:
Written authorization reference / approved actions / test window / stop authority:
Acceptance test ID / PASS, FAIL, BLOCKED, NOT TESTED, or NOT APPLICABLE:
Expected versus observed result:
Changes made (normally none) / approver / change reference / regression test:
Unresolved blocker / owner / next action / due date:
Evidence owner / evidence location alias / redaction review:
Customer acceptance or rejection / approver name and role / date / conditions:
```

Illustrative format only; this is **not a real test result**:

```text
Check: GET /health/device (single ReadVersion diagnostic)
Time: 2026-10-28 10:15 EAT; duration: 0.4 s; HTTP: 200
Result category: endpoint_reachable; correlation ID: [approved opaque ID]
Meaning: The LabServer endpoint responded to the application read probe.
Not established: physical device identity, fiscal readiness, GET/POST equivalence, legal acceptance.
```

Before sharing evidence, remove access/refresh tokens, client secrets,
encryption keys, device passwords/PINs, full connection strings, raw invoice
and personal data, customer identifiers not approved for sharing, and device
settings. Keep evidence location and access owner rather than copying raw logs.

## Acceptance matrix

`PASS` below means only that the specified local software check ran. It never
means the customer's external system or hardware passed. Current verification
is summarized in the [implementation inventory](implementation-inventory.md).

| ID   | Prerequisite                                                            | Action                                                                                              | Expected result / evidence                                                                                                                                     | Risk   | Status                                                             |
| ---- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| L-01 | Local source snapshot                                                   | Full unit suite (`pnpm test`)                                                                       | Current run: 69 files passed, 4 skipped; 902 passed, 17 skipped.                                                                                               | Low    | PASS (local only; source archive, no Git metadata)                 |
| L-02 | Local PostgreSQL test DB                                                | Repository PostgreSQL integration suites                                                            | Latest reported run: 15 repository integration tests passed across fiscalization, Zoho token, and OAuth attempt suites.                                        | Low    | PASS (local only)                                                  |
| L-03 | New empty suffixed local migration-test DB                              | Fresh-install migration integration test and Prisma migration status                                | Latest run applied all 18 migrations; 2 migration assertions passed; history up to date. Existing dev/test DBs were preserved.                                 | Low    | PASS (local only)                                                  |
| L-04 | Current lockfile                                                        | `pnpm audit:deps`                                                                                   | Latest reported run: no known vulnerabilities. Repeat for release evidence.                                                                                    | Low    | PASS (local only; rerun at release)                                |
| L-05 | Current source snapshot                                                 | `pnpm format:check` and `pnpm openapi:lint`                                                         | Formatting and OpenAPI lint pass; six OpenAPI issues are explicitly ignored by repository lint configuration. Git diff checks are unavailable in this archive. | Low    | PASS (local documentation verification; no Git metadata)           |
| O-01 | Customer approval and Windows/network access                            | Identify host, actual LabServer endpoint/listener and network route; no broad scan                  | Correct host/route recorded; no firewall changes.                                                                                                              | Low    | PENDING                                                            |
| O-02 | LabServer/device owner present; read-only diagnostics approved          | `GET /health/device` once; it calls bounded `ReadVersion()`                                         | `endpoint_reachable`/`unavailable`, physical device unverified, timing, status, sanitized error, correlation ID. Not fiscal readiness.                         | Low    | PENDING                                                            |
| O-03 | Vendor confirms installed build and read command contract               | Compare versioned LabServer logs and expected XML/result contract                                   | Match supported version, request/response and result-code interpretation.                                                                                      | Medium | BLOCKED: vendor/environment evidence                               |
| O-04 | Customer authorizes named Zoho read-only invoice check                  | `GET /integrations/zoho/invoices/{invoiceId}` for exactly one approved invoice                      | Tenant-scoped response or safely classified error; no invoice mutation.                                                                                        | Low    | PENDING; 404 previously reported, underlying evidence not retained |
| O-05 | Zoho administrator confirms tenant and read grant                       | Verify organization/data center and one invoice mapping                                             | Expected fields validate; sanitized evidence only.                                                                                                             | Low    | PENDING                                                            |
| V-01 | Vendor/customer approve specific diagnostic method                      | Compare direct manual GET with SDK POST/XML against installed LabServer, only if vendor says needed | Evidence for the exact command/version/mode; never implies all modes or commands work.                                                                         | Medium | BLOCKED: transport compatibility unverified                        |
| F-01 | All fiscal gate items in Phase F approved and verified                  | Any receipt/device/eTIMS mutation                                                                   | Separate signed plan, known approved test invoice, definitive response/reconciliation path.                                                                    | High   | PROHIBITED in this visit; no verified contract                     |
| F-02 | Authorized customer/compliance/vendor procedure and production approval | Any live KRA/eTIMS submission or invoice writeback                                                  | Only exact approved action, tracked against external evidence.                                                                                                 | High   | PROHIBITED until separate authorization and contract acceptance    |

## Sources and limits

Commands and routes above are based on the current repository package scripts,
`src/app.ts`, `src/routes/zoho-books-routes.ts`, `src/server.ts`,
`src/config/env.ts`, Prisma PostgreSQL configuration, and the supplied vendor
manual/SDK references in `docs/`. Review those files if the release changes.
The customer endpoint, LabServer version, firmware, organization, permissions,
legal workflow, test invoice, and acceptance authority remain site-specific
facts to collect; this document does not establish them.
