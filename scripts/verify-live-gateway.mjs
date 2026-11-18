import { build } from 'vite'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { log } from 'node:console'
import { URLSearchParams } from 'node:url'

const { fetch } = globalThis

// Explicit read-only diagnostic. Credentials stay in this process; never log DTOs.
// The local session is stubbed for this diagnostic only; Google sign-in and
// hosted Vercel connectivity must be verified separately with a normal session.
if (!process.env.DASHBOARD_UPSTREAM_BASE_URL || !process.env.DASHBOARD_UPSTREAM_TOKEN)
  throw new Error('The approved server gateway environment is required.')
const bundle = await build({
  configFile: false,
  logLevel: 'silent',
  ssr: { noExternal: ['zod'] },
  build: { ssr: 'api/_lib/dashboard-gateway.ts', write: false },
})
const chunk = bundle.output.find((item) => item.type === 'chunk' && item.isEntry)
const { handleDashboardRequest } = await import(
  'data:text/javascript;base64,' + Buffer.from(chunk.code).toString('base64')
)
const end = new Date()
const dates = new URLSearchParams({
  createdFrom: new Date(end.getTime() - 86_400_000).toISOString(),
  createdTo: end.toISOString(),
})
const results = []
async function verify(resource, expectation = 'upstream_contract') {
  let status = 200
  let payload
  let upstreamCalled = false
  const response = {
    setHeader() {
      return response
    },
    status(value) {
      status = value
      return response
    },
    json(value) {
      payload = value
    },
  }
  await handleDashboardRequest(
    { method: 'GET', url: '/api/dashboard/' + resource, headers: {} },
    response,
    {
      authorize: () => ({
        email: 'diagnostic@example.invalid',
        role: 'viewer',
        expiresAt: Date.now() + 60_000,
      }),
      fetch: (...args) => {
        upstreamCalled = true
        return fetch(...args)
      },
      env: { ...process.env, NODE_ENV: 'production' },
    },
  )
  results.push({
    resource: resource.split('?')[0],
    status,
    code: payload?.error?.code,
    upstreamStatus: payload?.error?.upstreamStatus,
    upstreamCalled,
    expectation,
    contractValid: status === 200,
    ...(status === 200 && Array.isArray(payload?.items)
      ? { recordCount: payload.items.length }
      : {}),
    ...(status === 200 && ['available', 'partial', 'unavailable'].includes(payload?.availability)
      ? { availability: payload.availability }
      : {}),
  })
  return status === 200 ? payload : undefined
}
await verify('overview?' + dates)
await verify('invoices?page=1&pageSize=1&' + dates)
await verify('credit-notes?page=1&pageSize=1&' + dates)
await verify('services')
for (const [kind, field, singular] of [
  ['invoices', 'invoice_id', 'invoice'],
  ['credit-notes', 'creditnote_id', 'credit-note'],
]) {
  const page = await verify('documents/' + kind + '?page=1&pageSize=1')
  const id = page?.items[0]?.[field]
  if (typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id))
    await verify('documents/' + singular + '?id=' + encodeURIComponent(id))
  else
    results.push({
      resource: 'documents/' + singular,
      expectation: 'upstream_contract',
      upstreamCalled: false,
      contractValid: false,
      outcome: 'not_tested_no_supported_source_id',
    })
}
for (const resource of [
  'capabilities',
  'device',
  'writebacks',
  'manual-review',
  'reconciliation',
  'events',
  'operations',
])
  await verify(resource, 'locally_blocked')
log(
  JSON.stringify(
    {
      scope: 'read_only_gateway_contract_diagnostic',
      hostedAuthenticationVerified: false,
      results,
    },
    null,
    2,
  ),
)
if (
  results.some((result) =>
    result.expectation === 'locally_blocked'
      ? result.upstreamCalled || result.code !== 'GATEWAY_ROUTE_UNAVAILABLE'
      : !result.contractValid,
  )
)
  process.exitCode = 1
