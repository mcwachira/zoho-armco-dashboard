// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancellationFixture,
  closedReceipt,
  openReceipt,
  unknownReceipt,
} from './__fixtures__/g03-receipt-fixtures'
import type { ReceiptState } from './device-contracts'

const identity = vi.hoisted(() => ({ role: 'admin' as string | undefined }))
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: { role: identity.role } }) }))
vi.mock('./ApiOperationalPages', () => ({ ApiDevice: () => null }))
const clients: QueryClient[] = []
beforeEach(() => {
  vi.stubEnv('DEV', false)
  vi.stubEnv('VITE_DATA_MODE', 'api')
})
afterEach(() => {
  cleanup()
  clients.forEach((client) => client.clear())
  clients.length = 0
  identity.role = 'admin'
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
async function mount(
  observation: ReceiptState = openReceipt,
  cancellation: () => Promise<Response> = async () =>
    json(cancellationFixture('cancelled_and_verified')),
  warning = false,
) {
  const read = vi.fn(async () => json(observation))
  const post = vi.fn(cancellation)
  const fetcher = vi.fn(async (path: string, options?: RequestInit) => {
    if (path === '/api/device/g03/current-receipt' && options?.method === 'GET') return read()
    if (path === '/api/device/g03/cancel-receipt' && options?.method === 'POST') return post()
    throw new Error('Unexpected API path or method')
  })
  vi.stubGlobal('fetch', fetcher)
  const { G03Device, G03PreflightWarning } = await import('./G03Device')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <G03Device />
        {warning && <G03PreflightWarning />}
      </MemoryRouter>
    </QueryClientProvider>,
  )
  if (observation.state === 'UNKNOWN')
    await within(screen.getByRole('region', { name: 'G03 current receipt state' })).findByText(
      /READ_TIMEOUT:/,
    )
  else await screen.findByRole('heading', { name: 'Receipt state: ' + observation.state })
  await waitFor(() => expect(client.getQueryState(['g03-receipt-state'])?.fetchStatus).toBe('idle'))
  return { read, post, fetcher, client }
}
async function confirm() {
  await userEvent.click(screen.getByRole('button', { name: 'Cancel Open Receipt' }))
  const dialog = screen.getByRole('alertdialog')
  expect(dialog).toHaveTextContent('physical G03 device')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm cancellation' }))
}

describe('G03 receipt monitoring with actual same-origin transport', () => {
  it.each([openReceipt, closedReceipt, unknownReceipt])(
    'displays $state with actual diagnostics',
    async (observation) => {
      const { post, fetcher } = await mount(observation, undefined, true)
      const receipt = screen.getByRole('region', { name: 'G03 current receipt state' })
      expect(
        within(receipt).getByRole('heading', { name: 'Receipt state: ' + observation.state }),
      ).toBeInTheDocument()
      expect(within(receipt).getByText('Device connectivity').nextElementSibling).toHaveTextContent(
        observation.device.connectivity,
      )
      const alert = screen.getByRole('link', { name: 'View G03 Device' }).closest('[role]')!
      expect(alert).toHaveAttribute('role', observation.state === 'CLOSED' ? 'status' : 'alert')
      if (observation.state === 'OPEN') {
        expect(alert).toHaveTextContent('G03 has an open fiscal receipt')
        expect(within(receipt).getByText('00042')).toBeInTheDocument()
        expect(within(receipt).getByText('VAT A subtotal').nextElementSibling).toHaveTextContent(
          '10.00',
        )
        expect(
          within(receipt).getByText('Device HTTP status').nextElementSibling,
        ).toHaveTextContent('200')
        expect(
          within(receipt).getByText('Device result code').nextElementSibling,
        ).toHaveTextContent('0')
      } else expect(screen.getByRole('button', { name: 'Cancel Open Receipt' })).toBeDisabled()
      if (observation.state === 'UNKNOWN') expect(alert).toHaveTextContent('READ_TIMEOUT')
      expect(post).not.toHaveBeenCalled()
      for (const [path, options] of fetcher.mock.calls) {
        expect(path).toBe('/api/device/g03/current-receipt')
        expect(options?.headers).toEqual({ Accept: 'application/json' })
        expect(options?.credentials).toBe('same-origin')
      }
    },
  )

  it.each(['operator', 'viewer', undefined])(
    'hides cancellation from %s while allowing reads',
    async (role) => {
      identity.role = role
      const { post } = await mount()
      expect(screen.queryByRole('button', { name: 'Cancel Open Receipt' })).not.toBeInTheDocument()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(post).not.toHaveBeenCalled()
    },
  )

  it('refreshes a CLOSED observation to OPEN', async () => {
    const { read } = await mount(closedReceipt)
    read.mockResolvedValueOnce(json(openReceipt))
    await userEvent.click(screen.getByRole('button', { name: 'Refresh state' }))
    expect(await screen.findByRole('heading', { name: 'Receipt state: OPEN' })).toBeInTheDocument()
    expect(read).toHaveBeenCalledTimes(2)
  })

  it.each(['network', 'malformed', 'UNKNOWN'])(
    'does not retain a known CLOSED state after %s refresh failure',
    async (outcome) => {
      const { read, post } = await mount(closedReceipt)
      if (outcome === 'network') read.mockRejectedValueOnce(new Error('connection lost'))
      else
        read.mockResolvedValueOnce(
          json(outcome === 'malformed' ? { state: 'CLOSED' } : unknownReceipt),
        )
      await userEvent.click(screen.getByRole('button', { name: 'Refresh state' }))
      await screen.findByRole('heading', { name: 'Receipt state: UNKNOWN' })
      expect(screen.getByRole('button', { name: 'Cancel Open Receipt' })).toBeDisabled()
      expect(post).not.toHaveBeenCalled()
    },
  )

  it('keeps mock mode disconnected from the device', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'mock')
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const { G03Device } = await import('./G03Device')
    const client = new QueryClient()
    clients.push(client)
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <G03Device />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Receipt state: UNKNOWN' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel Open Receipt' })).toBeDisabled()
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('administrator G03 cancellation', () => {
  it('requires confirmation, prevents duplicate POSTs and refreshes independently', async () => {
    let finish!: (response: Response) => void
    const pending = new Promise<Response>((resolve) => {
      finish = resolve
    })
    const { read, post, fetcher } = await mount(openReceipt, () => pending)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel Open Receipt' }))
    expect(post).not.toHaveBeenCalled()
    await userEvent.dblClick(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirm cancellation' }),
    )
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: /Cancelling and verifying/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Refresh state' })).toBeDisabled()
    read.mockResolvedValueOnce(json(closedReceipt))
    finish(json(cancellationFixture('cancelled_and_verified')))
    await screen.findByRole('heading', { name: 'Cancellation verified' })
    await screen.findByRole('heading', { name: 'Receipt state: CLOSED' })
    const [path, options] = fetcher.mock.calls.find(([path]) => path.endsWith('cancel-receipt'))!
    expect(path).toBe('/api/device/g03/cancel-receipt')
    expect(options?.body).toBe('{}')
    expect(options?.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    })
    expect(post).toHaveBeenCalledTimes(1)
    expect(read.mock.calls.length).toBeGreaterThan(1)
  })

  it('dismisses confirmation without sending cancellation', async () => {
    const { post } = await mount()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel Open Receipt' }))
    await userEvent.click(screen.getByRole('button', { name: 'Keep receipt' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it.each([
    'no_open_receipt',
    'cancellation_rejected',
    'receipt_still_open',
    'verification_required',
    'cancellation_outcome_unknown',
  ] as const)('shows %s accurately without claiming cancellation success', async (status) => {
    const payload = cancellationFixture(status)
    const { read, post } = await mount(openReceipt, async () =>
      json(payload, payload.success ? 200 : 409),
    )
    await confirm()
    const result = await screen.findByRole(payload.success ? 'status' : 'alert', {
      name: 'Cancellation result',
    })
    expect(result).toHaveTextContent(status)
    expect(screen.queryByRole('heading', { name: 'Cancellation verified' })).not.toBeInTheDocument()
    if (status === 'no_open_receipt') {
      expect(result).toHaveTextContent('No cancellation command was sent')
      expect(screen.getByRole('heading', { name: 'Receipt already closed' })).toBeInTheDocument()
    } else expect(result).toHaveTextContent('Successful cancellation is not confirmed')
    if (payload.cancellationCommand?.error)
      expect(result).toHaveTextContent(payload.cancellationCommand.error.code)
    if (payload.verification?.error)
      expect(result).toHaveTextContent(payload.verification.error.code)
    await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(1))
    expect(post).toHaveBeenCalledTimes(1)
  })

  it.each([
    { verification: null },
    { verification: openReceipt },
    { verification: unknownReceipt },
    { cancellationCommand: null },
  ])('rejects acknowledgement without actual CLOSED proof %#', async (override) => {
    const { read, post } = await mount(openReceipt, async () =>
      json({ ...cancellationFixture('cancelled_and_verified'), ...override }),
    )
    await confirm()
    await screen.findByText('Cancellation unsuccessful or unverified')
    expect(screen.queryByRole('heading', { name: 'Cancellation verified' })).not.toBeInTheDocument()
    await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(1))
    expect(post).toHaveBeenCalledTimes(1)
  })

  it.each([403, 503])('shows useful HTTP %i errors and does not retry POST', async (status) => {
    const { read, post } = await mount(openReceipt, async () =>
      json(
        {
          error: {
            code: 'DEVICE_OPERATION_REJECTED',
            message: 'The administrator device operation was rejected.',
            requestId: 'g03-operation-123',
          },
        },
        status,
      ),
    )
    await confirm()
    expect(
      await screen.findByText(/DEVICE_OPERATION_REJECTED.*g03-operation-123/),
    ).toBeInTheDocument()
    await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(1))
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('refreshes after a lost cancellation response without automatically repeating it', async () => {
    const { read, post } = await mount(openReceipt, async () => {
      throw new Error('network lost')
    })
    read.mockResolvedValueOnce(json(unknownReceipt))
    await confirm()
    expect(await screen.findByText('Cancellation unsuccessful or unverified')).toBeInTheDocument()
    await screen.findByRole('heading', { name: 'Receipt state: UNKNOWN' })
    expect(post).toHaveBeenCalledTimes(1)
  })

  it.each([closedReceipt, unknownReceipt])(
    'disables confirmation if the observation changes to $state',
    async (next) => {
      const { client, post } = await mount()
      await userEvent.click(screen.getByRole('button', { name: 'Cancel Open Receipt' }))
      await act(async () => {
        client.setQueryData(['g03-receipt-state'], next)
      })
      await waitFor(() =>
        expect(
          within(screen.getByRole('alertdialog')).getByRole('button', {
            name: 'Confirm cancellation',
          }),
        ).toBeDisabled(),
      )
      expect(post).not.toHaveBeenCalled()
    },
  )

  it('removes confirmation when administrator access is lost', async () => {
    const { client, post } = await mount()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel Open Receipt' }))
    identity.role = 'viewer'
    await act(async () => {
      client.setQueryData(['g03-receipt-state'], { ...openReceipt, salesNumber: '0044' })
    })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(post).not.toHaveBeenCalled()
  })

  it('releases the duplicate guard if stopping observation queries fails', async () => {
    const { client, post, read } = await mount()
    vi.spyOn(client, 'cancelQueries').mockRejectedValueOnce(
      new Error('Observation could not be paused.'),
    )
    await confirm()
    await screen.findByText('Observation could not be paused.')
    expect(post).not.toHaveBeenCalled()
    await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(1))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Cancel Open Receipt' })).toBeEnabled(),
    )
  })
})
