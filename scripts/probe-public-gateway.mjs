import process from 'node:process'
import { log } from 'node:console'
import { pathToFileURL, URL, URLSearchParams } from 'node:url'

const origin = 'https://g11server.tailaff2e5.ts.net'
export const gatewayReadPaths = [
  '/overview',
  '/invoices',
  '/credit-notes',
  '/documents/invoices',
  '/documents/credit-notes',
  '/writebacks',
  '/reconciliation',
  '/events',
  '/operations',
  '/services',
  '/device',
]

export async function probeGateway({
  env = process.env,
  fetchImpl = globalThis.fetch,
  unauthenticated = false,
  compareNamespaces = false,
} = {}) {
  const base = new URL(env.DASHBOARD_UPSTREAM_BASE_URL || origin)
  if (
    base.origin !== origin ||
    base.pathname !== '/' ||
    base.search ||
    base.hash ||
    base.username ||
    base.password
  )
    throw new Error('Use the confirmed Public Gateway HTTPS origin without a path or credentials.')
  const token = unauthenticated ? undefined : env.DASHBOARD_UPSTREAM_TOKEN
  if (!unauthenticated && (!token || !/^[A-Za-z0-9._~+/-]+=*$/.test(token)))
    throw new Error(
      'Configure the approved server-only gateway bearer; never pass it as an argument.',
    )
  const now = new Date()
  const dates = new URLSearchParams({
    createdFrom: new Date(now.getTime() - 86_400_000).toISOString(),
    createdTo: now.toISOString(),
  })
  const results = []
  const paths = compareNamespaces
    ? [...gatewayReadPaths, ...gatewayReadPaths.map((path) => '/api/dashboard' + path)]
    : gatewayReadPaths
  for (let offset = 0; offset < paths.length; offset += 3) {
    results.push(
      ...(await Promise.all(
        paths.slice(offset, offset + 3).map(async (path) => {
          const url = new URL(path, base)
          const resource = path.replace(/^\/api\/dashboard/, '')
          if (resource === '/overview') url.search = dates.toString()
          else if (!['/services', '/device'].includes(resource)) url.search = 'page=1&pageSize=1'
          try {
            const response = await fetchImpl(url, {
              method: 'GET',
              redirect: 'error',
              cache: 'no-store',
              headers: {
                Accept: 'application/json',
                ...(token ? { Authorization: 'Bearer ' + token } : {}),
              },
              signal: globalThis.AbortSignal.timeout(8_000),
            })
            // Do not read or print live DTOs, identities, response messages or headers.
            await response.body?.cancel()
            return { path, status: response.status, contractValidated: false }
          } catch {
            // A fetch exception can contain a secret URL/header or internal diagnostic.
            return { path, status: null, error: 'TRANSPORT_FAILED', contractValidated: false }
          }
        }),
      )),
    )
  }
  return {
    scope: unauthenticated
      ? 'unsigned-authentication-boundary-only'
      : 'authenticated-gateway-status-only',
    hostedDashboardProxyVerified: false,
    responseMappingsVerified: false,
    results,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (
      process.argv
        .slice(2)
        .some((argument) => !['--unauthenticated', '--compare-namespaces'].includes(argument))
    )
      throw new Error(
        'Only fixed diagnostic flags are supported; routes and credentials are not CLI arguments.',
      )
    const report = await probeGateway({
      unauthenticated: process.argv.includes('--unauthenticated'),
      compareNamespaces: process.argv.includes('--compare-namespaces'),
    })
    log(JSON.stringify(report, null, 2))
    if (
      report.results.some(
        (result) =>
          result.status === null ||
          (report.scope === 'authenticated-gateway-status-only' && result.status !== 200),
      )
    )
      process.exitCode = 1
  } catch {
    log(
      JSON.stringify({
        error: 'GATEWAY_PROBE_CONFIGURATION_REQUIRED',
        responseMappingsVerified: false,
      }),
    )
    process.exitCode = 1
  }
}
