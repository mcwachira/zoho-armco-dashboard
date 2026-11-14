import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

describe('same-origin dashboard API client safety boundary', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.stubEnv('DEV', false)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('does not issue requests in mock mode', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'mock')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { apiMode, ApiError, getJson } = await import('./client')

    expect(apiMode).toBe('mock')
    await expect(
      getJson('/not-a-real-route', z.object({ ok: z.boolean() })),
    ).rejects.toBeInstanceOf(ApiError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not allow a production build to use mock mode or contact the API as a fallback', async () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_DATA_MODE', 'mock')
    vi.stubEnv('VITE_API_BASE_URL', 'https://middleware.example.test')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { apiMode, getJson } = await import('./client')

    expect(apiMode).toBe('api')
    await expect(
      getJson('/api/dashboard/services', z.object({ ready: z.boolean() })),
    ).rejects.toMatchObject({
      kind: 'configuration',
      message: 'Mock data mode is disabled in production. Configure VITE_DATA_MODE=api.',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not issue a request when its signal was already cancelled', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api')
    vi.stubEnv('VITE_API_BASE_URL', 'https://middleware.example.test')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { getJson } = await import('./client')
    const controller = new AbortController()
    controller.abort()

    await expect(
      getJson('/api/dashboard/services', z.object({ ready: z.boolean() }), controller.signal),
    ).rejects.toMatchObject({ kind: 'cancelled' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('validates parsed responses against the caller supplied Zod schema', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api')
    vi.stubEnv('VITE_API_BASE_URL', 'https://middleware.example.test')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ready: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const { getJson } = await import('./client')

    await expect(
      getJson('/api/dashboard/services', z.object({ ready: z.boolean() })),
    ).resolves.toEqual({
      ready: true,
    })
    expect(fetch).toHaveBeenCalledWith(
      '/api/dashboard/services',
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    )
  })

  it('normalizes non-success HTTP responses without parsing their bodies', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api')
    vi.stubEnv('VITE_API_BASE_URL', 'https://middleware.example.test')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('private server detail', { status: 503 })),
    )
    const { getJson } = await import('./client')

    await expect(
      getJson('/api/dashboard/services', z.object({ ready: z.boolean() })),
    ).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Dashboard gateway returned HTTP 503.',
      status: 503,
    })
  })

  it('signals a 401 so the Better Auth session can be refreshed and expired data cleared', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api')
    vi.stubEnv('VITE_API_BASE_URL', 'https://middleware.example.test')
    const browserEvents = new EventTarget()
    vi.stubGlobal('window', browserEvents)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
    const unauthorized = vi.fn()
    browserEvents.addEventListener('zoho-auth-unauthorized', unauthorized)
    const { getJson } = await import('./client')

    await expect(
      getJson('/api/dashboard/invoices', z.object({ ok: z.boolean() })),
    ).rejects.toMatchObject({
      kind: 'unauthorized',
      status: 401,
    })
    expect(unauthorized).toHaveBeenCalledOnce()
  })

  it('normalizes malformed response payloads without leaking payload content', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api')
    vi.stubEnv('VITE_API_BASE_URL', 'https://middleware.example.test')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ secret: 'must-not-appear' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const { getJson } = await import('./client')

    await expect(
      getJson('/api/dashboard/services', z.object({ ready: z.boolean() })),
    ).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Middleware response did not match the verified contract.',
    })
  })

  it('normalizes invalid JSON as a contract error', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api')
    vi.stubEnv('VITE_API_BASE_URL', 'https://middleware.example.test')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>oops</html>', { status: 200 })),
    )
    const { getJson } = await import('./client')

    await expect(
      getJson('/api/dashboard/services', z.object({ ready: z.boolean() })),
    ).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Dashboard gateway response was not valid JSON.',
      kind: 'contract',
    })
  })

  it('retains safe gateway messages, error codes and request IDs', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'DASHBOARD_AUTH_DISABLED',
              message: 'Middleware dashboard authentication is disabled.',
              requestId: 'middleware-123',
            },
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    const { getJson } = await import('./client')
    await expect(
      getJson('/api/dashboard/services', z.object({ ready: z.boolean() })),
    ).rejects.toMatchObject({
      status: 503,
      code: 'DASHBOARD_AUTH_DISABLED',
      requestId: 'middleware-123',
      message:
        'Middleware dashboard authentication is disabled. [DASHBOARD_AUTH_DISABLED] Request ID: middleware-123',
    })
  })

  it.each([
    'manual-review',
    'capabilities',
    'device',
    'reconciliation',
    'writebacks',
    'invoices/123',
  ])('never fetches unsupported resource %s', async (resource) => {
    vi.stubEnv('VITE_DATA_MODE', 'api')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { getJson } = await import('./client')
    await expect(getJson(`/api/dashboard/${resource}`, z.unknown())).rejects.toMatchObject({
      kind: 'disabled',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
