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
  it.each([
    ['/overview', 'Overview'],
    ['/fiscalization', 'Fiscalization'],
    ['/device', 'G03 Device'],
    ['/writeback', 'Writeback'],
    ['/monitoring', 'Monitoring'],
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
