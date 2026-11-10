import { describe, expect, it } from 'vitest'
import { resolveDataMode } from './config'

describe('data mode resolution', () => {
  it('requires explicit mock mode during development', () => {
    expect(resolveDataMode('mock', false)).toEqual({ mode: 'mock' })
    expect(resolveDataMode(undefined, false)).toEqual({ mode: 'api' })
  })

  it('selects API mode for a production build with no mode configured', () => {
    expect(resolveDataMode(undefined, true)).toEqual({ mode: 'api' })
  })

  it('does not allow mock mode in production', () => {
    expect(resolveDataMode('mock', true)).toEqual({
      mode: 'api',
      configurationError: 'Mock data mode is disabled in production. Configure VITE_DATA_MODE=api.',
    })
  })

  it('fails closed to API-unavailable for an unknown mode', () => {
    expect(resolveDataMode('demo-ish', true)).toEqual({
      mode: 'api',
      configurationError: 'Unsupported VITE_DATA_MODE. Configure it as api or mock in development.',
    })
  })
})
