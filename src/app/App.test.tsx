// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
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
  it('waits for the refreshed date range and does not record success when its response fails', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DATA_MODE', 'api')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-18T12:00:00.000Z'))
    const { mockOverview, mockServiceHealth, mockManualReview } =
      await import('@/features/api/mock-api-fixtures')
    let releaseOverview!: () => void
    const newRangeResponse = new Promise<void>((resolve) => {
      releaseOverview = resolve
    })
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input), 'https://dashboard.test')
      if (url.pathname === '/api/auth/session')
        return json({
          user: { email: 'reader@example.test', role: 'viewer' },
          expiresAt: Date.now() + 60_000,
        })
      if (url.pathname === '/api/dashboard/overview') {
        if (url.searchParams.get('createdTo') !== '2026-11-18T12:00:00.000Z') {
          await newRangeResponse
          return json(
            { error: { code: 'UPSTREAM_UNAVAILABLE', message: 'New range unavailable' } },
            503,
          )
        }
        return json(
          mockOverview(url.searchParams.get('createdFrom')!, url.searchParams.get('createdTo')!),
        )
      }
      if (url.pathname === '/api/dashboard/services') return json(mockServiceHealth)
      if (url.pathname === '/api/dashboard/manual-review') return json(mockManualReview)
      return json({ page: 1, pageSize: 25, total: 0, items: [] })
    })
    vi.stubGlobal('fetch', fetcher)
    const { queryClient } = await renderApp('/overview', 'google-oidc')
    expect(await screen.findByText('FISCALIZATION REQUESTS')).toBeInTheDocument()
    await waitFor(() => expect(queryClient.isFetching({ queryKey: ['middleware'] })).toBe(0))
    vi.setSystemTime(new Date('2026-11-18T12:00:10.000Z'))
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Refresh active middleware reads' }))
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(([input]) => {
          const url = new URL(String(input), 'https://dashboard.test')
          return (
            url.pathname === '/api/dashboard/overview' &&
            url.searchParams.get('createdTo') === '2026-11-18T12:00:10.000Z'
          )
        }),
      ).toBe(true),
    )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25))
    })
    expect(screen.getByRole('button', { name: 'Refresh active middleware reads' })).toBeDisabled()
    expect(screen.getByText('Awaiting verified refresh')).toBeInTheDocument()
    expect(screen.queryByText(/Reads refreshed/)).not.toBeInTheDocument()
    releaseOverview()
    expect(
      await screen.findByText(
        'Some dashboard reads could not be refreshed. Each page reports its data availability.',
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Reads refreshed/)).not.toBeInTheDocument()
    expect(screen.queryByText('Active verified middleware reads refreshed')).not.toBeInTheDocument()
    queryClient.clear()
  }, 15_000)

  it('exposes sidebar state and restores focus when mobile navigation closes with Escape', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'mock')
    const user = userEvent.setup()
    const { queryClient } = await renderApp('/overview')
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    const trigger = screen.getByRole('button', { name: 'Open navigation' })
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Close navigation' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Close navigation' })).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
    queryClient.clear()
  }, 15_000)

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
    ['/reconciliation', 'CU/KRA Reconciliation'],
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
    if (path === '/overview' || path === '/operations') {
      expect(screen.getByText(/G03 receipt state UNKNOWN/)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'View G03 Device' })).toHaveAttribute(
        'href',
        '/device',
      )
    }
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
