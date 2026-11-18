# Deployment overview

The project is a Vite SPA plus server-side Vercel Functions in `api/`. No part of the dashboard is hosted on the Windows middleware server. The browser calls only same-origin `/api` routes; Vercel Functions own authentication and authenticated middleware gateway access.

For exact repository import, build settings, environment variables and Google OAuth callback setup, follow [Vercel deployment](VERCEL-DEPLOYMENT.md). This repository is not deployed and does not connect to an upstream by default.

The separate server investigation confirms the four gateway GET paths and bearer forwarding to middleware at `127.0.0.1:3001`. Before any separately authorized deployment, verify external reachability from Vercel and the four actual response DTOs. Legacy opt-in desktop tests on port 3004 are a separate test facility, not the production target. See [current integration](API-INTEGRATION.md). No production configuration, services or fiscalization behavior are changed by local implementation.
