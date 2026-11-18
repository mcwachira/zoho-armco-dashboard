import { build } from 'vite'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { log } from 'node:console'
import { URLSearchParams } from 'node:url'

const { fetch } = globalThis

// Explicit read-only diagnostic. Credentials stay in this process; never log DTOs.
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
async function verify(resource) {
  let status = 200
  let payload
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
      fetch,
      env: { ...process.env, NODE_ENV: 'production' },
    },
  )
  results.push({
    resource: resource.split('?')[0],
    status,
    code: payload?.error?.code,
    contractValid: status === 200,
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
  if (typeof id === 'string')
    await verify('documents/' + singular + '?id=' + encodeURIComponent(id))
}
log(JSON.stringify({ results }, null, 2))
if (results.some((result) => !result.contractValid)) process.exitCode = 1
