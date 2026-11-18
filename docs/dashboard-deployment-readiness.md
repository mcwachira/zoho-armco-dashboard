# Dashboard Vercel deployment readiness

Assessed 2026-11-18 in the dashboard checkout only. The user confirmed the
existing target project as **zoho-armco-dashboard**, with production origin
`https://zoho-armco-dashboard.vercel.app`. This assessment did not create a
project, change production settings, push source, or deploy.

## Repository configuration

The existing Vite SPA and Vercel Node API functions are retained. Explicit
settings were added to `vercel.json` so the next deployment uses the reviewed
build configuration rather than depending on project auto-detection:

| Setting               | Reviewed value                                         |
| --------------------- | ------------------------------------------------------ |
| Project root          | Dashboard repository root                              |
| Framework             | `vite`                                                 |
| Install command       | `pnpm install --frozen-lockfile`                       |
| Build command         | `pnpm run build`                                       |
| Output directory      | `dist`                                                 |
| Node                  | `>=22.12.0 <23` in `package.json`; Node 22 on Vercel   |
| Package manager       | `pnpm@12.16.1` in `package.json`                       |
| Auth function limit   | Existing 20 seconds                                    |
| Dashboard read limit  | Existing 10 seconds; BFF upstream timeout is 8 seconds |
| Device function limit | Existing 30 seconds; dedicated bounded relay retained  |

These file-based framework/install/build/output settings are supported overrides
in the [official Vercel configuration reference](https://vercel.com/docs/project-configuration/vercel-json).
Vercel's [Vite integration](https://vercel.com/docs/frameworks/frontend/vite)
supports the existing frontend arrangement, and the
[Node runtime reference](https://vercel.com/docs/functions/runtimes/node-js)
documents TypeScript functions under the root `api` directory.

No alternate build system, framework migration or generic API proxy was added.
The existing security headers and function limits were preserved. Production
configuration contains no localhost or development upstream target.

The SPA fallback still explicitly excludes `/api` and its descendants. A missing
API route must remain an API/platform error instead of successful `index.html`.
`api/_lib/deployment-config.test.ts` covers direct SPA navigation and the auth,
dashboard, device and unknown API boundaries. Static dashboard function filenames
remain in place to prevent the earlier routing-query injection regression.

## Dependency installation validation

Existing dependencies were present. An isolated ignored directory inside this
repository was populated with copies of `package.json` and `pnpm-lock.yaml`.
The following validation succeeded using the pinned manager without downloading
packages or executing lifecycle scripts:

```powershell
pnpm.cmd install --frozen-lockfile --lockfile-only --ignore-scripts --offline --dir .deployment-validation.tmp
```

Result: **passed**, pnpm 12.16.1, `Lockfile passes supply-chain policies`.
The source and validated lockfile SHA-256 values were identical:
`ace2bf6a11bce697e486e278315961733b4422b35fdebd30c0e3940b75b602b4`.
The temporary validation directory was removed afterward. Application dependencies
and the source lockfile were not changed. This validates frozen resolution from
the existing lockfile, not a clean network installation on Vercel.

The pnpm 12 lockfile intentionally has separate YAML documents for package-manager
engine dependencies and application dependencies. Inspection must include the
second document; its first importer alone is not an application dependency list.
Agent 5 independently checked all 31 declared application dependency/devDependency
specifiers against that application importer and found installed packages present.
Installed React 19.3.1, Vite 8.3.6 and Vitest 5.1.0 match locked resolutions.
Local Node 22.22.0 satisfies the declared engine.

## Production settings and evidence

No `.vercel/project.json` or authenticated Vercel management connection was
available. The project identity is user-confirmed, not verified against a remote
project ID, Git connection, current deployment SHA or configured build settings.
The new source settings make the intended next build reviewable without claiming
that the deployed project has already adopted them.

The lead's read-only production observations were:

| Request without cookies       | Response                      |
| ----------------------------- | ----------------------------- |
| `/api/auth/session`           | 401 JSON `unauthorized`       |
| `/api/dashboard/capabilities` | 404 platform text `NOT_FOUND` |

The current deployment therefore does not establish availability of the local
static dashboard route inventory. Local route tests cannot certify deployed
function packaging, OAuth operation, current environment scopes or gateway
reachability from Vercel.

The lead also observed authentication failures on all 18 probed gateway dashboard
read paths. Unlike the older reports' 404s, they now return 401, but neither status
establishes a successful authenticated contract. No successful live payload was
available, and no service credential was retrieved or exposed.

## Required environment values

| Variable                      | Required production setting                                                   |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `VITE_DATA_MODE`              | Public build setting `api`                                                    |
| `VITE_REFRESH_INTERVAL_MS`    | Optional public interval; default 30000 ms, minimum 10000 ms                  |
| `DASHBOARD_AUTH_URL`          | Server-only exact origin `https://zoho-armco-dashboard.vercel.app`            |
| `DASHBOARD_SESSION_SECRET`    | Server-only random signing secret of at least 32 bytes                        |
| `GOOGLE_CLIENT_ID`            | Server-only OAuth Web client identifier                                       |
| `GOOGLE_CLIENT_SECRET`        | Server-only matching OAuth secret                                             |
| `DASHBOARD_ALLOWED_USERS`     | Server-only approved email-to-admin/operator/viewer role map                  |
| `DASHBOARD_UPSTREAM_BASE_URL` | Server-only exact HTTPS origin `https://g11server.tailaff2e5.ts.net`          |
| `DASHBOARD_UPSTREAM_TOKEN`    | Server-only dedicated approved gateway credential, without a `Bearer ` prefix |
| `DASHBOARD_USER_IDS`          | Server-only approved email-to-internal-user-ID map for the existing G03 relay |

No required production value was read or changed. Only safe `.env.example`
placeholders were present locally. No server secret belongs in a `VITE_` value;
production rejects demo mode. Do not configure the development-only
`VITE_AUTH_MODE` on Vercel. Configure Google redirect URI
`https://zoho-armco-dashboard.vercel.app/api/auth/callback` for this origin.
Preview settings and redirect origins remain separate.

The existing relay maps verified local admin to middleware administrator,
operator to operations, and viewer to viewer. The internal-ID map grants no role.
Only administrator-confirmed G03 cancellation is relayed; fiscalization/writeback
mutations remain unavailable without an established operator contract. No live
device observation or cancellation was performed for deployment verification.

## Readiness decision

The repository deployment configuration is prepared for review. The parent
implementation report records the final combined type/lint/format/test/build
results. Full production signoff remains **not established** until authenticated
gateway payloads and missing operational contracts, Vercel project/environment
state, network reachability, hosted OAuth scenarios and browser viewport behavior
are verified. No successful HTTP status may substitute for payload validation.

The user expressly requires separate authorization before any GitHub push or
deployment. Those actions were not performed.

## Authorized deployment follow-up

The user subsequently authorized pushing and testing production. The push passed
all clean GitHub CI checks, but Vercel deployment
`dpl_9eAgh4P6eUw3e1JAXkmX8PMmfBME` failed with
`exceeded_serverless_functions_per_deployment` (Hobby maximum twelve).
Vercel account login then confirmed project ID
`prj_potkn87ChosvYHOwd2WvM4qzvEWz`, the expected repository and production
branch `main`. Required server configuration names are present in Production;
secret values were not printed or changed. Effective build Node is 22 despite
the project's older Node 26 setting, because package engines override it.

The packaging correction retains all public dashboard resource URLs using fixed
rewrites into one static `api/dashboard.ts` function. Existing static mappings
remain under `api/_dashboard/` as utility modules. Three auth functions and two
device functions remain, for six functions total. The adapter consumes one
allowlisted rewrite selector and leaves application queries strictly validated.
There is no dynamic dashboard catch-all, so the original injected-parameter
overview failure is not restored.

Vercel documents underscore-prefixed utility exclusion in its
[advanced function configuration](https://vercel.com/docs/functions/configuring-functions/advanced-configuration).
The deployment-configuration test now verifies the six-function inventory and
fixed resource rewrites in addition to API/SPA separation.

The final deployment outcome is recorded in the implementation report. A failed
attempt is not evidence that the new source reached the production alias.

Final outcome: commit `f7bdfd5` deployed successfully as
`dpl_AaAaYLRgmsPEJZhWzuP8aRRVyjGi`, READY with the expected production alias
and exactly six Node 22 functions. GitHub CI run `44250321667` passed. Public
page, protected API, utility exclusion and Google redirect checks passed within
their unsigned scope. The user signed in normally and confirmed Overview and
Invoices load data. Remaining operational contract gaps are explicitly separate
from deployment success in the implementation report.
