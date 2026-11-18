// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { OverviewDateFilters, resolveOverviewDateRange } from './OverviewDateFilters'

afterEach(cleanup)
const rolling = {
  createdFrom: '2026-11-17T12:00:00.000Z',
  createdTo: '2026-11-18T12:00:00.000Z',
}
const resolve = (createdFrom: string, createdTo: string) =>
  resolveOverviewDateRange(new URLSearchParams({ createdFrom, createdTo }), rolling)

function Location() {
  return <output aria-label="Current URL">{useLocation().search}</output>
}

describe('Overview custom date contract', () => {
  it('preserves the selected rolling default when no custom range is applied', () => {
    expect(resolveOverviewDateRange(new URLSearchParams(), rolling)).toEqual({
      range: rolling,
      valid: true,
      custom: false,
      error: undefined,
    })
  })

  it('includes calendar day boundaries in Nairobi without UTC date drift', () => {
    expect(resolve('2026-11-01', '2026-11-18').range).toEqual({
      createdFrom: '2026-11-01T00:00:00.000+03:00',
      createdTo: '2026-11-18T23:59:59.999+03:00',
    })
  })

  it.each(['+03:00', '-05:00', 'Z'])('preserves offset-aware ISO values with %s', (offset) => {
    const from = '2026-11-01T00:00:00.123' + offset
    const to = '2026-11-18T23:59:59.999' + offset
    expect(resolve(from, to)).toMatchObject({
      valid: true,
      range: { createdFrom: from, createdTo: to },
    })
  })

  it('accepts exactly 366 elapsed days and rejects one additional millisecond', () => {
    expect(resolve('2024-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z').valid).toBe(true)
    expect(resolve('2024-01-01T00:00:00.000Z', '2025-01-01T00:00:00.001Z')).toMatchObject({
      valid: false,
      error: 'Date range must be ordered and no longer than 366 days.',
    })
  })

  it.each([
    ['2026-02-30', '2026-03-01'],
    ['2026-11-18', '2026-11-01'],
    ['2026-11-01T00:00:00', '2026-11-18T00:00:00'],
    ['2024-01-01', '2025-01-01'],
    ['', '2026-11-18'],
  ])(
    'rejects an invalid custom range %s / %s without substituting a valid selection',
    (from, to) => {
      const result = resolve(from, to)
      expect(result.valid).toBe(false)
      expect(result.error).toBeTruthy()
    },
  )

  it('rejects duplicate or incomplete URL bounds', () => {
    for (const query of [
      'createdFrom=2026-11-01',
      'createdTo=2026-11-18',
      'createdFrom=2026-11-01&createdFrom=2026-11-02&createdTo=2026-11-18',
    ])
      expect(resolveOverviewDateRange(new URLSearchParams(query), rolling).valid).toBe(false)
  })

  it('applies only canonical ISO parameters and can restore the rolling selection', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/overview?from=old&to=old']}>
        <OverviewDateFilters />
        <Location />
      </MemoryRouter>,
    )
    await user.type(screen.getByLabelText('Created from (Nairobi)'), '2026-11-01')
    await user.type(screen.getByLabelText('Created to (Nairobi)'), '2026-11-18')
    await user.click(screen.getByRole('button', { name: 'Apply date range' }))
    const params = new URLSearchParams(screen.getByLabelText('Current URL').textContent!)
    expect(Object.fromEntries(params)).toEqual({
      createdFrom: '2026-11-01T00:00:00.000+03:00',
      createdTo: '2026-11-18T23:59:59.999+03:00',
    })
    expect(screen.getByLabelText('Current URL').textContent).toContain('%2B03%3A00')
    await user.click(screen.getByRole('button', { name: 'Use rolling range' }))
    expect(screen.getByLabelText('Current URL')).toBeEmptyDOMElement()
  })

  it('explains invalid user input without changing the applied range', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <OverviewDateFilters />
        <Location />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: 'Apply date range' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose both a start and an end date.')
    expect(screen.getByLabelText('Current URL')).toBeEmptyDOMElement()
    await user.type(screen.getByLabelText('Created from (Nairobi)'), '2026-11-18')
    await user.type(screen.getByLabelText('Created to (Nairobi)'), '2026-11-01')
    await user.click(screen.getByRole('button', { name: 'Apply date range' }))
    expect(screen.getByRole('alert')).toHaveTextContent('ordered and no longer than 366 days')
    expect(screen.getByLabelText('Current URL')).toBeEmptyDOMElement()
  })
})
