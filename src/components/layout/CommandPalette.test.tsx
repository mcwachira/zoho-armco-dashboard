// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import * as demoData from '@/mocks/data'
import { DemoDataProvider } from '@/mocks/demo-data-context'
import { CommandPalette } from './CommandPalette'

afterEach(() => cleanup())

function CurrentPath() {
  const location = useLocation()
  return <output aria-label="Current route">{location.pathname}</output>
}

function renderPalette() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/overview']}>
        <DemoDataProvider value={demoData}>
          <CommandPalette />
          <CurrentPath />
        </DemoDataProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CommandPalette', () => {
  it.each(['Control', 'Meta'] as const)('opens with %s+K', async (modifier) => {
    const user = userEvent.setup()
    renderPalette()

    await user.keyboard(`{${modifier}>}k{/${modifier}}`)

    expect(await screen.findByRole('dialog', { name: 'Dashboard search' })).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Search pages and demo transactions' }),
      ).toHaveFocus(),
    )
  })

  it('finds a demo record by CU receipt number and navigates when selected', async () => {
    const user = userEvent.setup()
    renderPalette()

    await user.keyboard('{Control>}k{/Control}')
    const search = await screen.findByRole('combobox', {
      name: 'Search pages and demo transactions',
    })
    await user.type(search, 'CU-004821')

    const result = await screen.findByRole('option', { name: /INV-2026-0482/ })
    expect(screen.getByText('DEMO DATA')).toBeInTheDocument()
    expect(result).toHaveTextContent('Mara Holdings Ltd')

    await user.click(result)

    await waitFor(() =>
      expect(screen.getByLabelText('Current route')).toHaveTextContent('/fiscalization'),
    )
  })
})
