# Local dashboard document compatibility implementation report

2026-11-17. Confirmed dashboard-side gaps were corrected and source compatibility
was tested against the user's raw Zoho/provider examples. The user explicitly
confirmed retaining existing dashboard envelopes. Authenticated middleware
responses remain unavailable; actual fiscalization joins and deployed nested
DTO compatibility cannot be signed off from provider examples alone.
This replaces the earlier report; earlier work is described in
[document integration history](DOCUMENT-API-INTEGRATION.md).

## Audit and retained functionality

The repository exists at
`C:\Users\pc\Documents\GitHub\zoho-armco-dashboard`; its package name is
`zoho-amarco-dashboard`. The lead and three reviewers audited read-only before
editing. Existing uncommitted work was preserved. No other repository or
middleware source was searched or modified. User-provided response samples were
inspected before implementing the additional source mapping corrections.

Retained the existing shared document register/detail components, React Query
hooks, styling, navigation, authentication and fixed authenticated GET gateway.
Existing source/request/execution/attempt displays, safe verification links,
provenance, current-page comparison filters and source pagination remain intact.
Passive diagnostics and UNKNOWN G03 preflight behavior were already correct.

## Corrections and exact files changed in this follow-up

| File                                                     | Change and reason                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/api/reconciliation-contracts.ts`           | Preserve exact nonblank CU strings. Validate supplied status/invoiceNo using the same calculator and supplied CU/URL pair; recalculate contradictions with an explanatory reason. Keep source precedence without combining evidence.                                                   |
| `src/features/api/reconciliation-contracts.test.ts`      | Whitespace equality, encoded URL values, inconsistent supplied status, spoofed invoiceNo, malformed/missing evidence, leading zeros and source isolation regressions.                                                                                                                  |
| `src/features/api/ApiDocuments.tsx`                      | Add invoice-only Balance column with existing decimal formatter; reuse shared related-invoice renderer for array references.                                                                                                                                                           |
| `src/features/api/DocumentDetailView.tsx`                | Shared related-invoice array/flat fallback display for lists and details. Display source discount/tax metadata, tax IDs and CN updated_time fallback. Remove Customer PIN display to align the documented API exclusion.                                                               |
| `src/features/api/document-provisional.ts`               | Accept safe numeric source IDs/postcodes losslessly as strings; retain CN invoices[] and updated_time, source discount/tax metadata and tax references; validate compact timezone offsets. Strip customer_pin. Receipt IDs remain strings only; no VAT or monetary calculations added. |
| `src/features/api/ApiDocuments.test.tsx`                 | Sample-backed rendering/navigation, timestamp/reference/discount checks; balance precision/zero/null/absence, PIN exclusion, missing/null details and every reconciliation status through list/filter/detail for both kinds.                                                           |
| `api/_lib/document-gateway.test.ts`                      | Kind-correct identities and PIN stripping across all four handlers/read roles. Source-sample integration through retained dashboard envelopes; tax amount type differences, safe numeric IDs, invoices[], missing amounts and raw-wrapper rejection.                                   |
| `src/features/api/document-provisional.test.ts`          | New source-sample and synthetic boundary coverage: distinct invoice/CN tax fields/types, missing rates/totals, precision, null/missing/unsupported containers, list/detail consistency, unknown-field stripping and receipt non-coercion.                                              |
| `src/features/api/__fixtures__/zoho-response-samples.ts` | New reduced fixtures preserving the user's four provider examples and exact relevant value types/nesting. Explicitly not authenticated middleware responses; excluded irrelevant customer tax/contact data. Test-only imports.                                                         |
| `src/lib/api/client.ts`                                  | Explicitly mark unused schema/signal arguments in the existing disabled receipt/cancellation boundaries so full lint passes; fail-before-fetch behavior unchanged.                                                                                                                     |
| `docs/DASHBOARD-FEATURE-AUDIT.md`                        | Current findings, exact provider field/type/nesting inventory, accepted null behavior and verification limits.                                                                                                                                                                         |
| `docs/LOCAL-DASHBOARD-IMPLEMENTATION-REPORT.md`          | This changes/validation/limitations report.                                                                                                                                                                                                                                            |
| `docs/DOCUMENT-API-INTEGRATION.md`                       | Update follow-up source evidence and validated supplied-reconciliation behavior; preserve earlier integration history.                                                                                                                                                                 |

Several paths were already modified/untracked at task start. The full Git diff
includes earlier work; the table identifies this follow-up's exact scope.
Production gateway routing/authentication, styles, hooks and device operations
were not changed. Client boundary edits only address unused parameters.

## API evidence: verified source structures and unavailable middleware fields

**Authenticated middleware response structures captured in this task: none.**
Only `.env.example` exists and relevant process configuration/session access was
absent. No token was guessed, logged or written. Existing mappings were verified
by inspection and mocked authenticated integration, not live HTTP success:

| Browser GET                                  | Upstream GET                               |
| -------------------------------------------- | ------------------------------------------ |
| `/api/dashboard/documents/invoices`          | `/api/dashboard/documents/invoices`        |
| `/api/dashboard/documents/invoice?id=ID`     | `/api/dashboard/documents/invoices/ID`     |
| `/api/dashboard/documents/credit-notes`      | `/api/dashboard/documents/credit-notes`    |
| `/api/dashboard/documents/credit-note?id=ID` | `/api/dashboard/documents/credit-notes/ID` |

Retained confirmed dashboard envelopes:
`{page,pageSize,total:number|null,hasMore,items}` and
`{documentType,zohoDocumentId,document,fiscalizationRequest:object|null}`.
The user's examples are raw provider `code`/`message` wrappers, not replacements
for these dashboard envelopes. Tests explicitly reject raw provider responses
at the dashboard boundary. No guessed provider-to-dashboard pagination adapter
was introduced; notably the supplied CN list has a single object and no metadata.

The [audit inventory](DASHBOARD-FEATURE-AUDIT.md#field-inventory-and-verification-status)
records exact names/types/nesting. Source-backed findings include:

- Invoice IDs/customer/item/tax IDs may be safe numeric JSON integers; source
  identifiers now normalize losslessly. Unsafe numeric identifiers stay unavailable
  rather than being rounded. Fiscal receipt identifiers are still strings only.
- Both supplied details use `taxes[]`. Invoice header tax_amount is a number;
  credit-note tax_amount is a decimal string and has a tax_id. Those amount types
  already worked. Invoice line tax_name/tax_percentage are supplied, while the
  credit-note line only has tax_id. Missing line tax amount/rate is not calculated.
- CN supplied related-invoice references are in `invoices[]`, not the flat candidate
  fields. All available references display using a shared renderer. A plain
  `reference_number` remains text rather than becoming an inferred link. Related
  allocations do not prove which invoice was the original fiscal document.
- Compact source offsets `-0800`/`-0700`, numeric ZIP and CN `updated_time` now
  display. Document source discount metadata is separate from discount totals.
- Missing CN subtotal, tax total, rate and line amount remain unavailable. The
  illustrative source totals are retained verbatim, without arithmetic repair.

Samples do not establish runtime nullability, middleware fiscalizationRequest
names/nesting, authoritative CU/KRA field locations, custom fields, command/attempt
structures, deployed path exposure or receipt capabilities. Existing request
projections remain provisional. The official [invoice](https://www.zoho.com/books/api/v3/invoices/)
and [credit-note](https://www.zoho.com/books/api/v3/credit-notes/) docs were consulted
as provider references, not proof of deployed middleware behavior.

## Verification

All automated gateway/UI transport is mocked. Sample-backed tests preserve the
user's source structure; synthetic tests cover missing/null/error boundaries and
fiscalization evidence scenarios. Production receipt/cancellation capability
flags stay false. No real fiscalization, retry, receipt read, cancellation or
writeback was sent. Desktop integration remains skipped because this environment
has no middleware installation.

| Check                                                                                         | Result                                                                                      |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Focused reconciliation unit suite                                                             | 33 passed, exit 0                                                                           |
| Focused source projection suite                                                               | 22 passed, exit 0                                                                           |
| Focused authenticated document gateway suite                                                  | 70 passed, exit 0                                                                           |
| Focused document UI suite                                                                     | 58 passed, exit 0                                                                           |
| Final full suite, `pnpm.cmd test --reporter=dot`                                              | 547 passed, 8 opt-in middleware tests skipped, 0 failed; 27 files passed, 1 skipped; exit 0 |
| TypeScript, `.\node_modules\.bin\tsc.cmd -b --pretty false`                                   | Passed, exit 0                                                                              |
| Production build, `.\node_modules\.bin\vite.cmd build --configLoader native` after TypeScript | Passed, exit 0; 3031 modules; existing bundle-size warning above 500 kB remains             |
| Full ESLint, `.\node_modules\.bin\eslint.cmd .`                                               | Passed, exit 0                                                                              |
| Full Prettier, `.\node_modules\.bin\prettier.cmd --check .`                                   | Passed, exit 0; checked again after recording final results                                 |
| `git diff --check` and final change review                                                    | Passed; pre-existing unrelated edits retained                                               |

The final TypeScript/build commands use installed project binaries and are
equivalent to the corresponding package scripts (`tsc -b && vite build`). The
pnpm typecheck/build wrapper initially could not open its package-manager store
lock outside the workspace. An earlier approved wrapper build also passed;
the final installed-binary commands completed within the workspace. No
dependency installation, environment-file overwrite or deployment was needed.

An early full run overlapped active implementation edits and loaded stale
production modules alongside new assertions; its failures were superseded by
the stable-source full run. Lint findings in the new test literals and existing
disabled client parameters were corrected before final checks.

## Remaining dependencies and limitations

Sanitized authenticated middleware lists/details are still needed to confirm the
retained wrappers, source projections and actual request/receipt evidence. No
live API success or Google sign-in is claimed. Provider examples validate local
source mapping only; unexpected middleware nesting can still display unavailable.
No interactive browser visual QA was available; component tests verify rendered
behavior.

Whole-register CU/KRA filtering needs a verified backend calculation/filter
contract; the current UI explicitly filters the loaded page. Live G03 receipt
state needs a verified authenticated read capability; UNKNOWN is intentional
until then. Unverified proposed receipt/cancellation endpoints remain disabled.

No remote source/server/configuration, VAT mapping, fiscalization eligibility,
G03/ZFPLabServer setting, execution blocker/lock/cooldown/attempt limit was changed.
No automatic cancellation, OutcomeUnknown retry, deployment or remote mutation
was performed.
