// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthProvider'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

function AuthState() {
  const auth = useAuth()
  return (
    <output>
      {auth.sessionState}|{auth.user?.email ?? 'no-user'}|{auth.error ?? 'no-error'}
    </output>
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
