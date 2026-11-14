# GitHub-to-Vercel deployment

This deployment serves the Vite SPA from `dist/` and the protected dashboard/auth handlers as Vercel Functions from `api/`. Browser requests are same-origin. Vercel discovers functions from the root `api/` directory, and its filesystem routing precedes rewrites, so the SPA rewrite is a fallback. No CORS allowlist is needed for this same-origin design. See [Vercel Function configuration](https://vercel.com/docs/project-configuration/vercel-json).

## Before deployment

1. Create a GitHub repository and push this dashboard repository. This project does not require or include the middleware repository.
2. Create a Google OAuth Web application. Register the exact callback URL `https://<dashboard-origin>/api/auth/callback`.
3. Obtain a random `DASHBOARD_SESSION_SECRET` with at least 32 bytes. Configure only in Vercel; do not commit it.
4. Decide the exact allowed dashboard user emails and roles. Do not create credentials for users without authorization.
5. Verify the dedicated dashboard credential and four GET resources against desktop middleware on port 3004. Production configuration/deployment requires separate authorization.

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

| Name                          | Scope           | Required     | Purpose                                                                                         | Safe example                                                 | Vercel environments                                       | Sensitive                                   |
| ----------------------------- | --------------- | ------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------- |
| `VITE_DATA_MODE`              | Public frontend | Yes          | Selects the dashboard API adapter in production. Must be `api`; production rejects `mock`.      | `api`                                                        | Production; Preview only when protected API is configured | No                                          |
| `VITE_REFRESH_INTERVAL_MS`    | Public frontend | No           | Poll interval, clamped to at least 10 seconds. Defaults to 30000.                               | `30000`                                                      | Production/Preview                                        | No                                          |
| `DASHBOARD_AUTH_URL`          | Server-only     | Yes          | Exact HTTPS origin for OAuth redirect and same-origin validation.                               | `https://dashboard.example.com`                              | Each enabled origin/environment                           | No                                          |
| `DASHBOARD_SESSION_SECRET`    | Server-only     | Yes          | HMAC session and OAuth state signing key, at least 32 bytes. Use a random value.                | `<generate-random-32+-byte-secret>`                          | Production/Preview, unique per environment                | Yes                                         |
| `GOOGLE_CLIENT_ID`            | Server-only     | Yes          | Google OAuth Web client identifier.                                                             | `<google-oauth-client-id>`                                   | Environments with login enabled                           | No (still keep server-side)                 |
| `GOOGLE_CLIENT_SECRET`        | Server-only     | Yes          | Google OAuth code-exchange secret.                                                              | `<google-oauth-client-secret>`                               | Environments with login enabled                           | Yes                                         |
| `DASHBOARD_ALLOWED_USERS`     | Server-only     | Yes          | JSON email-to-role allowlist. Roles: `admin`, `operator`, `viewer`. All roles remain read-only. | `{"ops@example.com":"admin","analyst@example.com":"viewer"}` | Production/Preview as appropriate                         | Contains personal data; treat as restricted |
| `DASHBOARD_UPSTREAM_BASE_URL` | Server-only     | Yes for data | Exact HTTPS public gateway origin.                                                              | `https://g11server.tailaff2e5.ts.net`                        | Authorized Production/Preview                             | No                                          |
| `DASHBOARD_UPSTREAM_TOKEN`    | Server-only     | Yes for data | Dedicated dashboard read service credential.                                                    | `<dashboard-service-credential>`                             | Authorized Production/Preview                             | Yes                                         |

Do not add any of these server-only values with a `VITE_` prefix. Never configure Zoho OAuth tokens, database credentials or G03 credentials here; the dashboard gateway does not use them. `VITE_AUTH_MODE` is local development-only and should not be configured in Vercel.

## Diagnosing `503 authentication_unavailable`

This response is emitted by the auth handler when configuration validation fails, before session lookup. It is distinct from a Vercel `FUNCTION_INVOCATION_FAILED` response and from dashboard data's expected `503 UPSTREAM_UNCONFIGURED` response. The public body remains the stable JSON code `{"error":"authentication_unavailable"}`. Vercel Runtime Logs include `[dashboard-auth] Invalid server configuration` and the names of invalid settings only; secret values are never logged.

Check the settings for the deployment environment that produced the request:

- [ ] `DASHBOARD_AUTH_URL` is the exact HTTPS origin, with no path, query, fragment, or trailing slash.
- [ ] `DASHBOARD_SESSION_SECRET` is at least 32 bytes.
- [ ] `GOOGLE_CLIENT_ID` is the Google OAuth Web client ID.
- [ ] `GOOGLE_CLIENT_SECRET` is present for that same Web client.
- [ ] `DASHBOARD_ALLOWED_USERS` is a nonempty JSON object mapping approved email addresses to `admin`, `operator`, or `viewer`.
- [ ] These values are configured in Vercel's **Production** scope for Production deployments and in **Preview** for Preview deployments. Vercel does not copy a Production-scoped value into Preview. If Preview OAuth is not enabled, Preview may intentionally remain unconfigured and return 503.
- [ ] None of these server-only values use a `VITE_` prefix.
- [ ] Google Cloud OAuth uses application type **Web application** and has the exact authorized redirect URI `https://<dashboard-origin>/api/auth/callback` for each origin enabled for login. The origin in `DASHBOARD_AUTH_URL` must match that deployment.

After correcting a setting, redeploy the affected environment. With valid auth configuration and no session cookie, `GET /api/auth/session` should return JSON `401`; a valid session returns JSON `200`. `GET /api/auth/login` should redirect to `accounts.google.com`. The session route returns 503 while any required setting is missing or invalid; do not treat that as a signed-out session.

### Current safe deployment configuration

The server accepts the production gateway origin and requires a dedicated read credential. Missing upstream settings return `503 UPSTREAM_UNCONFIGURED`; no testing-only mode is required. Do not change production settings until the gateway and middleware authenticate the four GET routes, desktop verification passes, and deployment is separately authorized. Existing Google/session settings remain unchanged.

The Vercel Function does not establish Tailscale membership. A tailnet-only API is not reachable by assumption. Verify the actual network path from Vercel before enabling an upstream; do not expose production middleware to solve reachability.

## Post-deployment checks

- Open `/login`, complete Google sign-in with an allowlisted account, and confirm `/api/auth/session` reports the expected role.
- Confirm an unallowlisted Google account receives 403 and an unsigned session receives 401.
- Confirm the four dashboard data routes are protected and use the dedicated upstream credential; unsupported collections send no browser requests.
- Confirm `/api/dashboard/invoices` returns JSON (or a safe API error), never the SPA's `index.html`.
- Confirm the browser network panel uses only the dashboard origin for `/api/*` and does not contact middleware, gateway, Zoho, PostgreSQL or G03 hosts.
- Review `dist` and Vercel environment scopes for secrets before enabling production access.
