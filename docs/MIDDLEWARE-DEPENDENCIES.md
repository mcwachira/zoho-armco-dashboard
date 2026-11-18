# Middleware contract gaps

Confirmed gateway scope is four GET paths: overview, invoices, credit-notes and
services. Four document mappings are now prepared locally for the separate
gateway task, but success data is withheld pending exact DTOs. See
[document integration status](DOCUMENT-API-INTEGRATION.md) and the
[additional API gap analysis](API-INTEGRATION-GAPS.md) for exact document paths,
queries, proposed gateway additions and required read-only server verification.
The historical capability table below describes local contracts/UI plumbing;
it does not establish current live forwarding.

Reviewed 2026-11-15 using only the local `docs/dashboard-api-contract.md`.
Middleware source is on another machine and was not accessed. The contract is
already present; no transfer is requested. This replaces outdated dependency
claims based on an unrelated source checkout.

| Capability                                           | What the contract provides                                                                                             | Exact gap / current dashboard behavior                                                                                                                                                                                                                      |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live invoice / credit-note registers                 | Exact GET paths, supported filters, `{ page, pageSize, total: null, hasMore, items }`, nullable `fiscalizationRequest` | Exact item keys/types/nullability and full request projection are absent. No arbitrary provider record is accepted. Routes validate inputs then return `CONTRACT_SCHEMA_UNAVAILABLE`.                                                                       |
| Live document details                                | GET by Zoho ID; original Zoho representation plus nullable request summary                                             | Detail envelope/wrapper, complete safe field allowlist, custom-field shape and optional fields are absent. Full line/tax/custom-field UI remains incomplete.                                                                                                |
| Invoice / credit-note request history and details    | Dashboard endpoints, conceptual detail contents, invoice status values                                                 | Existing strict project DTOs retained and used by both document-type request views. Their compatibility with deployed middleware is unverified; schema failures remain errors. No source filesystem access is needed.                                       |
| Fiscalization action                                 | Exact POST path, four exact fields, SUBMITTED/202 semantics, middleware-owned orchestration                            | Distinct middleware Better Auth operator-session acquisition/forwarding protocol is undocumented. Dashboard local OIDC cookie cannot substitute. Complete action outcome schemas are also absent. Validated actions fail closed; no production submissions. |
| Independent writeback actions                        | Exact invoice/CN POST paths, empty bodies, persisted fiscal-data reuse                                                 | Same missing operator-session integration plus complete action response DTOs. No fiscalization fallback or device call. Retry buttons are unavailable.                                                                                                      |
| Manual-review list/detail                            | Exact GET paths, pagination, open/resolved filter; invoice cases and decisions                                         | Exact record/detail DTOs omitted. Route/filter/error states exist, persisted per-request review details remain visible. No resolution mutation is exposed or invented.                                                                                      |
| Reconciliation                                       | Exact GET path, filters, invoice operations and CN states/diagnostics                                                  | Exact row/evidence/discrepancy DTO omitted. Collection unavailable; existing request details retain separate reconciliation information.                                                                                                                    |
| Derived events                                       | Exact GET path and date/documentType filters                                                                           | Event ID/type/time/severity/metadata fields and order contract omitted. Collection unavailable. Not described as a generic persisted audit log.                                                                                                             |
| Pending operations                                   | Exact GET path, pagination/documentType, retryableCandidate semantics                                                  | Exact record/status/timestamp DTO omitted. Collection unavailable; queue depth remains unavailable. No unified queue is claimed.                                                                                                                            |
| Writeback operations                                 | Exact GET path and explicitly enumerated fields                                                                        | Implemented strict read/filter/pagination/table with separate retry and provider-exchange counts. Live deployment compatibility remains unverified.                                                                                                         |
| Services/telemetry/device/capabilities/overview      | Documented passive dashboard reads and limits                                                                          | Existing strict DTOs retained; system health reads services observability, not undocumented raw integration metrics/probes. Unavailable/unknown/unverified values retained.                                                                                 |
| Zoho register totals, queue depth, historical uptime | Explicitly unsupported/unreliable                                                                                      | Remain unavailable; loaded pages never imply total counts.                                                                                                                                                                                                  |
| Logout                                               | Dashboard-owned OIDC cookie session                                                                                    | Clears current-browser session and OAuth cookies, client cache and other-tab state. Previously copied stateless cookies have no durable cross-instance revocation; shared session infrastructure remains a separate dashboard gap.                          |

Before deployment, the middleware contract needs concrete JSON schemas or
sanitized representative fixtures for the omitted read/action DTOs, and a
supported documented operator-session integration for this separate dashboard.
This is a contract/integration dependency, not a request to access server files
or permission to weaken validation. No middleware code/configuration change,
production operation, deployment, commit or push was performed.

Current behavior superseding the historical table: request-detail,
device/capability and operational handlers return authenticated
`503 GATEWAY_ROUTE_UNAVAILABLE` without upstream access. Their schemas or UI
components do not make those APIs gateway-accessible. Fiscalization and writeback
action handlers are removed; no action integration is proposed for this read-only
document task. The existing four forwarding integrations remain unchanged.
