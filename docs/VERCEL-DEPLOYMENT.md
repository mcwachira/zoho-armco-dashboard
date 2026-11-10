# GitHub-to-Vercel deployment

This deployment serves the Vite SPA from `dist/` and the protected dashboard/auth handlers as Vercel Functions from `api/`. Browser requests are same-origin. Vercel discovers functions from the root `api/` directory, and its filesystem routing precedes rewrites, so the SPA rewrite is a fallback. No CORS allowlist is needed for this same-origin design. See [Vercel Function configuration](https://vercel.com/docs/project-configuration/vercel-json).

## Before deployment

1. Create a GitHub repository and push this dashboard repository. This project does not require or include the middleware repository.
2. Create a Google OAuth Web application. Register the exact callback URL `https://<dashboard-origin>/api/auth/callback`.
3. Obtain a random `DASHBOARD_SESSION_SECRET` with at least 32 bytes. Configure only in Vercel; do not commit it.
4. Decide the exact allowed dashboard user emails and roles. Do not create credentials for users without authorization.
5. Leave the upstream unconfigured until a separate testing API has been verified as non-production, read-only, contract-compatible, and reachable from Vercel.

Generate a session secret locally with Node.js and paste the output directly into the Vercel server-only variable field:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64url'))"
```

## Vercel project settings

1. In Vercel choose **Add New → Project** and import the dashboard GitHub repository.
2. Set the project root directory to the repository root.
3. Framework preset: **Vite**.
4. Install command: `pnpm install --frozen-lockfile`.
5. Build command: `pnpm run build`.
6. Output directory: `dist`.
7. Use Node.js 22. Do not override the API Functions directory; Vercel discovers `api/` automatically.
8. Set environment variables below separately for Production and Preview as needed. Use an exact origin for each auth environment. If previews are not approved for OAuth, leave Preview auth unset; it will fail closed.
9. After setting the variables, trigger a deployment from the connected branch. This documentation does not create a project or deploy it.

## Environment variables

| Name                          | Scope           | Required                      | Purpose                                                                                                                        | Safe example                                                 | Vercel environments                                       | Sensitive                                   |
| ----------------------------- | --------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------- |
| `VITE_DATA_MODE`              | Public frontend | Yes                           | Selects the dashboard API adapter in production. Must be `api`; production rejects `mock`.                                     | `api`                                                        | Production; Preview only when protected API is configured | No                                          |
| `VITE_REFRESH_INTERVAL_MS`    | Public frontend | No                            | Poll interval, clamped to at least 10 seconds. Defaults to 30000.                                                              | `30000`                                                      | Production/Preview                                        | No                                          |
| `DASHBOARD_AUTH_URL`          | Server-only     | Yes                           | Exact HTTPS origin for OAuth redirect and same-origin validation.                                                              | `https://dashboard.example.com`                              | Each enabled origin/environment                           | No                                          |
| `DASHBOARD_SESSION_SECRET`    | Server-only     | Yes                           | HMAC session and OAuth state signing key, at least 32 bytes. Use a random value.                                               | `<generate-random-32+-byte-secret>`                          | Production/Preview, unique per environment                | Yes                                         |
| `GOOGLE_CLIENT_ID`            | Server-only     | Yes                           | Google OAuth Web client identifier.                                                                                            | `<google-oauth-client-id>`                                   | Environments with login enabled                           | No (still keep server-side)                 |
| `GOOGLE_CLIENT_SECRET`        | Server-only     | Yes                           | Google OAuth code-exchange secret.                                                                                             | `<google-oauth-client-secret>`                               | Environments with login enabled                           | Yes                                         |
| `DASHBOARD_ALLOWED_USERS`     | Server-only     | Yes                           | JSON email-to-role allowlist. Roles: `admin`, `operator`, `viewer`. All roles remain read-only.                                | `{"ops@example.com":"admin","analyst@example.com":"viewer"}` | Production/Preview as appropriate                         | Contains personal data; treat as restricted |
| `DASHBOARD_DATA_MODE`         | Server-only     | Yes                           | `unconfigured` disables upstream access; `testing-api` opts into the verified independent test service.                        | `unconfigured`                                               | Production/Preview                                        | No                                          |
| `DASHBOARD_UPSTREAM_BASE_URL` | Server-only     | Required only for testing API | HTTPS origin of the independent testing API that implements the dashboard DTO contract. The current Zoho hostname is rejected. | `https://<verified-testing-api-host>`                        | Only when API mode is approved                            | Usually no                                  |
| `DASHBOARD_UPSTREAM_TOKEN`    | Server-only     | No                            | Bearer token only if the verified testing API requires it.                                                                     | `<testing-api-token>`                                        | Only when required                                        | Yes                                         |

Do not add any of these server-only values with a `VITE_` prefix. Never configure Zoho OAuth tokens, database credentials or G03 credentials here; the dashboard gateway does not use them. `VITE_AUTH_MODE` is local development-only and should not be configured in Vercel.

### Current safe deployment configuration

There is currently no verified independent testing API. Set `DASHBOARD_DATA_MODE=unconfigured` and leave both upstream variables empty. Authentication can work when its Google/provider variables are configured; protected data routes then return `503 UPSTREAM_UNCONFIGURED` with no fake data. Do not set the upstream to `https://g11server.tailaff2e5.ts.net` or to the live middleware.

The Vercel Function does not establish Tailscale membership. A tailnet-only API is not reachable by assumption. Verify the actual network path from Vercel before enabling an upstream; do not expose production middleware to solve reachability.

## Post-deployment checks

- Open `/login`, complete Google sign-in with an allowlisted account, and confirm `/api/auth/session` reports the expected role.
- Confirm an unallowlisted Google account receives 403 and an unsigned session receives 401.
- Confirm dashboard data routes are protected and show an explicit unavailable message until a verified testing API is configured.
- Confirm `/api/dashboard/invoices` returns JSON (or a safe API error), never the SPA's `index.html`.
- Confirm the browser network panel uses only the dashboard origin for `/api/*` and does not contact middleware, gateway, Zoho, PostgreSQL or G03 hosts.
- Review `dist` and Vercel environment scopes for secrets before enabling production access.
