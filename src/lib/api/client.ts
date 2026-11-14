import type { ZodType } from 'zod'
import { dataModeConfig } from '@/lib/config'

const settings = {
  baseUrl: '',
  timeoutMs: 10_000,
}

export type ApiMode = 'mock' | 'api'
export const apiMode: ApiMode = dataModeConfig.mode
export type ApiErrorKind =
  | 'disabled'
  | 'configuration'
  | 'unauthorized'
  | 'forbidden'
  | 'cancelled'
  | 'http'
  | 'timeout'
  | 'network'
  | 'contract'

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly kind: ApiErrorKind = 'http',
    public readonly code?: string,
    public readonly requestId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function getJson<T>(
  path: string,
  schema: ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (apiMode !== 'api')
    throw new ApiError(
      'API requests are disabled while the app is in development mock mode.',
      undefined,
      'disabled',
    )
  if (dataModeConfig.configurationError)
    throw new ApiError(dataModeConfig.configurationError, undefined, 'configuration')
  if (import.meta.env.DEV)
    throw new ApiError(
      'Dashboard API transport is disabled during Vite development. Use local fixtures.',
      undefined,
      'configuration',
    )
  if (!path.startsWith('/api/dashboard/'))
    throw new ApiError('Only dashboard read routes are available.', undefined, 'configuration')
  if (!/^\/api\/dashboard\/(overview|invoices|credit-notes|services)(\?|$)/.test(path))
    throw new ApiError(
      'This resource is not exposed by the middleware dashboard API.',
      undefined,
      'disabled',
    )
  if (signal?.aborted) throw new ApiError('Request was cancelled.', undefined, 'cancelled')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), settings.timeoutMs)
  const abortRequest = () => controller.abort()
  signal?.addEventListener('abort', abortRequest, { once: true })
  try {
    const response = await fetch(`${settings.baseUrl}${path}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      credentials: 'same-origin',
    })
    if (!response.ok) {
      const kind =
        response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : 'http'
      if (response.status === 401 && typeof window !== 'undefined') {
        window.dispatchEvent(new Event('zoho-auth-unauthorized'))
      }
      let message = `Dashboard gateway returned HTTP ${response.status}.`
      let code: string | undefined
      let requestId = response.headers.get('x-request-id') ?? undefined
      try {
        const payload: unknown = await response.json()
        if (payload && typeof payload === 'object' && 'error' in payload) {
          const error = payload.error
          if (error && typeof error === 'object') {
            if (
              'message' in error &&
              typeof error.message === 'string' &&
              error.message.length <= 500
            )
              message = error.message
            if (
              'code' in error &&
              typeof error.code === 'string' &&
              /^[A-Za-z0-9_]{1,80}$/.test(error.code)
            )
              code = error.code
            if ('requestId' in error && typeof error.requestId === 'string')
              requestId = error.requestId
          }
        }
      } catch {
        /* HTML/platform failures retain the HTTP status fallback. */
      }
      if (requestId && !/^[A-Za-z0-9._:-]{1,128}$/.test(requestId)) requestId = undefined
      throw new ApiError(
        `${message}${code ? ` [${code}]` : ''}${requestId ? ` Request ID: ${requestId}` : ''}`,
        response.status,
        kind,
        code,
        requestId,
      )
    }
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new ApiError('Dashboard gateway response was not valid JSON.', undefined, 'contract')
    }
    const parsed = schema.safeParse(payload)
    if (!parsed.success)
      throw new ApiError(
        'Middleware response did not match the verified contract.',
        undefined,
        'contract',
      )
    return parsed.data
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (signal?.aborted) throw new ApiError('Request was cancelled.', undefined, 'cancelled')
    if (controller.signal.aborted)
      throw new ApiError('Request timed out or was cancelled.', undefined, 'timeout')
    throw new ApiError('Dashboard gateway could not be reached.', undefined, 'network')
  } finally {
    signal?.removeEventListener('abort', abortRequest)
    clearTimeout(timeout)
  }
}
