import {
  createHash,
  createHmac,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify as verifySignature,
} from 'node:crypto'

export type DashboardRole = 'admin' | 'operator' | 'viewer'

export interface DashboardSession {
  email: string
  role: DashboardRole
  expiresAt: number
}

export interface VercelRequest {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
}

export interface VercelResponse {
  status(code: number): VercelResponse
  setHeader(name: string, value: string | string[]): VercelResponse
  end(body?: string): void
}

export interface AuthConfig {
  authUrl: string
  sessionSecret: string
  googleClientId: string
  googleClientSecret: string
  allowedUsers: Record<string, DashboardRole>
}

export type AuthorizationResult =
  | { ok: true; session: DashboardSession }
  | { ok: false; status: 401 | 403; error: 'unauthorized' | 'forbidden' }

const SESSION_COOKIE = '__Host-dashboard_session'
const OAUTH_COOKIE = '__Host-dashboard_oauth'
const SESSION_SECONDS = 8 * 60 * 60
const OAUTH_SECONDS = 10 * 60
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_JWKS_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/certs'
const ROLE_SET = new Set<DashboardRole>(['admin', 'operator', 'viewer'])

interface OAuthState {
  state: string
  nonce: string
  verifier: string
  expiresAt: number
}

interface GoogleJwk {
  kid?: string
  kty?: string
  alg?: string
  use?: string
  n?: string
  e?: string
}

interface GoogleClaims {
  iss?: string
  aud?: string | string[]
  azp?: string
  sub?: string
  email?: string
  email_verified?: boolean | string
  name?: string
  nonce?: string
  exp?: number
  iat?: number
}

interface GoogleKeyCache {
  keys: GoogleJwk[]
  expiresAt: number
}

let googleKeyCache: GoogleKeyCache | undefined

function parseAuthUrl(value: string | undefined): string {
  if (!value) throw new Error('DASHBOARD_AUTH_URL is required.')
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('DASHBOARD_AUTH_URL must be an HTTPS origin.')
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('DASHBOARD_AUTH_URL must be an HTTPS origin without a path.')
  }
  return parsed.origin
}

export function getAuthConfig(env: Record<string, string | undefined> = process.env): AuthConfig {
  const authUrl = parseAuthUrl(env.DASHBOARD_AUTH_URL)
  const sessionSecret = env.DASHBOARD_SESSION_SECRET
  if (!sessionSecret || Buffer.byteLength(sessionSecret, 'utf8') < 32) {
    throw new Error('DASHBOARD_SESSION_SECRET must contain at least 32 bytes.')
  }
  const googleClientId = env.GOOGLE_CLIENT_ID
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET
  if (!googleClientId || !googleClientSecret) {
    throw new Error('Google OAuth client configuration is incomplete.')
  }
  const rawAllowlist = env.DASHBOARD_ALLOWED_USERS
  if (!rawAllowlist) throw new Error('DASHBOARD_ALLOWED_USERS is required.')
  let parsed: unknown
  try {
    parsed = JSON.parse(rawAllowlist)
  } catch {
    throw new Error('DASHBOARD_ALLOWED_USERS must be a JSON email-to-role object.')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('DASHBOARD_ALLOWED_USERS must be a JSON email-to-role object.')
  }
  const allowedUsers: Record<string, DashboardRole> = {}
  for (const [email, role] of Object.entries(parsed)) {
    const normalizedEmail = email.trim().toLowerCase()
    if (
      !normalizedEmail ||
      !normalizedEmail.includes('@') ||
      typeof role !== 'string' ||
      !ROLE_SET.has(role as DashboardRole)
    ) {
      throw new Error('DASHBOARD_ALLOWED_USERS contains an invalid email or role.')
    }
    allowedUsers[normalizedEmail] = role as DashboardRole
  }
  if (!Object.keys(allowedUsers).length) throw new Error('DASHBOARD_ALLOWED_USERS cannot be empty.')
  return { authUrl, sessionSecret, googleClientId, googleClientSecret, allowedUsers }
}

function cookieValue(request: VercelRequest, name: string): string | undefined {
  const raw = request.headers.cookie
  const cookieHeader = Array.isArray(raw) ? raw.join(';') : raw
  if (!cookieHeader) return undefined
  for (const item of cookieHeader.split(';')) {
    const separator = item.indexOf('=')
    if (separator < 0 || item.slice(0, separator).trim() !== name) continue
    return item.slice(separator + 1).trim()
  }
  return undefined
}

function signature(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

function signValue(value: string, secret: string): string {
  return `${value}.${signature(value, secret)}`
}

function verifyValue(signed: string | undefined, secret: string): string | undefined {
  if (!signed) return undefined
  const separator = signed.lastIndexOf('.')
  if (separator <= 0) return undefined
  const value = signed.slice(0, separator)
  const provided = Buffer.from(signed.slice(separator + 1))
  const expected = Buffer.from(signature(value, secret))
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return undefined
  return value
}

function serializeCookie(name: string, value: string, maxAge: number, secure: boolean): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
}

function expiredCookie(name: string, secure: boolean): string {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
}

function secureCookie(config: AuthConfig): boolean {
  return new URL(config.authUrl).protocol === 'https:'
}

function requestPath(request: VercelRequest): string {
  try {
    return new URL(request.url ?? '/', 'https://vercel.invalid').pathname
  } catch {
    return '/'
  }
}

function sendJson(response: VercelResponse, status: number, body: unknown): void {
  response.status(status)
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

function redirect(response: VercelResponse, location: string, cookies: string[] = []): void {
  response.status(302)
  response.setHeader('Location', location)
  response.setHeader('Cache-Control', 'no-store')
  if (cookies.length) response.setHeader('Set-Cookie', cookies)
  response.end()
}

function methodNotAllowed(response: VercelResponse, allow: string): void {
  response.setHeader('Allow', allow)
  sendJson(response, 405, { error: 'method_not_allowed' })
}

function safeError(response: VercelResponse, status: number, code: string): void {
  sendJson(response, status, { error: code })
}

function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function readSignedJson<T>(signed: string | undefined, secret: string): T | undefined {
  const value = verifyValue(signed, secret)
  if (!value) return undefined
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T
  } catch {
    return undefined
  }
}

function signedJson(value: unknown, secret: string): string {
  return signValue(Buffer.from(JSON.stringify(value)).toString('base64url'), secret)
}

function readSession(request: VercelRequest, config: AuthConfig): DashboardSession | undefined {
  const session = readSignedJson<DashboardSession>(
    cookieValue(request, SESSION_COOKIE),
    config.sessionSecret,
  )
  if (
    !session ||
    typeof session.email !== 'string' ||
    !ROLE_SET.has(session.role) ||
    !Number.isSafeInteger(session.expiresAt) ||
    session.expiresAt <= Date.now()
  ) {
    return undefined
  }
  return session
}

export function authorizeDashboardRequest(
  request: VercelRequest,
  requiredRoles?: readonly DashboardRole[],
  env?: Record<string, string | undefined>,
): AuthorizationResult {
  let config: AuthConfig
  try {
    config = getAuthConfig(env)
  } catch {
    // Missing auth configuration must never weaken API protection.
    return { ok: false, status: 401, error: 'unauthorized' }
  }
  const session = readSession(request, config)
  if (!session) return { ok: false, status: 401, error: 'unauthorized' }
  const currentRole = config.allowedUsers[session.email.toLowerCase()]
  if (!currentRole || currentRole !== session.role)
    return { ok: false, status: 403, error: 'forbidden' }
  if (requiredRoles?.length && !requiredRoles.includes(currentRole)) {
    return { ok: false, status: 403, error: 'forbidden' }
  }
  return { ok: true, session }
}

export function requireDashboardRole(
  request: VercelRequest,
  response: VercelResponse,
  requiredRoles?: readonly DashboardRole[],
  env?: Record<string, string | undefined>,
): DashboardSession | null {
  const result = authorizeDashboardRequest(request, requiredRoles, env)
  if (result.ok === false) safeError(response, result.status, result.error)
  return result.ok ? result.session : null
}

export function requireDashboardSession(
  request: VercelRequest,
  response: VercelResponse,
  requiredRoles?: readonly DashboardRole[],
  env?: Record<string, string | undefined>,
): DashboardSession | null {
  return requireDashboardRole(request, response, requiredRoles, env)
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 8000,
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), redirect: 'error' })
}

async function getGoogleKeys(): Promise<GoogleJwk[]> {
  if (googleKeyCache && googleKeyCache.expiresAt > Date.now()) return googleKeyCache.keys
  const response = await fetchWithTimeout(GOOGLE_JWKS_ENDPOINT, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error('Google signing keys unavailable')
  const payload: unknown = await response.json()
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray((payload as { keys?: unknown }).keys)
  ) {
    throw new Error('Invalid Google signing keys')
  }
  const keys = (payload as { keys: GoogleJwk[] }).keys
  const cacheControl = response.headers.get('cache-control') ?? ''
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] ?? '300')
  googleKeyCache = { keys, expiresAt: Date.now() + Math.min(Math.max(maxAge, 60), 3600) * 1000 }
  return keys
}

function decodeJwtPart<T>(part: string): T {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T
}

async function verifyGoogleIdToken(
  token: string,
  config: AuthConfig,
  expectedNonce: string,
): Promise<GoogleClaims> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Malformed ID token')
  const header = decodeJwtPart<{ alg?: string; kid?: string }>(parts[0])
  const claims = decodeJwtPart<GoogleClaims>(parts[1])
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unsupported ID token signature')
  const key = (await getGoogleKeys()).find(
    (item) => item.kid === header.kid && item.kty === 'RSA' && item.alg === 'RS256',
  )
  if (!key) throw new Error('Google signing key not found')
  const publicKey = createPublicKey({ key: key as never, format: 'jwk' })
  const validSignature = verifySignature(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    publicKey,
    Buffer.from(parts[2], 'base64url'),
  )
  const now = Math.floor(Date.now() / 1000)
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (
    !validSignature ||
    !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss ?? '') ||
    !audiences.includes(config.googleClientId) ||
    (audiences.length > 1 && claims.azp !== config.googleClientId) ||
    !Number.isFinite(claims.exp) ||
    (claims.exp ?? 0) <= now ||
    !Number.isFinite(claims.iat) ||
    (claims.iat ?? Number.POSITIVE_INFINITY) > now + 60 ||
    claims.nonce !== expectedNonce ||
    typeof claims.sub !== 'string' ||
    typeof claims.email !== 'string' ||
    !(claims.email_verified === true || claims.email_verified === 'true')
  ) {
    throw new Error('ID token claims invalid')
  }
  return claims
}

export default async function authHandler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  response.setHeader('Referrer-Policy', 'no-referrer')
  let config: AuthConfig
  try {
    config = getAuthConfig()
  } catch {
    safeError(response, 503, 'authentication_unavailable')
    return
  }
  const segments = requestPath(request).split('/').filter(Boolean)
  const lastSegment = segments[segments.length - 1]
  const path = lastSegment === 'google' ? segments[segments.length - 2] : lastSegment
  const secure = secureCookie(config)
  if (path === 'login' || path === 'signin') {
    if (request.method !== 'GET') return methodNotAllowed(response, 'GET')
    const state: OAuthState = {
      state: randomToken(),
      nonce: randomToken(),
      verifier: randomToken(48),
      expiresAt: Date.now() + OAUTH_SECONDS * 1000,
    }
    const challenge = createHash('sha256').update(state.verifier).digest('base64url')
    const destination = new URL(GOOGLE_AUTH_ENDPOINT)
    destination.search = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: `${config.authUrl}/api/auth/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state: state.state,
      nonce: state.nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString()
    redirect(response, destination.toString(), [
      serializeCookie(OAUTH_COOKIE, signedJson(state, config.sessionSecret), OAUTH_SECONDS, secure),
    ])
    return
  }
  if (path === 'callback') {
    if (request.method !== 'GET') return methodNotAllowed(response, 'GET')
    const query = new URL(request.url ?? '/', config.authUrl).searchParams
    const state = readSignedJson<OAuthState>(
      cookieValue(request, OAUTH_COOKIE),
      config.sessionSecret,
    )
    const code = query.get('code')
    const returnedState = query.get('state')
    const providerError = query.get('error')
    if (
      providerError ||
      !code ||
      !returnedState ||
      !state ||
      state.expiresAt <= Date.now() ||
      !constantTimeEqual(returnedState, state.state)
    ) {
      response.setHeader('Set-Cookie', expiredCookie(OAUTH_COOKIE, secure))
      safeError(response, 400, 'authentication_failed')
      return
    }
    try {
      const tokenResponse = await fetchWithTimeout(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: config.googleClientId,
          client_secret: config.googleClientSecret,
          redirect_uri: `${config.authUrl}/api/auth/callback`,
          code_verifier: state.verifier,
        }),
      })
      if (!tokenResponse.ok) throw new Error('OAuth token exchange failed')
      const tokenPayload: unknown = await tokenResponse.json()
      const idToken =
        tokenPayload && typeof tokenPayload === 'object'
          ? (tokenPayload as { id_token?: unknown }).id_token
          : undefined
      if (typeof idToken !== 'string') throw new Error('OAuth response missing ID token')
      const claims = await verifyGoogleIdToken(idToken, config, state.nonce)
      const email = claims.email!.trim().toLowerCase()
      const role = config.allowedUsers[email]
      if (!role) {
        response.setHeader('Set-Cookie', expiredCookie(OAUTH_COOKIE, secure))
        safeError(response, 403, 'forbidden')
        return
      }
      const session: DashboardSession = {
        email,
        role,
        expiresAt: Date.now() + SESSION_SECONDS * 1000,
      }
      redirect(response, `${config.authUrl}/overview`, [
        serializeCookie(
          SESSION_COOKIE,
          signedJson(session, config.sessionSecret),
          SESSION_SECONDS,
          secure,
        ),
        expiredCookie(OAUTH_COOKIE, secure),
      ])
    } catch {
      response.setHeader('Set-Cookie', expiredCookie(OAUTH_COOKIE, secure))
      safeError(response, 401, 'authentication_failed')
    }
    return
  }
  if (path === 'session') {
    if (request.method !== 'GET') return methodNotAllowed(response, 'GET')
    const session = readSession(request, config)
    if (!session || config.allowedUsers[session.email.toLowerCase()] !== session.role) {
      safeError(response, 401, 'unauthorized')
      return
    }
    sendJson(response, 200, {
      user: { email: session.email, role: session.role },
      expiresAt: session.expiresAt,
    })
    return
  }
  if (path === 'logout') {
    if (request.method !== 'POST') return methodNotAllowed(response, 'POST')
    const origin = request.headers.origin
    if (origin !== config.authUrl) {
      safeError(response, 403, 'forbidden')
      return
    }
    response.status(204)
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Set-Cookie', [
      expiredCookie(SESSION_COOKIE, secure),
      expiredCookie(OAUTH_COOKIE, secure),
    ])
    response.end()
    return
  }
  safeError(response, 404, 'not_found')
}
