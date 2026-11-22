import { afterEach, expect, it, vi } from 'vitest'
import { build } from 'vite'
import { fileURLToPath } from 'node:url'

afterEach(() => vi.unstubAllEnvs())

it('keeps server credentials and API modules out of the actual production browser bundle', async () => {
  // Dummy values only; no production credential is retrieved or inspected.
  const canaries = {
    DASHBOARD_UPSTREAM_BASE_URL: 'https://bundle-canary-gateway.example.invalid',
    DASHBOARD_UPSTREAM_TOKEN: 'bundle-canary-service-bearer-123456',
    DASHBOARD_WRITEBACK_SERVICE_BEARER_TOKEN: 'bundle-canary-writeback-service-bearer-123456',
    DASHBOARD_SERVICE_BEARER_TOKEN: 'bundle-canary-middleware-bearer-123456',
    DASHBOARD_SESSION_SECRET: 'bundle-canary-session-signing-secret-123456',
    GOOGLE_CLIENT_SECRET: 'bundle-canary-google-secret-123456',
    DASHBOARD_ALLOWED_USERS: '{"bundle-canary-user@example.invalid":"admin"}',
    DASHBOARD_USER_IDS: '{"bundle-canary-user@example.invalid":"bundle-canary-internal-user-id"}',
  }
  for (const [name, value] of Object.entries(canaries)) vi.stubEnv(name, value)
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('VITE_DATA_MODE', 'api')
  // A production bundle must also ignore the development mock auth switch.
  vi.stubEnv('VITE_AUTH_MODE', 'development-mock')
  const result = await build({
    configLoader: 'native',
    logLevel: 'silent',
    build: { write: false, watch: null },
  })
  const builds = Array.isArray(result) ? result : [result]
  const serverRoot = fileURLToPath(new URL('../', import.meta.url)).replaceAll('\\', '/')
  let checked = 0
  for (const output of builds) {
    if (!('output' in output)) throw new Error('Expected a completed browser build')
    for (const asset of output.output) {
      const text =
        asset.type === 'chunk'
          ? asset.code
          : typeof asset.source === 'string'
            ? asset.source
            : new TextDecoder().decode(asset.source)
      for (const [name, value] of Object.entries(canaries)) {
        expect(text.includes(value), `Server canary ${name} leaked into ${asset.fileName}`).toBe(
          false,
        )
        expect(text.includes(name), `Server setting ${name} leaked into ${asset.fileName}`).toBe(
          false,
        )
      }
      expect(text).not.toContain('g11server.tailaff2e5.ts.net')
      expect(text).not.toContain('alex@zohoamarco.local')
      if (asset.type === 'chunk') {
        const serverModules = Object.keys(asset.modules).filter((id) =>
          id.replaceAll('\\', '/').startsWith(serverRoot),
        )
        expect(serverModules, 'Server-only modules entered the browser import graph').toEqual([])
      }
      checked += 1
    }
  }
  expect(checked).toBeGreaterThan(0)
}, 120_000)
