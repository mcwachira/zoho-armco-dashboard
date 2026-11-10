import { describe, expect, it } from 'vitest'
import { alerts, events, services, submissions } from './data'

describe('demo operational snapshot', () => {
  it('uses unique request and document identifiers', () => {
    expect(new Set(submissions.map((item) => item.id)).size).toBe(submissions.length)
    expect(new Set(submissions.map((item) => item.documentId)).size).toBe(submissions.length)
  })

  it('keeps confirmed receipt evidence attached to fiscalized records', () => {
    for (const item of submissions.filter((record) => record.cuReceiptNumber)) {
      expect(item.status).toBe('fiscalized')
      expect(item.qrAvailable).toBe(true)
    }
    for (const item of submissions.filter((record) => record.writeback === 'failed')) {
      expect(item.status).toBe('fiscalized')
      expect(item.cuReceiptNumber).toBeTruthy()
      expect(item.writebackError).toBeTruthy()
    }
  })

  it('explains manual review and uncertain outcomes', () => {
    const cases = submissions.filter((item) =>
      ['manual_review', 'outcome_unknown'].includes(item.status),
    )
    expect(cases.length).toBeGreaterThan(0)
    expect(cases.every((item) => item.reviewReason || item.error)).toBe(true)
  })

  it('keeps unverified device readiness and eTIMS states explicit', () => {
    expect(services.find((item) => item.name === 'KRA / eTIMS')?.status).toBe('unknown')
    expect(services.find((item) => item.name === 'Tremol G03')?.detail).toContain('unverified')
    expect(submissions.every((item) => !item.etimsReceiptNumber)).toBe(true)
  })

  it('has operational activity and alerts for monitoring views', () => {
    expect(events.length).toBeGreaterThan(0)
    expect(alerts.length).toBeGreaterThan(0)
    expect(submissions.some((item) => item.writeback === 'failed')).toBe(true)
  })
})
