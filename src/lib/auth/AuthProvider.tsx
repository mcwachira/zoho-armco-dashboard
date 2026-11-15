import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'

export interface Identity {
  name: string
  email: string
  role?: string
  image?: string | null
}
type SessionState = 'loading' | 'active' | 'signed-out' | 'expired' | 'unauthorized' | 'unavailable'
interface AuthValue {
  user: Identity | null
  sessionState: SessionState
  login: () => Promise<void>
  logout: () => Promise<void>
  expireSession: () => void
  markUnauthorized: () => void
  adapter: 'development-mock' | 'google-oidc' | 'unconfigured'
  error?: string
}
interface AuthContextValue extends AuthValue {
  setSession: (user: Identity | null, state: SessionState, error?: string) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const LOGOUT_STORAGE_KEY = 'zoho-dashboard-logout'
const mockEnabled = import.meta.env.DEV && import.meta.env.VITE_AUTH_MODE === 'development-mock'

export function AuthProvider({ children }: { children: ReactNode }) {
  if (mockEnabled) return <MockAuthProvider>{children}</MockAuthProvider>
  if (import.meta.env.DEV) return <UnavailableAuthProvider>{children}</UnavailableAuthProvider>
  return <ServerAuthProvider>{children}</ServerAuthProvider>
}

function MockAuthProvider({ children }: { children: ReactNode }) {
  const value = useMemo<AuthContextValue>(
    () => ({
      user: { name: 'Alex Morgan', email: 'alex@zohoamarco.local', role: 'viewer' },
      sessionState: 'active',
      login: async () => undefined,
      logout: async () => undefined,
      expireSession: () => undefined,
      markUnauthorized: () => undefined,
      adapter: 'development-mock',
      setSession: () => undefined,
    }),
    [],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function UnavailableAuthProvider({ children }: { children: ReactNode }) {
  const value = useMemo<AuthContextValue>(
    () => ({
      user: null,
      sessionState: 'unavailable',
      login: async () => undefined,
      logout: async () => undefined,
      expireSession: () => undefined,
      markUnauthorized: () => undefined,
      adapter: 'unconfigured',
      error: 'Local Vite mode uses demo auth only when explicitly enabled.',
      setSession: () => undefined,
    }),
    [],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function ServerAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<Identity | null>(null)
  const [sessionState, setSessionState] = useState<SessionState>('loading')
  const [error, setError] = useState<string | undefined>()
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const sessionGeneration = useRef(0)

  const setSession = (nextUser: Identity | null, state: SessionState, nextError?: string) => {
    if (state !== 'active') queryClient.clear()
    setUser(nextUser)
    setSessionState(state)
    setError(nextError)
  }

  const refreshSession = async () => {
    // Every validation supersedes older requests, including a response whose
    // JSON body finishes after a newer validation has rejected the session.
    const generation = ++sessionGeneration.current
    try {
      const response = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
      if (generation !== sessionGeneration.current) return
      if (response.status === 401) {
        setExpiresAt(null)
        setSession(null, 'signed-out')
        return
      }
      if (!response.ok) {
        setSession(
          null,
          'unavailable',
          response.status === 503
            ? 'Authentication is not configured for this environment.'
            : `Authentication service returned HTTP ${response.status}.`,
        )
        return
      }
      if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
        setSession(null, 'unavailable', 'Dashboard authentication returned a non-JSON response.')
        return
      }
      const payload: unknown = await response.json()
      if (generation !== sessionGeneration.current) return
      if (
        !payload ||
        typeof payload !== 'object' ||
        !('user' in payload) ||
        !payload.user ||
        typeof payload.user !== 'object' ||
        !('email' in payload.user) ||
        typeof payload.user.email !== 'string' ||
        !('role' in payload.user) ||
        typeof payload.user.role !== 'string' ||
        !['admin', 'operator', 'viewer'].includes(payload.user.role) ||
        !('expiresAt' in payload) ||
        typeof payload.expiresAt !== 'number' ||
        !Number.isSafeInteger(payload.expiresAt) ||
        payload.expiresAt <= Date.now()
      ) {
        setSession(null, 'unavailable', 'Dashboard authentication returned an invalid session.')
        return
      }
      setSession(
        {
          email: payload.user.email,
          name: payload.user.email,
          role: payload.user.role,
        },
        'active',
      )
      setExpiresAt(payload.expiresAt)
    } catch {
      if (generation !== sessionGeneration.current) return
      setSession(null, 'unavailable', 'Dashboard authentication service could not be reached.')
    }
  }

  useEffect(() => {
    void refreshSession()
    const onFocus = () => void refreshSession()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshSession()
    }
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void refreshSession()
    }
    // Recheck server cookies after returning to a background tab or a page
    // restored from browser history. Storage notifications may be disabled.
    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      sessionGeneration.current += 1
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    if (expiresAt === null) return
    const timer = window.setTimeout(
      () => {
        sessionGeneration.current += 1
        setExpiresAt(null)
        setSession(null, 'expired')
      },
      Math.max(0, expiresAt - Date.now()),
    )
    return () => window.clearTimeout(timer)
  }, [expiresAt, queryClient])

  useEffect(() => {
    const onUnauthorized = () => {
      sessionGeneration.current += 1
      setExpiresAt(null)
      setSession(null, 'expired')
    }
    window.addEventListener('zoho-auth-unauthorized', onUnauthorized)
    return () => window.removeEventListener('zoho-auth-unauthorized', onUnauthorized)
  }, [queryClient])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== LOGOUT_STORAGE_KEY || !event.newValue) return
      sessionGeneration.current += 1
      setExpiresAt(null)
      setSession(null, 'signed-out')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      sessionState,
      error,
      adapter: 'google-oidc',
      login: async () => {
        window.location.assign('/api/auth/login')
      },
      logout: async () => {
        const response = await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'same-origin',
        })
        // The auth handler confirms cookie deletion with 204. A successful HTML
        // fallback or an unrelated JSON response is not evidence of logout.
        if (response.status !== 204) throw new Error('Dashboard sign out failed.')
        sessionGeneration.current += 1
        setExpiresAt(null)
        setSession(null, 'signed-out')
        try {
          localStorage.setItem(LOGOUT_STORAGE_KEY, crypto.randomUUID())
        } catch {
          // Cookie invalidation and local cache clearing still work when storage is disabled.
        }
      },
      expireSession: () => {
        sessionGeneration.current += 1
        setExpiresAt(null)
        setSession(null, 'expired')
      },
      markUnauthorized: () => {
        sessionGeneration.current += 1
        setExpiresAt(null)
        setSession(null, 'unauthorized')
      },
      setSession,
    }),
    [user, sessionState, error, queryClient],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
