# Development

1. Install Node.js 22.12+ and pnpm 12.16.1.
2. Run `pnpm install` from the dashboard directory.
3. Copy `.env.example` to `.env.local`.
4. Keep `VITE_DATA_MODE=mock` for local isolated development.
5. Run `pnpm dev` and use the local URL reported by Vite.

Scripts: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm format`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, and `pnpm preview`.

The package scripts select Vite's Node native config loader so they also work in restricted Windows runners:

```powershell
pnpm run test -- --configLoader native --pool=threads --maxWorkers=1 --no-file-parallelism
pnpm run build -- --configLoader native
```

The project CI uses Node 22. The native loader avoids Vite's child-process config bundling path in restricted runners.

Mock sample data is visibly labeled `DEMO` and `MOCK DATA`. Do not use it for accounting or fiscal reconciliation. The browser HTTP adapter and production auth endpoints are disabled during Vite development, even if someone sets `VITE_DATA_MODE=api`. Only the local fixture adapter and explicit development mock identity may serve the dashboard in Vite. A forbidden-fetch test guards this boundary. The API client is same-origin and intended for the Vercel deployment.

## Restricted workspace install recovery

The development sandbox may force npm offline mode and proxy requests to an unavailable local proxy. It may also deny pnpm access to the per-user Windows store operation lock under `%LOCALAPPDATA%`. In this project, registry access was restored by clearing those proxy settings for the current PowerShell process and relocating pnpm's profile/store inside this workspace:

```powershell
New-Item -ItemType Directory -Force .pnpm-local-profile | Out-Null
$pnpmProfile = (Resolve-Path .pnpm-local-profile).Path
$env:USERPROFILE = $pnpmProfile
$env:LOCALAPPDATA = Join-Path $pnpmProfile 'AppData\Local'
$env:APPDATA = Join-Path $pnpmProfile 'AppData\Roaming'
$env:NPM_CONFIG_OFFLINE = 'false'
$env:HTTP_PROXY = ''
$env:HTTPS_PROXY = ''
$env:ALL_PROXY = ''
pnpm install --frozen-lockfile --store-dir .pnpm-store
```

This workaround is specific to the restricted agent environment. On an ordinary development PC, use the normal `pnpm install` command and configured registry.
