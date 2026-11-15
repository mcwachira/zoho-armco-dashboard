// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthProvider'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
  vi.useRealTimers()
})

function AuthState() {
  const auth = useAuth()
  return (
    <>
      <output>
        {auth.sessionState}|{auth.user?.email ?? 'no-user'}|{auth.error ?? 'no-error'}
      </output>
      <button onClick={() => void auth.logout().catch(() => undefined)}>Sign out</button>
    </>
  )
}

function renderAuth(response: Response) {
  vi.stubEnv('DEV', false)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthState />
      </AuthProvider>
    </QueryClientProvider>,
  )
}

describe('server authentication session handling', () => {
  it('keeps a 503 auth configuration response unavailable instead of signed out or active', async () => {
    renderAuth(
      new Response(JSON.stringify({ error: 'authentication_unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }),
    )

    expect(
      await screen.findByText(
        'unavailable|no-user|Authentication is not configured for this environment.',
      ),
    ).toBeInTheDocument()
  })

  it('rejects a successful HTML response instead of treating it as a session', async () => {
    renderAuth(
      new Response('<!doctype html><html></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    )

    expect(
      await screen.findByText(
        'unavailable|no-user|Dashboard authentication returned a non-JSON response.',
      ),
    ).toBeInTheDocument()
  })

  it('treats a JSON 401 as a signed-out session', async () => {
    renderAuth(
      new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }),
    )

    expect(await screen.findByText('signed-out|no-user|no-error')).toBeInTheDocument()
  })
})

function activeSession() {
  return new Response(
    JSON.stringify({
      user: { email: 'reader@example.test', role: 'viewer' },
      expiresAt: Date.now() + 60_000,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  )
}

it('invalidates the browser session and clears sensitive query caches after successful logout', async () => {
  vi.stubEnv('DEV', false)
  const fetchSpy = vi
    .fn()
    .mockResolvedValueOnce(activeSession())
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchSpy)
  const client = new QueryClient()
  client.setQueryData(['invoices'], [{ customer: 'Private customer' }])
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <AuthState />
      </AuthProvider>
    </QueryClientProvider>,
  )
  await screen.findByText('active|reader@example.test|no-error')
  fireEvent.click(screen.getByText('Sign out'))
  await screen.findByText('signed-out|no-user|no-error')
  expect(client.getQueryCache().getAll()).toHaveLength(0)
  expect(fetchSpy).toHaveBeenLastCalledWith('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
  })
})

it('preserves the active state when server logout fails', async () => {
  vi.stubEnv('DEV', false)
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(activeSession())
      .mockResolvedValueOnce(new Response(null, { status: 503 })),
  )
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <AuthState />
      </AuthProvider>
    </QueryClientProvider>,
  )
  await screen.findByText('active|reader@example.test|no-error')
  await act(async () => fireEvent.click(screen.getByText('Sign out')))
  expect(screen.getByText('active|reader@example.test|no-error')).toBeInTheDocument()
})

it('keeps the active session when a fallback page answers the logout request with HTTP 200', async () => {
  vi.stubEnv('DEV', false)
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(activeSession())
      .mockResolvedValueOnce(
        new Response('<html>Dashboard</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
  )
  const client = new QueryClient()
  client.setQueryData(['private'], 'sensitive')
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <AuthState />
      </AuthProvider>
    </QueryClientProvider>,
  )
  await screen.findByText('active|reader@example.test|no-error')
  await act(async () => fireEvent.click(screen.getByText('Sign out')))
  expect(screen.getByText('active|reader@example.test|no-error')).toBeInTheDocument()
  expect(client.getQueryData(['private'])).toBe('sensitive')
})

it.each([401, 503])(
  'clears cached records when session validation returns HTTP %i',
  async (status) => {
    vi.stubEnv('DEV', false)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })))
    const client = new QueryClient()
    client.setQueryData(['private'], 'sensitive')
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <AuthState />
        </AuthProvider>
      </QueryClientProvider>,
    )
    await screen.findByText(
      status === 401
        ? 'signed-out|no-user|no-error'
        : 'unavailable|no-user|Authentication is not configured for this environment.',
    )
    expect(client.getQueryCache().getAll()).toHaveLength(0)
  },
)

it('rejects roles outside the session contract and clears cached records', async () => {
  vi.stubEnv('DEV', false)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { email: 'reader@example.test', role: 'root' },
          expiresAt: Date.now() + 60_000,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    ),
  )
  const client = new QueryClient()
  client.setQueryData(['private'], 'sensitive')
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <AuthState />
      </AuthProvider>
    </QueryClientProvider>,
  )
  await screen.findByText(
    'unavailable|no-user|Dashboard authentication returned an invalid session.',
  )
  expect(client.getQueryCache().getAll()).toHaveLength(0)
})

it('expires the session and clears cached records at the server deadline', async () => {
  vi.stubEnv('DEV', false)
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(activeSession()))
  const client = new QueryClient()
  client.setQueryData(['private'], 'sensitive')
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <AuthState />
        </AuthProvider>
      </QueryClientProvider>,
    )
  })
  expect(screen.getByText('active|reader@example.test|no-error')).toBeInTheDocument()
  await act(async () => vi.advanceTimersByTimeAsync(60_001))
  expect(screen.getByText('expired|no-user|no-error')).toBeInTheDocument()
  expect(client.getQueryCache().getAll()).toHaveLength(0)
})

it('clears cached data across tabs and ignores a late session response after logout', async () => {
  vi.stubEnv('DEV', false)
  let resolveSession!: (response: Response) => void
  vi.stubGlobal(
    'fetch',
    vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveSession = resolve
      }),
    ),
  )
  const client = new QueryClient()
  client.setQueryData(['private'], 'sensitive')
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <AuthState />
      </AuthProvider>
    </QueryClientProvider>,
  )
  act(() =>
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'zoho-dashboard-logout', newValue: 'logout-marker' }),
    ),
  )
  expect(screen.getByText('signed-out|no-user|no-error')).toBeInTheDocument()
  expect(client.getQueryCache().getAll()).toHaveLength(0)
  await act(async () => resolveSession(activeSession()))
  expect(screen.getByText('signed-out|no-user|no-error')).toBeInTheDocument()
})

it('clears cached data when a protected API reports an expired session', async () => {
  vi.stubEnv('DEV', false)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(activeSession()))
  const client = new QueryClient()
  client.setQueryData(['private'], 'sensitive')
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <AuthState />
      </AuthProvider>
    </QueryClientProvider>,
  )
  await screen.findByText('active|reader@example.test|no-error')
  act(() => window.dispatchEvent(new Event('zoho-auth-unauthorized')))
  expect(screen.getByText('expired|no-user|no-error')).toBeInTheDocument()
  expect(client.getQueryCache().getAll()).toHaveLength(0)
})

it.each(['focus', 'pageshow'])(
  'revalidates server cookies on %s and clears records after logout elsewhere',
  async (eventType) => {
    vi.stubEnv('DEV', false)
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(activeSession())
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetchSpy)
    const client = new QueryClient()
    client.setQueryData(['private'], 'sensitive')
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <AuthState />
        </AuthProvider>
      </QueryClientProvider>,
    )
    await screen.findByText('active|reader@example.test|no-error')
    act(() => {
      window.dispatchEvent(
        eventType === 'pageshow'
          ? new PageTransitionEvent('pageshow', { persisted: true })
          : new Event('focus'),
      )
    })
    await screen.findByText('signed-out|no-user|no-error')
    expect(client.getQueryCache().getAll()).toHaveLength(0)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  },
)

it('does not restore an older active session after a newer server validation rejects it', async () => {
  vi.stubEnv('DEV', false)
  let resolveOldBody!: (payload: unknown) => void
  const delayedBody = activeSession()
  vi.spyOn(delayedBody, 'json').mockImplementation(
    () => new Promise((resolve) => (resolveOldBody = resolve)),
  )
  const fetchSpy = vi
    .fn()
    .mockResolvedValueOnce(delayedBody)
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
  vi.stubGlobal('fetch', fetchSpy)
  const client = new QueryClient()
  client.setQueryData(['private'], 'sensitive')
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <AuthState />
        </AuthProvider>
      </QueryClientProvider>,
    )
  })
  act(() => window.dispatchEvent(new Event('focus')))
  await screen.findByText('signed-out|no-user|no-error')
  await act(async () => {
    resolveOldBody({
      user: { email: 'reader@example.test', role: 'viewer' },
      expiresAt: Date.now() + 60_000,
    })
  })
  expect(screen.getByText('signed-out|no-user|no-error')).toBeInTheDocument()
  expect(client.getQueryCache().getAll()).toHaveLength(0)
})
