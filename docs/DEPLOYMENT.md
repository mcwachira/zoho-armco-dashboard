# Deployment overview

The project is a Vite SPA plus server-side Vercel Functions in `api/`. No part of the dashboard is hosted on the Windows middleware server. The browser calls only same-origin `/api` routes; Vercel Functions own authentication and authenticated middleware gateway access.

For exact repository import, build settings, environment variables and Google OAuth callback setup, follow [Vercel deployment](VERCEL-DEPLOYMENT.md). This repository is not deployed and does not connect to an upstream by default.

Before a separately authorized production deployment, verify the gateway's four GET routes and dedicated service credential against the desktop middleware on port 3004. See [current integration](API-INTEGRATION.md). No production configuration, services or fiscalization behavior are changed by local implementation.
