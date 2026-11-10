# Vercel response security headers

`vercel.json` applies a restrictive Content Security Policy and standard browser security headers. `connect-src 'self'` matches the same-origin API design; server-side Vercel Functions contact Google OIDC and any configured test API, so the browser CSP need not allow those hosts. Google sign-in is a top-level redirect, not a popup.

The API/auth handlers additionally set `Cache-Control: no-store` for session and operational data responses. Same-origin browser calls avoid credentialed CORS and third-party cookie requirements. The Vercel SPA rewrite is configured as a fallback; API functions must retain precedence for `/api/*` and should be checked in Preview before enabling production.
