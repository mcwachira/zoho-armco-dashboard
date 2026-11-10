# Dashboard authentication

## Production boundary

Authentication is independent of Zoho OAuth. The Vercel Functions under `api/auth/` provide Google OpenID Connect login, callback, session inspection and logout. The dashboard gateway calls a shared server-side authorization check before any data request. The browser never supplies a role as authorization evidence.

The login flow uses OAuth state, nonce and PKCE. The server exchanges the authorization code, verifies the Google ID token signature against Google JWKS and validates issuer, audience, expiry, issue time, nonce and verified email. Only email addresses present in `DASHBOARD_ALLOWED_USERS` may receive a session. Roles are `admin`, `operator` and `viewer`; all roles are read-only. Changing/removing an allowlist entry blocks that role on the next API request.

Sessions are signed with HMAC-SHA256, held in an eight-hour `HttpOnly; Secure; SameSite=Lax; Path=/` host-only cookie. No browser storage contains a bearer token. Logout is same-origin POST and clears the cookie. The `__Host-` cookie prefix requires HTTPS, and the configured auth URL must be the exact public origin. Signing-secret rotation invalidates all active sessions.

The session is stateless: a copied cookie cannot be individually revoked and remains valid until its eight-hour expiry unless the signing secret is rotated. This is a documented operational limitation. Add a shared session store and revocation mechanism if immediate revocation becomes a requirement. Login rate limiting is not implemented in process because Vercel Functions are horizontally scaled; configure platform-level rate limiting before broad public access.

## Required provider setup

Create a Google OAuth client for a Web application. Configure the authorized redirect URI exactly as:

`https://<dashboard-origin>/api/auth/callback`

Set the corresponding client ID and client secret only as server-side Vercel variables. Use one exact `DASHBOARD_AUTH_URL` per Vercel environment/origin. Google OAuth requires a valid consent screen and any required publishing/verification. Do not use a Zoho OAuth credential.

The local Vite development app uses a mock identity only when `VITE_AUTH_MODE=development-mock` and `import.meta.env.DEV` is true. Production code ignores that mock path. Local API transport is disabled; fixtures are the only local data mode.

## Fail-closed behavior

Missing or invalid authentication variables produce 503 from auth endpoints. Missing/expired/invalid sessions receive 401. A valid session that is not currently allowlisted or lacks a required role receives 403. Dashboard routes do not return protected data without a valid session. No auth configuration falls back to demo or anonymous access.
