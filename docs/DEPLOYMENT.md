# Deployment overview

The project is a Vite SPA plus server-side Vercel Functions in `api/`. No part of the dashboard is hosted on the Windows middleware server. The browser calls only same-origin `/api` routes; Vercel Functions own authentication and any future test API access.

For exact repository import, build settings, environment variables and Google OAuth callback setup, follow [Vercel deployment](VERCEL-DEPLOYMENT.md). This repository is not deployed and does not connect to an upstream by default.

Before production data is enabled, a separately hosted testing API must be verified as non-production, read-only, reachable from Vercel and compatible with the documented dashboard DTOs. Do not use the existing Zoho gateway hostname or live middleware as a substitute. See [API contract audit](API-CONTRACT-AUDIT.md).
