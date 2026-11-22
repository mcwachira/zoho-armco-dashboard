import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const configuration = JSON.parse(
  readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'),
) as { rewrites: { source: string; destination: string }[] }

describe('production SPA fallback boundary', () => {
  const fallback = configuration.rewrites.find((rule) => rule.destination === '/index.html')

  function matches(pathname: string) {
    if (!fallback) throw new Error('A SPA fallback is required for direct navigation.')
    const source = /^\/:path\((.*)\)$/.exec(fallback.source)
    if (!source) throw new Error('Review fallback boundary tests when rewrite syntax changes.')
    return new RegExp(`^/${source[1]}$`).test(pathname)
  }

  it.each(['/', '/overview', '/invoices', '/credit-notes', '/health', '/apiary'])(
    'serves the SPA for browser navigation to %s',
    (pathname) => expect(matches(pathname)).toBe(true),
  )

  it.each([
    '/api',
    '/api/',
    '/api/auth/session',
    '/api/auth/callback',
    '/api/dashboard/overview',
    '/api/dashboard/documents/invoice',
    '/api/device/g03/current-receipt',
    '/api/device/g03/cancel-receipt',
    '/api/dashboard/writebacks/invoices/request-1',
    '/api/dashboard/writebacks/credit-notes/request-2',
    '/api/unknown-resource',
  ])('never returns SPA HTML for an API request to %s', (pathname) => {
    expect(matches(pathname)).toBe(false)
  })
})

it('packages at most twelve functions while retaining all fixed dashboard URLs', () => {
  function functions(directory: URL): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) return []
      if (entry.isDirectory()) return functions(new URL(entry.name + '/', directory))
      return entry.name.endsWith('.ts') ? [entry.name] : []
    })
  }
  expect(functions(new URL('../', import.meta.url))).toHaveLength(8)
  for (const resource of [
    'overview',
    'invoices',
    'credit-notes',
    'capabilities',
    'documents/invoice',
    'documents/credit-notes',
  ]) {
    expect(configuration.rewrites).toContainEqual({
      source: `/api/dashboard/${resource}`,
      destination: `/api/dashboard?dashboardResource=${encodeURIComponent(resource)}`,
    })
  }
})
