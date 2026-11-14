import { beforeAll, describe, expect, it } from 'vitest'
import { handleDashboardRequest, type ApiResponse } from './dashboard-gateway'

// Explicit opt-in: normal tests never contact desktop or production middleware.
describe.skipIf(process.env.DASHBOARD_DESKTOP_TEST !== '1')('desktop middleware :3004', () => {
  const base = 'http://127.0.0.1:3004'
  const token = process.env.DASHBOARD_DESKTOP_TEST_TOKEN
  const end = new Date()
  const start = new Date(end.getTime() - 7 * 86_400_000)
  const dates = new URLSearchParams({
    createdFrom: start.toISOString(),
    createdTo: end.toISOString(),
  })

  beforeAll(() => {
    if (!token)
      throw new Error(
        'Supply the desktop-only DASHBOARD_DESKTOP_TEST_TOKEN before running integration tests.',
      )
  })

  it.each([
    `overview?${dates}`,
    `invoices?page=1&pageSize=1&${dates}`,
    `invoices?page=2&pageSize=1&${dates}`,
    `credit-notes?page=1&pageSize=1&${dates}`,
    `credit-notes?page=2&pageSize=1&${dates}`,
    'services',
  ])('loads and validates %s through the dashboard handler', async (resource) => {
    let status = 0
    let body: unknown
    const res: ApiResponse = {
      setHeader() {
        return res
      },
      status(value) {
        status = value
        return res
      },
      json(value) {
        body = value
      },
    }
    await handleDashboardRequest(
      { method: 'GET', url: `/api/dashboard/${resource}`, headers: {} },
      res,
      {
        authorize: () => ({
          email: 'desktop-test@example.invalid',
          role: 'viewer',
          expiresAt: Date.now() + 60_000,
        }),
        fetch,
        env: {
          NODE_ENV: 'test',
          DASHBOARD_UPSTREAM_BASE_URL: base,
          DASHBOARD_UPSTREAM_TOKEN: token,
        },
      },
    )
    // Do not print operational payloads or credentials in failed assertions.
    expect(status).toBe(200)
    if (resource.startsWith('invoices?') || resource.startsWith('credit-notes?')) {
      const page = body as { page: number; pageSize: number; items: { createdAt: string }[] }
      expect(page.page).toBe(resource.includes('page=2') ? 2 : 1)
      expect(page.pageSize).toBe(1)
      expect(page.items.length).toBeLessThanOrEqual(1)
      expect(
        page.items.every(
          (item) =>
            Date.parse(item.createdAt) >= start.getTime() &&
            Date.parse(item.createdAt) <= end.getTime(),
        ),
      ).toBe(true)
    }
  })

  it.each([undefined, 'invalid-desktop-credential'])(
    'rejects an unauthorized middleware read',
    async (credential) => {
      const response = await fetch(`${base}/api/dashboard/services`, {
        headers: credential ? { Authorization: `Bearer ${credential}` } : {},
        redirect: 'error',
        signal: AbortSignal.timeout(8_000),
      })
      expect([401, 403].includes(response.status)).toBe(true)
      await response.body?.cancel()
    },
  )
})
