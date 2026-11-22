// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancellationFixture,
  closedReceipt,
  openReceipt,
  unknownReceipt,
  verifiedCancellation,
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
async function mount(observation: ReceiptState = openReceipt, warning = false) {
  const read = vi.fn(async () => json(observation))
  const post = vi.fn(async () => json(verifiedCancellation))
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
describe('G03 receipt monitoring with actual same-origin transport', () => {
  it.each([openReceipt, closedReceipt, unknownReceipt])(
    'displays $state with actual diagnostics',
    async (observation) => {
      const { post, fetcher } = await mount(observation, true)
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
      }
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
      expect(screen.getByText(/available only to administrators/)).toBeInTheDocument()
      expect(post).not.toHaveBeenCalled()
    },
  )

  it('requires explicit administrator confirmation and reports verified cancellation', async () => {
    const user = userEvent.setup()
    const { post, read, fetcher } = await mount(openReceipt)
    read.mockResolvedValueOnce(json(closedReceipt))
    const trigger = screen.getByRole('button', { name: 'Cancel Open Receipt' })
    expect(trigger).toBeEnabled()
    await user.click(trigger)
    expect(
      screen.getByRole('alertdialog', { name: 'Cancel the open physical receipt?' }),
    ).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }))
    expect(await screen.findByText('Cancellation verified')).toBeInTheDocument()
    expect(post).toHaveBeenCalledOnce()
    expect(read).toHaveBeenCalledTimes(2)
    expect(fetcher).toHaveBeenCalledWith(
      '/api/device/g03/cancel-receipt',
      expect.objectContaining({ method: 'POST', body: '{}', credentials: 'same-origin' }),
    )
    expect(screen.getByRole('heading', { name: 'Receipt state: CLOSED' })).toBeInTheDocument()
  })

  it.each([closedReceipt, unknownReceipt])(
    'does not allow cancellation when latest state is $state',
    async (observation) => {
      const { post } = await mount(observation)
      expect(screen.queryByRole('button', { name: 'Cancel Open Receipt' })).not.toBeInTheDocument()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(post).not.toHaveBeenCalled()
    },
  )

  it.each([
    'cancellation_rejected',
    'receipt_still_open',
    'verification_required',
    'cancellation_outcome_unknown',
  ] as const)('shows %s as unconfirmed without claiming success', async (status) => {
    const user = userEvent.setup()
    const { post } = await mount()
    post.mockResolvedValueOnce(json(cancellationFixture(status), 409))
    await user.click(screen.getByRole('button', { name: 'Cancel Open Receipt' }))
    await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }))
    const heading =
      status === 'cancellation_outcome_unknown'
        ? 'Cancellation outcome uncertain'
        : 'Cancellation unsuccessful'
    const result = (await screen.findByText(heading)).closest('[role="alert"]')
    expect(result).toHaveTextContent(
      status === 'cancellation_outcome_unknown'
        ? 'The cancellation outcome is unknown.'
        : status === 'receipt_still_open'
          ? 'The verification read reports OPEN.'
          : status === 'verification_required'
            ? 'The receipt state could not be verified.'
            : 'The device rejected cancellation.',
    )
    expect(result).not.toHaveTextContent('Cancellation verified')
  })

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
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
