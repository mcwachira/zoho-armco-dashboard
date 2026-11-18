# Dashboard authentication review

For the current read-only proxy scope and verification, see the
[secure BFF report](SECURE-BFF-REPORT.md). The operator-session discussion below is
historical: fiscalization/writeback action handlers have now been removed.

Reviewed locally on 2026-11-15. No production authentication configuration, deployment, middleware source, or device operations were changed.

## Existing controls retained

- Dashboard Google OIDC uses state, nonce, PKCE, Google RSA signature verification, audience/issuer/expiry checks, verified email, and an explicit server-side email/role allowlist.
- The dashboard session is HMAC signed, expires after eight hours, and is stored in a host-only `__Host-dashboard_session` cookie with `Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/`. OAuth state uses a separate short-lived protected cookie.
- Every protected API request validates the signature, expiry, current allowlist membership, and current role. Removing an allowlist entry or changing its role rejects an existing cookie.
- Logout requires a same-origin POST. It clears both protected cookies with `Max-Age=0` and returns HTTP 204 with `Cache-Control: no-store`. Client logout accepts only that response, clears the query cache, and broadcasts a logout marker to other tabs. Failed logout keeps the session visible so the interface does not falsely claim server logout succeeded.
- The static application shell contains no operational data. Protected page components require an active validated session; server-side handlers independently require authentication.
- Receipt links use validated HTTP(S) URLs without embedded credentials. React escapes text; the reviewed source contains no raw HTML injection.

## Improvements in this implementation

Session cookies are revalidated when a tab regains focus, becomes visible, or returns from the browser back/forward cache. This covers missed cross-tab storage notifications and changes made while the tab was backgrounded. Each validation supersedes previous requests so a delayed successful JSON body cannot restore a session after a newer unauthorized response. Session rejection and expiry clear cached operational data.

The existing session is stateless. Browser logout deletes the cookie; it does not implement a shared persistent revocation list for copied cookie values across server instances. No new persistence or misleading process-local revocation mechanism was introduced.

## Middleware operator authorization gap

The authoritative local contract requires a middleware **Better Auth session** with `dashboard:operate` for each of the three operational POST routes. The dashboard currently has its own Google OIDC/HMAC session. These credentials are distinct. The contract does not document a session exchange/bootstrap endpoint, accepted cookie name, forwarding protocol, or other way to establish that upstream operator session from this dashboard.

The GET service bearer cannot fill that gap. Local operator/admin role checks are necessary but cannot establish upstream authorization. Production POST forwarding must fail closed until a documented operator-session integration exists. Do not forward the custom dashboard cookie as if it were a Better Auth session or substitute the service bearer.

## Verification

- `node_modules/.bin/vitest.cmd run src/lib/auth/AuthProvider.test.tsx api/_lib/auth.test.ts --configLoader native`: 2 files passed, 40 tests passed.
- Tests cover protected cookies, signed/expired/tampered sessions, allowlist and role changes, unauthorized API access, same-origin logout, cookie deletion, cache clearing, failed logout, expiry, cross-tab notifications, page restore/focus revalidation, and stale-response rejection.
- No production API or device request was used by these tests.

This is a source and automated-test review. It does not claim live Google sign-in, browser accessibility, or production gateway session integration was verified.
