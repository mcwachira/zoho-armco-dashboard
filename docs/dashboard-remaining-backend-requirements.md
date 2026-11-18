# Remaining dashboard integration requirements

The user reports the expanded Public Gateway, middleware and PostgreSQL are
operational and authenticated safe GETs returned real data. This document does
not request another broad server rebuild or assert those services are down.

## Evidence needed from the completed audit

Transfer the five named reports into this repository. Confirm full externally
requested URLs, including whether canonical names are relative to
`/api/dashboard`. Fresh unsigned probes disagree with a literal-root reading
(404 at roots, 401 at prefixed paths). No namespace fallback should hide this.

For each supported read provide the actual successful safe DTO, pagination,
query names/types/limits and authentication requirements. Preserve types and
nullability while redacting customer values; do not send credentials. Priorities:

1. Invoice and credit-note history/detail exact paths, ID semantics and envelopes.
2. Whether document-register reads succeed, their Zoho field projection, date
   semantics, source statuses and fiscal joins. Historical workflow rows must
   not be passed off as a complete Zoho register.
3. Writeback success payload against the existing operation schema.
4. Reconciliation, event and pending-operation record DTOs. These routes exist
   according to the audit; missing frontend schema evidence is distinct from a
   missing backend route. No field names or example records were invented.
5. Device and Services projection fields and freshness/scope semantics.
6. Safe correlated request IDs and failure status from the affected Vercel
   request to establish its exact deployed failure, separate from the proven
   local `GATEWAY_ROUTE_UNAVAILABLE` gates.

## Capabilities that are not provided

| Requirement                    | Current supported basis                                                | Future contract requirement, only if needed                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Monitoring                     | Overview aggregate counts, supplementary limited Services observations | Historical/time-series metrics require a separately agreed contract; no `/monitoring` endpoint is assumed                                       |
| Complete system health         | Limited Services projection                                            | Define independently observed dependencies, check time, stale/unavailable semantics; no `/system-health` path is assumed                        |
| Unified fiscalization requests | Separate invoice and credit-note histories                             | If a combined read is required, agree ordering, document type, stable IDs, pagination and totals first; do not invent `/fiscalization-requests` |
| Queue depth                    | Not exposed by current operations projection                           | Agree actual queue source, worker/type scope, observation time and unknown states; do not derive depth from returned page size                  |
| Manual review                  | Tables were empty during server audit                                  | Confirm empty collection shape and exact row DTO before rendering future cases; do not fabricate cases or resolution actions                    |
| Physical G03 health            | Unverified                                                             | Separately establish freshness and measured connectivity/readiness; passive configuration is not proof                                          |
| G03 cancellation               | Disabled in dashboard UI and proxy                                     | Separate backend authentication/authorization review; shared bearer plus claimed role/identity is insufficient evidence                         |

## Local access and release gates

No approved gateway bearer is present in this process. An approved server-only
environment or sanitized report samples are required for authenticated testing;
never paste tokens into chat or browser configuration. Status-only diagnostics
do not validate record counts, DTO compatibility or hosted OAuth behavior.
After evidence arrives, update validators and renderers together, test through
the actual dashboard proxy, verify actual counts/paging/detail identity, then
request separate authorization before pushing or deploying. Nothing in this
mission authorizes G11SERVER modification or live fiscal operations.
