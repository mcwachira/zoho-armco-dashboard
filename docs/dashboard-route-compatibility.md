# Dashboard route compatibility

The user supplied eleven canonical route names from the completed G11SERVER
audit. The dashboard's browser namespace remains `/api/dashboard`; it is not
automatically an upstream namespace. Code now separates canonical resource
paths from the established upstream namespace. It preserves `/api/dashboard`
until the transferred route matrix confirms the full external URLs. The
canonical-path column below is relative to that retained namespace, not a claim
that literal gateway roots succeeded.

| Resource                  | Previous upstream configuration         | Prepared canonical path   | Response mapping status                                                 |
| ------------------------- | --------------------------------------- | ------------------------- | ----------------------------------------------------------------------- |
| Overview                  | `/api/dashboard/overview`               | `/overview`               | Existing strict schema; fresh sample pending                            |
| Invoice history           | `/api/dashboard/invoices`               | `/invoices`               | Existing strict history schema; fresh sample pending                    |
| Credit-note history       | `/api/dashboard/credit-notes`           | `/credit-notes`           | Existing strict history schema; fresh sample pending                    |
| Full invoice register     | `/api/dashboard/documents/invoices`     | `/documents/invoices`     | Existing provisional projection; availability/sample pending            |
| Full credit-note register | `/api/dashboard/documents/credit-notes` | `/documents/credit-notes` | Existing provisional projection; availability/sample pending            |
| Writeback                 | Locally disabled                        | `/writebacks`             | Existing documented strict schema enabled; actual compatibility pending |
| Reconciliation            | Locally disabled                        | `/reconciliation`         | Configured; missing actual row DTO blocks forwarding                    |
| Events                    | Locally disabled                        | `/events`                 | Configured; missing actual row DTO blocks forwarding                    |
| Pending operations        | Locally disabled                        | `/operations`             | Configured; missing actual row DTO blocks forwarding                    |
| Services                  | `/api/dashboard/services`               | `/services`               | Existing limited service schema; fresh sample pending                   |
| Device projection         | Locally disabled                        | `/device`                 | Existing strict projection enabled; actual compatibility pending        |

## Fresh live namespace discrepancy

The unsigned, read-only comparison from this PC reached the Public Gateway:

- All eleven literal-root paths returned **404**.
- All eleven corresponding `/api/dashboard/...` paths returned **401**.

Command: `node scripts/probe-public-gateway.mjs --unauthenticated --compare-namespaces`.
No token was sent and no response body, header value or customer data was read
or printed. A 401 establishes an authentication boundary, not successful data
or even authorization of the selected downstream route. An unsigned 404 alone
does not distinguish a missing path from authentication-dependent routing.

These results conflict with an unqualified literal-root interpretation. The
canonical names may be relative to `/api/dashboard`; this is an inference,
not a confirmed replacement contract. The latest user direction is to resolve
this using the transferred matrix. The proxy therefore retains its established
namespace rather than switching known reads to unsigned-404 roots. Do not certify
the mappings before the matrix or authenticated evidence resolves this. Do not add automatic
fallbacks that retry alternate namespaces and conceal configuration mistakes.

## Detail routes and unsupported aliases

Prepared `/invoices/{id}`, `/credit-notes/{id}` and document collection/ID
templates derive from older documentation, not inspected successful responses
from the completed audit. They remain locally blocked until exact paths,
parameters and DTOs are confirmed. Synthetic tests of their existing parsers do
not activate them in production.

No `/monitoring`, `/system-health`, `/fiscalization-requests` or queue-depth route
was created. Monitoring reuses Overview; health uses scoped Services; invoice
and credit-note histories remain separate. Capabilities and manual-review routes
are not part of the eleven newly confirmed names and retain their existing
explicit unavailable states pending the detailed reports.

## Required transferred evidence

The following reports are still absent from this checkout:
`07-dashboard-integration-findings.md`,
`09-required-fixes-and-implementation-plan.md`, `10-dashboard-api-contract.md`,
`02-middleware-api-inventory.md`, `04-gateway-route-matrix.md`.
They currently reside on G11SERVER in the audit directory supplied by the user;
that filesystem was not accessed from this PC.
