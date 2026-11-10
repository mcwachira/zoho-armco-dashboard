# Implementation and release checklist

## Implemented in this repository

- Standalone Vite/React/TypeScript application with existing dark monitoring views preserved.
- Same-origin `/api/dashboard/*` Vercel Function with GET-only allowlist, parameter validation, request timeout, bounded JSON parsing, response Zod validation and safe errors.
- Google OIDC auth handler with state, nonce, PKCE, ID-token signature/claim verification, email-to-role allowlist and signed host-only session cookies.
- Authorization is checked server-side before data is returned. Browser role values are never trusted.
- Local fixture adapter is development-only and visibly DEMO. API mode never falls back to fixtures.
- Vercel config, response headers, CI workflow, environment examples and deployment documentation.
- Contract comparison in [API-CONTRACT-AUDIT.md](API-CONTRACT-AUDIT.md).

## External dependencies that remain

- A separately hosted, non-production, read-only testing API has not been identified or verified. The gateway intentionally returns `503 UPSTREAM_UNCONFIGURED` until one is approved and configured.
- Google OAuth client credentials, Vercel origin, generated session secret and user/role allowlist must be supplied in Vercel.
- Vercel reachability to any tailnet-only host is unverified. Do not use the existing public Zoho host or production middleware.
- Stateless cookies cannot be individually revoked; they expire after eight hours. Login rate limiting must be configured at the hosting/platform edge before broad public access.

## Local validation

Run `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm test`, and `pnpm run build`. Tests use fixtures and mocked Google/upstream responses; they do not contact the live middleware, gateway, Zoho or G03.

## Production gate

Before enabling a test API, verify its host, network path, independent environment, auth, read-only allowlist and DTO contract. Then test Vercel function routing, login/logout/session lifecycle, 401/403 enforcement, error responses, data provenance and browser network destinations from a Preview deployment. Do not deploy until auth variables are correctly configured and security review accepts the stateless session and platform rate-limit plan.
