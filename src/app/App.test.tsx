// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function renderApp(path: string, authMode = 'development-mock') {
  vi.stubEnv('VITE_AUTH_MODE', authMode)
  vi.resetModules()
  const [{ AuthProvider }, { default: App }] = await Promise.all([
    import('@/lib/auth/AuthProvider'),
    import('./App'),
  ])
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={[path]}>
            <App />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    ),
  }
}

describe('application route smoke checks', () => {
  it('shows Logout in navigation, posts to the existing endpoint and redirects after success', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DATA_MODE', 'api')
    let completeLogout!: (response: Response) => void
    const logoutResponse = new Promise<Response>((resolve) => {
      completeLogout = resolve
    })
    const fetchSpy = vi.fn((input: string | URL | Request) => {
      if (String(input) === '/api/auth/session')
        return Promise.resolve(
          new Response(
            JSON.stringify({
              user: { email: 'reader@example.test', role: 'viewer' },
              expiresAt: Date.now() + 60_000,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        )
      if (String(input) === '/api/auth/logout') return logoutResponse
      return Promise.resolve(new Response('', { status: 503 }))
    })
    vi.stubGlobal('fetch', fetchSpy)
    const { queryClient } = await renderApp('/overview', 'google-oidc')
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    const privateRecordKey = ['middleware', 'private-record']
    queryClient.setQueryData(privateRecordKey, { requestId: 'test-record' })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Logout' }))
    expect(fetchSpy).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    })
    expect(screen.getByRole('button', { name: 'Logout' })).toBeDisabled()
    expect(queryClient.getQueryData(privateRecordKey)).toBeDefined()

    completeLogout(new Response(null, { status: 204 }))
    expect(
      await screen.findByRole('heading', { name: 'Sign in to your workspace' }),
    ).toBeInTheDocument()
    expect(queryClient.getQueryData(privateRecordKey)).toBeUndefined()
    expect(screen.queryByRole('heading', { name: 'Overview' })).not.toBeInTheDocument()
    queryClient.clear()
  }, 15_000)

  it('keeps the session and cached records when the logout POST fails', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DATA_MODE', 'api')
    const fetchSpy = vi.fn((input: string | URL | Request) => {
      if (String(input) === '/api/auth/session')
        return Promise.resolve(
          new Response(
            JSON.stringify({
              user: { email: 'reader@example.test', role: 'viewer' },
              expiresAt: Date.now() + 60_000,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        )
      return Promise.resolve(new Response('', { status: 503 }))
    })
    vi.stubGlobal('fetch', fetchSpy)
    const { queryClient } = await renderApp('/overview', 'google-oidc')
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    const privateRecordKey = ['middleware', 'private-record']
    queryClient.setQueryData(privateRecordKey, { requestId: 'test-record' })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Logout' }))
    expect(
      await screen.findByText('Sign out failed. Refresh the session and try again.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Logout' })).toBeEnabled()
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(queryClient.getQueryData(privateRecordKey)).toBeDefined()
    expect(
      screen.queryByRole('heading', { name: 'Sign in to your workspace' }),
    ).not.toBeInTheDocument()
    queryClient.clear()
  }, 15_000)

  it.each([
    ['/overview', 'Overview'],
    ['/invoices', 'Invoice register'],
    ['/credit-notes', 'Credit-note register'],
    ['/manual-review', 'Manual review'],
    ['/reconciliation', 'Reconciliation'],
    ['/events', 'Derived operational events'],
    ['/operations', 'Pending operations'],
    ['/fiscalization', 'Fiscalization'],
    ['/requests', 'Fiscalization requests'],
    ['/device', 'G03 Device'],
    ['/writeback', 'Writeback'],
    ['/monitoring', 'Monitoring'],
    ['/health', 'System health'],
    ['/settings', 'Settings'],
    ['/login', 'Sign in to your workspace'],
  ])('renders %s', async (path, heading) => {
    vi.stubEnv('VITE_DATA_MODE', 'mock')
    await renderApp(path)
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
  })

  it('uses the same operational page UI with local fixtures and no network requests in mock mode', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'mock')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const user = userEvent.setup()
    await renderApp('/overview')

    await user.click(await screen.findByRole('link', { name: /Fiscalization/ }))

    expect(
      await screen.findByRole('heading', { name: 'Fiscalization requests' }),
    ).toBeInTheDocument()
    expect(screen.getByText('DEMO ENVIRONMENT')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('keeps production authentication disconnected during Vite development', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api')
    vi.stubEnv('VITE_AUTH_MODE', 'google-oidc')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await renderApp('/overview', 'google-oidc')

    expect(
      await screen.findByRole('heading', { name: 'Sign in to your workspace' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /authentication is not configured/i })).toBeDisabled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('clears cached dashboard records when the operator signs out', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'mock')
    const user = userEvent.setup()
    const { queryClient } = await renderApp('/overview')
    const privateRecordKey = ['middleware', 'dashboard', 'invoice', 'previous-session']
    queryClient.setQueryData(privateRecordKey, {
      requestId: 'private-record',
    })

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open user menu' }))
    await user.click(screen.getByRole('button', { name: /sign out/i }))

    await waitFor(() => expect(queryClient.getQueryData(privateRecordKey)).toBeUndefined())
  })
})
