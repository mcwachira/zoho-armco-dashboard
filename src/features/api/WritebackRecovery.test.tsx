// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authState = vi.hoisted(() => ({ role: 'admin' as string | undefined }))
const recoveryApi = vi.hoisted(() => ({
  get: vi.fn(),
  retry: vi.fn(),
}))
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: { role: authState.role } }) }))
vi.mock('@/lib/api/client', () => ({
  apiMode: 'api',
  getWritebackRecovery: recoveryApi.get,
  retryWritebackRecovery: recoveryApi.retry,
}))

import { WritebackRecovery } from './WritebackRecovery'

const clients: QueryClient[] = []
const failed = (requestId: string) => ({
  status: 'failed',
  requestId,
  correlationId: 'correlation-17',
  retryCount: 3,
  nextRetryAt: null,
  lastError: { code: 'ZOHO_TIMEOUT', message: 'Zoho timed out.' },
  errorCategory: 'provider_unavailable',
  manualInterventionRequired: true,
  fieldsWritten: ['CU receipt number'],
  remainingFields: ['KRA QR URL'],
})

function mount(kind: 'invoice' | 'credit-note', requestId: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  render(
    <QueryClientProvider client={client}>
      <WritebackRecovery kind={kind} requestId={requestId} />
    </QueryClientProvider>,
  )
  return client
}

beforeEach(() => {
  authState.role = 'admin'
  recoveryApi.get.mockReset()
  recoveryApi.retry.mockReset()
})
afterEach(() => {
  cleanup()
  clients.forEach((client) => client.clear())
  clients.length = 0
})

describe('request-specific Zoho writeback recovery', () => {
  it.each([
    ['invoice', 'invoice-request-31'],
    ['credit-note', 'credit-note-request-32'],
  ] as const)(
    'displays and recovers the %s using its existing request ID',
    async (kind, requestId) => {
      recoveryApi.get
        .mockResolvedValueOnce(failed(requestId))
        .mockResolvedValue({ ...failed(requestId), status: 'succeeded' })
      recoveryApi.retry.mockResolvedValue({ ...failed(requestId), status: 'succeeded' })
      mount(kind, requestId)

      expect(await screen.findByText('failed')).toBeInTheDocument()
      expect(screen.getByText(requestId)).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('provider_unavailable')).toBeInTheDocument()
      expect(screen.getByText('CU receipt number')).toBeInTheDocument()
      expect(screen.getByText('KRA QR URL')).toBeInTheDocument()
      expect(recoveryApi.get).toHaveBeenCalledWith(
        kind,
        requestId,
        expect.anything(),
        expect.anything(),
      )

      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Retry Zoho Writeback' }))
      const dialog = screen.getByRole('alertdialog', { name: 'Retry Zoho writeback?' })
      expect(dialog).toHaveTextContent(
        'No new fiscalization submission or G03 receipt will be issued',
      )
      expect(dialog).toHaveTextContent('reuse its existing fiscalization evidence')
      await user.click(screen.getByRole('button', { name: 'Confirm retry' }))
      await waitFor(() => expect(recoveryApi.retry).toHaveBeenCalledOnce())
      expect(recoveryApi.retry).toHaveBeenCalledWith(kind, requestId, expect.anything())
      await waitFor(() => expect(recoveryApi.get).toHaveBeenCalledTimes(2))
      expect(await screen.findByText('Zoho writeback has succeeded.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Retry Zoho Writeback' })).not.toBeInTheDocument()
    },
  )

  it('hides recovery from viewers and prevents repeated submissions while a request runs', async () => {
    authState.role = 'viewer'
    recoveryApi.get.mockResolvedValue(failed('invoice-request-33'))
    mount('invoice', 'invoice-request-33')
    await screen.findByText('failed')
    expect(screen.queryByRole('button', { name: 'Retry Zoho Writeback' })).not.toBeInTheDocument()

    authState.role = 'operator'
    cleanup()
    recoveryApi.get
      .mockResolvedValueOnce(failed('invoice-request-34'))
      .mockResolvedValue({ ...failed('invoice-request-34'), status: 'in_progress' })
    let resolveRetry!: (value: unknown) => void
    recoveryApi.retry.mockReturnValue(new Promise((resolve) => (resolveRetry = resolve)))
    mount('invoice', 'invoice-request-34')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Retry Zoho Writeback' }))
    await user.click(screen.getByRole('button', { name: 'Confirm retry' }))
    await waitFor(() => expect(recoveryApi.retry).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'Requesting recovery…' })).toBeDisabled()
    resolveRetry({ ...failed('invoice-request-34'), status: 'in_progress' })
    await screen.findByText('in progress')
    expect(screen.queryByRole('button', { name: 'Retry Zoho Writeback' })).not.toBeInTheDocument()
  })

  it.each(['succeeded', 'in_progress'] as const)(
    'does not offer recovery for %s status',
    async (status) => {
      recoveryApi.get.mockResolvedValue({ ...failed('credit-note-request-35'), status })
      mount('credit-note', 'credit-note-request-35')
      await screen.findByText(status.replaceAll('_', ' '))
      expect(screen.queryByRole('button', { name: 'Retry Zoho Writeback' })).not.toBeInTheDocument()
      expect(recoveryApi.retry).not.toHaveBeenCalled()
    },
  )
})
