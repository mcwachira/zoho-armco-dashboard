import { z } from 'zod'
import { dashboardOverviewQueryParamsSchema } from './schemas'

const calendarDateSchema = z.string().date()

// Match the dashboard's explicit Nairobi timestamp display convention
// (document-provisional.ts). Rolling UTC instants are not calendar dates.
const calendarOffset = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Nairobi',
  timeZoneName: 'longOffset',
})

function calendarBoundary(value: string, end: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  calendarDateSchema.parse(value)

  // Use noon only to look up the IANA zone's offset for the selected day.
  // Never round-trip the selected date through UTC or the browser's timezone.
  const offsetName = calendarOffset
    .formatToParts(new Date(value + 'T12:00:00.000Z'))
    .find((part) => part.type === 'timeZoneName')!.value
  const offset = offsetName === 'GMT' ? '+00:00' : offsetName.replace(/^GMT/, '')
  return value + (end ? 'T23:59:59.999' : 'T00:00:00.000') + offset
}

/** Normalize calendar inputs before enforcing the existing wire contract. */
export function serializeOverviewRange(params: { createdFrom: string; createdTo: string }) {
  return dashboardOverviewQueryParamsSchema.parse({
    ...params,
    createdFrom: calendarBoundary(params.createdFrom, false),
    createdTo: calendarBoundary(params.createdTo, true),
  })
}
