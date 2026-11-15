# Dashboard Authentication Boundary

This is a disabled-by-default Better Auth integration for the monitoring dashboard only. It is not used by and does not gate the existing public Zoho Books invoice/credit-note submission routes under `/integrations/zoho`.

The middleware uses the supported Better Auth Express 5 `toNodeHandler` integration at `/api/auth/*splat`. It is mounted before `express.json()` as required by Better Auth. The exact-origin CORS layer is limited to `/api/auth` and `/api/dashboard`; it never changes the Zoho Books route contract.

## Runtime behavior

- `DASHBOARD_AUTH_ENABLED` defaults to `false`. With it disabled, the authentication handler returns HTTP 503 `DASHBOARD_AUTH_DISABLED`; the middleware makes no claim that a user is signed in.
- When enabled, Better Auth uses a separate `BETTER_AUTH_DATABASE_URL` connection and PostgreSQL `search_path=dashboard_auth`. It does not use Prisma or `DATABASE_URL`.
- A dashboard runtime role must be provisioned separately and given privileges only on the `dashboard_auth` schema. The startup validator rejects a reused fiscalization database identity.
- Google OAuth is the only configured provider and requests only the `openid`, `email`, and `profile` scopes. Google email verification is required, implicit account linking is disabled, and Better Auth encrypts any persisted Google OAuth token material in the isolated auth schema. These are Google identity tokens only; this schema is not a Zoho token store. `DASHBOARD_AUTH_USERS` is a server-side allowlist mapping normalized email addresses to `administrator`, `operations`, or `viewer`.
- New users receive their role from the server allowlist; Better Auth marks the stored `role` field `input: false`. Request authorization resolves the effective role from the allowlist on every request and ignores role data supplied by the browser or session payload.
- Session lookups disable cookie-cache reads and require a current server-side session row. Sessions expire after 12 hours and are refreshed hourly.
- When authenticated, mount `dashboardAuth.requireSession` before all `/api/dashboard` handlers. Use `requireDashboardPermission("dashboard:read")` for dashboard data and `requireDashboardPermission("dashboard:users:manage")` for any future user-administration route. This repository does not yet expose user/role administration.
- `administrator` has read, user-management and settings-management permissions. `operations` and `viewer` have read permission only. None has fiscalization, Zoho writeback, G03, queue-mutation or reconciliation-mutation permissions.

Better Auth validates trusted origins and protects its state-changing browser endpoints. Production cookies are Secure, HttpOnly, and SameSite Lax by default. The optional `none` setting is accepted only in production so cross-site deployments can use Secure cookies. CORS uses exact configured origins, credentials, and only GET/POST/OPTIONS. Browser deployments should use a same-origin or same-site HTTPS reverse proxy where possible; browser third-party-cookie restrictions can block cookies even when SameSite=None is configured.

The auth route also uses the middleware's existing process-local fixed-window rate limiter. Multi-process or horizontally scaled deployments must add a shared rate-limit store at the trusted reverse proxy; a process-local map is not a distributed rate limiter.

## Isolated auth schema

`auth-db/migrations/20261109090000_create_dashboard_auth_schema.sql` creates only the Better Auth tables in a separate `dashboard_auth` schema. It is deliberately outside `prisma/postgresql/migrations`, is not applied by the middleware, and has not been run. Do not run it against the fiscalization `DATABASE_URL` or any production database without separate approval.

For a disposable development database:

1. Provision a separate dashboard-auth migration role and a separate runtime role. Do not reuse the fiscalization role or its URL.
2. Apply the checked-in auth SQL only to the chosen disposable PostgreSQL database as the migration role.
3. Grant the runtime role `USAGE` on `dashboard_auth` and the minimum required `SELECT`, `INSERT`, `UPDATE`, and `DELETE` privileges on tables in that schema. Grant no fiscalization-schema access.
4. Set `BETTER_AUTH_DATABASE_URL` to the auth-only runtime role's connection URL. The application sets `search_path=dashboard_auth` on the connection.
5. Validate the schema and role grants before setting `DASHBOARD_AUTH_ENABLED=true`.

The auth SQL is additive and idempotent for tables/indexes. It is not part of Prisma's existing fiscalization migration history. No auth migration was applied during implementation. Provider token columns contain Better Auth encrypted Google OAuth token material when present; no Zoho Books credentials belong in this database.

## Environment

Required only when `DASHBOARD_AUTH_ENABLED=true`:

| Variable                          | Purpose                                                                                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_DATABASE_URL`        | Separate PostgreSQL runtime identity for the isolated auth schema.                                                         |
| `BETTER_AUTH_SECRET`              | Secret of at least 32 characters; generate a cryptographically random value and store it in the deployment secret manager. |
| `BETTER_AUTH_URL`                 | Auth API origin, for example `https://api.example.com`; production requires HTTPS and no path.                             |
| `GOOGLE_CLIENT_ID`                | Google OAuth web client ID; server-side only.                                                                              |
| `GOOGLE_CLIENT_SECRET`            | Google OAuth web client secret; server-side only.                                                                          |
| `DASHBOARD_AUTH_ORIGINS`          | Comma-separated exact dashboard origins, no paths or wildcard. HTTPS required in production.                               |
| `DASHBOARD_AUTH_USERS`            | Comma-separated `email:role` allowlist, e.g. `admin@example.com:administrator,ops@example.com:operations`.                 |
| `DASHBOARD_AUTH_COOKIE_SAME_SITE` | `lax` by default; `none` is allowed only for production HTTPS cross-site deployments.                                      |

These values are not placed in `VITE_` variables. Keep all client secrets and the auth database URL on the middleware server.

## Google OAuth setup

1. In Google Cloud Console, create or select a project and configure the OAuth consent screen for the intended users.
2. Create an OAuth client ID of type **Web application**.
3. Add the dashboard origin to **Authorized JavaScript origins** (for local work, typically `http://localhost:5173`).
4. Add this exact **Authorized redirect URI**: `${BETTER_AUTH_URL}/api/auth/callback/google`.
   - Local example: `http://localhost:3000/api/auth/callback/google`.
   - Production example: `https://api.example.com/api/auth/callback/google`.
5. Store the client ID and secret as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the middleware host. Do not commit either value or put it in a frontend variable.
6. Set `DASHBOARD_AUTH_ORIGINS` to the exact frontend origin. Set Better Auth's URL to the browser-visible API origin, including the public reverse proxy if one is used.
7. Test sign-in, sign-out, expired sessions, an allowlisted account, and a denied account in a disposable environment before any production enablement.

The source integration is implemented, but Google login is **not production-verified** until valid credentials, callback registration, isolated schema/role grants, HTTPS/proxy behavior, and a real end-to-end OAuth flow have been tested.

## Deployment boundary

The middleware currently binds to loopback by default and rejects non-loopback `HOST` settings. A remotely hosted dashboard therefore needs an approved HTTPS reverse proxy/private routing arrangement that forwards to the loopback service. Configure CORS to the final browser-visible dashboard origin and ensure proxy forwarding does not change the origin/callback unexpectedly. Do not expose this API publicly or enable it in production until the server-side dashboard data routes are mounted behind `dashboardAuth.requireSession` and authorize each request.

For Better Auth integration details, see the [official Express integration](https://better-auth.com/docs/integrations/express), [PostgreSQL adapter](https://better-auth.com/docs/adapters/postgresql), [Google provider](https://better-auth.com/docs/authentication/google), and [security reference](https://better-auth.com/docs/reference/security).
