export type DataMode = 'mock' | 'api'

export interface DataModeConfig {
  mode: DataMode
  configurationError?: string
}

/**
 * Resolve the dashboard data mode without ever treating an absent or invalid
 * setting as permission to use demo data. Mock mode is a development-only,
 * explicit opt-in.
 */
export function resolveDataMode(
  requestedMode: string | undefined,
  isProductionBuild: boolean,
): DataModeConfig {
  const mode = requestedMode?.trim().toLowerCase()

  if (mode === 'mock') {
    return isProductionBuild
      ? {
          mode: 'api',
          configurationError:
            'Mock data mode is disabled in production. Configure VITE_DATA_MODE=api.',
        }
      : { mode: 'mock' }
  }

  if (mode === undefined || mode === '' || mode === 'api') return { mode: 'api' }

  return {
    mode: 'api',
    configurationError: 'Unsupported VITE_DATA_MODE. Configure it as api or mock in development.',
  }
}

export const dataModeConfig = resolveDataMode(import.meta.env.VITE_DATA_MODE, import.meta.env.PROD)
export const refreshIntervalMs = Math.max(
  10_000,
  Number(import.meta.env.VITE_REFRESH_INTERVAL_MS) || 30_000,
)
