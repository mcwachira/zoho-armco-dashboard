import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gatewayReadPaths, probeGateway } from './probe-public-gateway.mjs'

test('requires a server credential and refuses other origins without making requests', async () => {
  let requests = 0
  const fetchImpl = async () => {
    requests += 1
    throw new Error('must not run')
  }
  await assert.rejects(probeGateway({ env: {}, fetchImpl }))
  await assert.rejects(
    probeGateway({
      env: { DASHBOARD_UPSTREAM_BASE_URL: 'https://other.invalid' },
      fetchImpl,
      unauthenticated: true,
    }),
  )
  await assert.rejects(
    probeGateway({
      env: { DASHBOARD_UPSTREAM_BASE_URL: 'https://g11server.tailaff2e5.ts.net/api/dashboard' },
      fetchImpl,
      unauthenticated: true,
    }),
  )
  assert.equal(requests, 0)
})

test('unsigned mode never forwards a configured token and never logs response data', async () => {
  const calls = []
  const report = await probeGateway({
    env: { DASHBOARD_UPSTREAM_TOKEN: 'fixture-secret-never-emit' },
    unauthenticated: true,
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      return new globalThis.Response(
        '{"customer":"private-fixture", "token":"fixture-secret-never-emit"}',
        { status: 401 },
      )
    },
  })
  assert.equal(calls.length, 11)
  assert.deepEqual(
    calls.map(({ url }) => url.pathname),
    gatewayReadPaths,
  )
  assert.ok(
    calls.every(
      ({ options }) =>
        options.method === 'GET' && options.redirect === 'error' && !options.headers.Authorization,
    ),
  )
  const params = calls[0].url.searchParams
  assert.ok(params.get('createdFrom').endsWith('Z') && params.get('createdTo').endsWith('Z'))
  assert.ok(!params.has('from') && !params.has('to'))
  assert.equal(report.responseMappingsVerified, false)
  assert.equal(JSON.stringify(report).includes('private-fixture'), false)
  assert.equal(JSON.stringify(report).includes('fixture-secret'), false)
})

test('authenticated requests keep bearer in headers only and sanitize transport errors', async () => {
  const token = 'fixture-service-secret'
  const report = await probeGateway({
    env: { DASHBOARD_UPSTREAM_TOKEN: token },
    fetchImpl: async (url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer ' + token)
      assert.equal(url.href.includes(token), false)
      throw new Error(token + ' private stack')
    },
  })
  assert.ok(
    report.results.every((result) => result.status === null && result.error === 'TRANSPORT_FAILED'),
  )
  assert.equal(JSON.stringify(report).includes(token), false)
})

test('namespace comparison uses only fixed historical and canonical GET paths', async () => {
  const report = await probeGateway({
    env: {},
    unauthenticated: true,
    compareNamespaces: true,
    fetchImpl: async (url, options) => {
      assert.equal(options.method, 'GET')
      if (url.pathname.endsWith('/overview')) assert.ok(url.searchParams.has('createdFrom'))
      return new globalThis.Response(null, {
        status: url.pathname.startsWith('/api/dashboard/') ? 401 : 404,
      })
    },
  })
  assert.equal(report.results.length, 22)
  assert.deepEqual(
    report.results.slice(11).map(({ path }) => path),
    gatewayReadPaths.map((path) => '/api/dashboard' + path),
  )
  assert.equal(report.responseMappingsVerified, false)
})
