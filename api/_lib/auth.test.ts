import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateKeyPairSync, sign } from 'node:crypto'
import authHandler from '../auth/[...auth]'
import {
  authorizeDashboardRequest,
  getAuthConfig,
  requireDashboardSession,
  type VercelResponse,
} from './auth'

const originalEnv = { ...process.env }
const secret = 'test-only-session-secret-that-is-at-least-32-bytes'

function configure() {
  process.env.DASHBOARD_AUTH_URL = 'https://dashboard.example.test'
  process.env.DASHBOARD_SESSION_SECRET = secret
  process.env.GOOGLE_CLIENT_ID = 'client-id.apps.googleusercontent.com'
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
  process.env.DASHBOARD_ALLOWED_USERS = JSON.stringify({ 'reader@example.test': 'viewer' })
}

function responseMock() {
  const headers: Record<string, string | string[]> = {}
  let statusCode = 200
  let body: string | undefined
  const response: VercelResponse = {
    status(code) {
      statusCode = code
      return response
    },
    setHeader(name, value) {
      headers[name.toLowerCase()] = value
      return response
    },
    end(value) {
      body = value
    },
  }
  return { response, headers, status: () => statusCode, body: () => body }
}

function request(method: string, url: string, headers: Record<string, string> = {}) {
  return { method, url, headers }
}

function cookieFrom(header: string | string[] | undefined, name: string): string | undefined {
  const entries = Array.isArray(header) ? header : header ? [header] : []
  return entries.map((entry) => entry.split(';')[0]).find((entry) => entry.startsWith(`${name}=`))
}

function jwtPart(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key]
  }
  Object.assign(process.env, originalEnv)
})

describe('Vercel Google OIDC auth boundary', () => {
  it('fails closed when required configuration is absent or malformed', () => {
    expect(() => getAuthConfig({})).toThrow('DASHBOARD_AUTH_URL')
    expect(() =>
      getAuthConfig({
        DASHBOARD_AUTH_URL: 'https://dashboard.example.test',
        DASHBOARD_SESSION_SECRET: 'short',
        GOOGLE_CLIENT_ID: 'id',
        GOOGLE_CLIENT_SECRET: 'secret',
        DASHBOARD_ALLOWED_USERS: '{"a@example.test":"viewer"}',
      }),
    ).toThrow('DASHBOARD_SESSION_SECRET')
    expect(() =>
      getAuthConfig({
        DASHBOARD_AUTH_URL: 'https://dashboard.example.test',
        DASHBOARD_SESSION_SECRET: secret,
        GOOGLE_CLIENT_ID: 'id',
        GOOGLE_CLIENT_SECRET: 'secret',
        DASHBOARD_ALLOWED_USERS: '{"a@example.test":"root"}',
      }),
    ).toThrow('invalid email or role')
  })

  it('starts Google authorization with state, nonce and PKCE and sets a protected transient cookie', async () => {
    configure()
    const res = responseMock()
    await authHandler(request('GET', '/api/auth/login'), res.response)
    const authorization = new URL(String(res.headers.location))
    expect(res.status()).toBe(302)
    expect(authorization.origin + authorization.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    )
    expect(authorization.searchParams.get('state')).toBeTruthy()
    expect(authorization.searchParams.get('nonce')).toBeTruthy()
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorization.searchParams.get('redirect_uri')).toBe(
      'https://dashboard.example.test/api/auth/callback',
    )
    expect(String(res.headers['set-cookie'])).toContain('HttpOnly')
    expect(String(res.headers['set-cookie'])).toContain('Secure')
    expect(String(res.headers['set-cookie'])).toContain('SameSite=Lax')
  })

  it('routes the Google-specific sign-in and callback paths to the existing OIDC handler', async () => {
    configure()
    const signIn = responseMock()
    await authHandler(request('GET', '/api/auth/signin/google'), signIn.response)
    expect(signIn.status()).toBe(302)
    expect(new URL(String(signIn.headers.location)).origin).toBe('https://accounts.google.com')

    const callback = responseMock()
    await authHandler(
      request('GET', '/api/auth/callback/google?code=code&state=wrong', {
        cookie: '__Host-dashboard_oauth=not-a-valid-signed-state',
      }),
      callback.response,
    )
    expect(callback.status()).toBe(400)
    expect(callback.body()).toContain('authentication_failed')
  })

  it('rejects callback state mismatches without contacting Google', async () => {
    configure()
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const res = responseMock()
    await authHandler(
      request('GET', '/api/auth/callback?code=code&state=wrong', {
        cookie: '__Host-dashboard_oauth=not-a-valid-signed-state',
      }),
      res.response,
    )
    expect(res.status()).toBe(400)
    expect(res.body()).toContain('authentication_failed')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('exchanges and cryptographically verifies OIDC tokens, then issues an allowlisted role session', async () => {
    configure()
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const jwk = publicKey.export({ format: 'jwk' })
    const kid = 'test-key'
    const nonce = 'nonce-value'
    const state = 'state-value'
    const verifier = 'pkce-verifier'
    const oauthState = { state, nonce, verifier, expiresAt: Date.now() + 60_000 }
    const oauthCookiePayload = Buffer.from(JSON.stringify(oauthState)).toString('base64url')
    const { createHmac } = await import('node:crypto')
    const oauthCookie = `${oauthCookiePayload}.${createHmac('sha256', secret).update(oauthCookiePayload).digest('base64url')}`
    const now = Math.floor(Date.now() / 1000)
    const header = jwtPart({ alg: 'RS256', kid })
    const claims = jwtPart({
      iss: 'https://accounts.google.com',
      aud: 'client-id.apps.googleusercontent.com',
      sub: 'subject-1',
      email: 'Reader@example.test',
      email_verified: true,
      nonce,
      exp: now + 300,
      iat: now,
    })
    const content = `${header}.${claims}`
    const idToken = `${content}.${sign('RSA-SHA256', Buffer.from(content), privateKey).toString('base64url')}`
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ id_token: idToken }), { status: 200 })
      }
      if (url === 'https://www.googleapis.com/oauth2/v3/certs') {
        return new Response(
          JSON.stringify({ keys: [{ ...jwk, kid, kty: 'RSA', alg: 'RS256', use: 'sig' }] }),
          {
            status: 200,
            headers: { 'Cache-Control': 'public, max-age=300' },
          },
        )
      }
      throw new Error('Unexpected upstream URL')
    })
    vi.stubGlobal('fetch', fetch)
    const res = responseMock()
    await authHandler(
      request('GET', `/api/auth/callback?code=auth-code&state=${state}`, {
        cookie: `__Host-dashboard_oauth=${oauthCookie}`,
      }),
      res.response,
    )
    expect(res.status()).toBe(302)
    expect(res.headers.location).toBe('https://dashboard.example.test/overview')
    const sessionCookie = cookieFrom(res.headers['set-cookie'], '__Host-dashboard_session')
    expect(sessionCookie).toBeTruthy()
    const sessionResponse = responseMock()
    await authHandler(
      request('GET', '/api/auth/session', {
        cookie: sessionCookie!,
      }),
      sessionResponse.response,
    )
    expect(sessionResponse.status()).toBe(200)
    expect(JSON.parse(sessionResponse.body() ?? '')).toMatchObject({
      user: { email: 'reader@example.test', role: 'viewer' },
    })
    const authorization = authorizeDashboardRequest(
      request('GET', '/api/dashboard/overview', {
        cookie: sessionCookie!,
      }),
    )
    expect(authorization).toMatchObject({
      ok: true,
      session: { email: 'reader@example.test', role: 'viewer' },
    })
    const forbidden = responseMock()
    expect(
      requireDashboardSession(
        request('GET', '/api/admin', { cookie: sessionCookie! }),
        forbidden.response,
        ['admin'],
      ),
    ).toBeNull()
    expect(forbidden.status()).toBe(403)
    const tokenExchange = fetch.mock.calls.find(
      ([input]) => String(input) === 'https://oauth2.googleapis.com/token',
    )
    expect(tokenExchange).toBeTruthy()
  })

  it('returns 401 for absent sessions and 403 for roles outside the allowlist or required role set', () => {
    configure()
    expect(authorizeDashboardRequest(request('GET', '/api/dashboard'))).toMatchObject({
      ok: false,
      status: 401,
    })
    const rejected = responseMock()
    expect(requireDashboardSession(request('GET', '/api/dashboard'), rejected.response)).toBeNull()
    expect(rejected.status()).toBe(401)
  })

  it('requires same-origin POST logout and clears both cookies', async () => {
    configure()
    const rejected = responseMock()
    await authHandler(
      request('POST', '/api/auth/logout', { origin: 'https://evil.example.test' }),
      rejected.response,
    )
    expect(rejected.status()).toBe(403)
    const accepted = responseMock()
    await authHandler(
      request('POST', '/api/auth/logout', { origin: 'https://dashboard.example.test' }),
      accepted.response,
    )
    expect(accepted.status()).toBe(204)
    expect(accepted.headers['set-cookie']).toHaveLength(2)
  })
})
