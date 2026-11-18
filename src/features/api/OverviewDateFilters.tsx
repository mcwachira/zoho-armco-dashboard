import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ZodError } from 'zod'
import { serializeOverviewRange } from './overview-dates'
import type { DashboardOverviewParams } from './queries'
import './documents.css'

export function overviewDateError(error: unknown) {
  if (error instanceof ZodError) {
    const rangeIssue = error.issues.find((issue) => issue.code === 'custom')
    if (rangeIssue) return rangeIssue.message
  }
  return 'Choose valid calendar dates or ISO datetimes with an explicit time-zone offset.'
}

export function resolveOverviewDateRange(
  params: URLSearchParams,
  rollingRange: DashboardOverviewParams,
) {
  const custom = params.has('createdFrom') || params.has('createdTo')
  if (!custom) return { range: rollingRange, valid: true, error: undefined, custom: false }
  if (
    params.getAll('createdFrom').length !== 1 ||
    params.getAll('createdTo').length !== 1 ||
    !params.get('createdFrom') ||
    !params.get('createdTo')
  )
    return {
      range: rollingRange,
      valid: false,
      custom: true,
      error: 'Choose both a start and an end date, with each parameter supplied once.',
    }
  try {
    return {
      range: serializeOverviewRange({
        createdFrom: params.get('createdFrom')!,
        createdTo: params.get('createdTo')!,
      }),
      valid: true,
      error: undefined,
      custom: true,
    }
  } catch (error) {
    return { range: rollingRange, valid: false, custom: true, error: overviewDateError(error) }
  }
}

export function useOverviewDateRange(rollingRange: DashboardOverviewParams) {
  const [params] = useSearchParams()
  return resolveOverviewDateRange(params, rollingRange)
}

export function OverviewDateFilters({ error }: { error?: string }) {
  const [params, setParams] = useSearchParams()
  const appliedFrom = params.get('createdFrom')?.slice(0, 10) ?? ''
  const appliedTo = params.get('createdTo')?.slice(0, 10) ?? ''
  const [from, setFrom] = useState(appliedFrom)
  const [to, setTo] = useState(appliedTo)
  const [validation, setValidation] = useState<string>()
  useEffect(() => {
    setFrom(appliedFrom)
    setTo(appliedTo)
    setValidation(undefined)
  }, [appliedFrom, appliedTo])
  return (
    <section className="panel document-controls" aria-label="Overview date range">
      <form
        className="document-filter-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (!from || !to) {
            setValidation('Choose both a start and an end date.')
            return
          }
          try {
            const dates = serializeOverviewRange({ createdFrom: from, createdTo: to })
            setValidation(undefined)
            setParams((current) => {
              const next = new URLSearchParams(current)
              next.delete('from')
              next.delete('to')
              next.set('createdFrom', dates.createdFrom)
              next.set('createdTo', dates.createdTo)
              return next
            })
          } catch (issue) {
            setValidation(overviewDateError(issue))
          }
        }}
      >
        <label>
          Created from (Nairobi)
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          Created to (Nairobi)
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button className="button secondary" type="submit">
          Apply date range
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={() => {
            setFrom('')
            setTo('')
            setValidation(undefined)
            setParams((current) => {
              const next = new URLSearchParams(current)
              for (const name of ['createdFrom', 'createdTo', 'from', 'to']) next.delete(name)
              return next
            })
          }}
        >
          Use rolling range
        </button>
      </form>
      <p className="api-note">
        Custom dates include the whole selected days in Africa/Nairobi. Maximum range: 366 days.
      </p>
      {(validation || error) && <p role="alert">{validation || error}</p>}
    </section>
  )
}
