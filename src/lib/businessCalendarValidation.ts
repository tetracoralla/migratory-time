import type { Temporal } from '@js-temporal/polyfill'
import { resolveTimeZoneInput } from '../data/timeZoneRegistry'
import type { Locale } from '../types'
import { formatIsoDate, parseIsoDate } from './isoCalendar'
import { fingerprintDefinition } from './definitionFingerprint'
import { businessInputError, BusinessCalendarInputError } from './businessCalendarErrors'
import {
  BUSINESS_CALENDAR_SCHEMA_VERSION,
  MAX_BUSINESS_CALENDAR_EXCEPTIONS,
  MAX_BUSINESS_INTERVALS,
  MAX_BUSINESS_INTERVALS_PER_DAY,
  type BusinessCalendar,
  type BusinessHoursInterval,
  type BusinessWeekday,
} from './businessCalendarTypes'

export const BUSINESS_WEEKDAYS: BusinessWeekday[] = [
  'MO',
  'TU',
  'WE',
  'TH',
  'FR',
  'SA',
  'SU',
]

export interface NormalizedBusinessInterval {
  end: string
  endDayOffset: 0 | 1
  endMinute: number
  start: string
  startMinute: number
}

export interface NormalizedBusinessCalendar {
  boundaryPolicies: {
    gap: 'reject' | 'shift_backward' | 'shift_forward'
    overlap: 'earlier' | 'later' | 'reject'
  }
  definitionFingerprint: string
  exceptions: Array<{
    date: string
    intervals: NormalizedBusinessInterval[]
  }>
  id: string
  schemaVersion: typeof BUSINESS_CALENDAR_SCHEMA_VERSION
  timeZone: string
  version: string
  weeklyHours: Record<BusinessWeekday, NormalizedBusinessInterval[]>
}

function parseClockMinute(value: string, field: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  if (!match) {
    businessInputError(
      'INVALID_FORMAT',
      field,
      `${field} must use exact 24-hour HH:mm form.`,
      value,
    )
  }
  return Number(match[1]) * 60 + Number(match[2])
}

function normalizeIntervals(
  intervals: BusinessHoursInterval[],
  field: string,
): NormalizedBusinessInterval[] {
  if (intervals.length > MAX_BUSINESS_INTERVALS_PER_DAY) {
    businessInputError(
      'TOO_MANY_CALENDAR_ENTRIES',
      field,
      `${field} may contain at most ${MAX_BUSINESS_INTERVALS_PER_DAY} intervals.`,
    )
  }
  const normalized = intervals.map((interval, index) => {
    const startMinute = parseClockMinute(interval.start, `${field}[${index}].start`)
    const endMinute = parseClockMinute(interval.end, `${field}[${index}].end`)
    const endDayOffset = interval.endDayOffset ?? 0
    const duration = endDayOffset * 1_440 + endMinute - startMinute
    if (duration <= 0 || duration > 1_440) {
      businessInputError(
        'INVALID_BUSINESS_CALENDAR',
        `${field}[${index}]`,
        'Each business interval must be positive and at most 24 hours; use endDayOffset: 1 only for an explicit overnight interval.',
      )
    }
    return {
      end: interval.end,
      endDayOffset,
      endMinute,
      start: interval.start,
      startMinute,
    }
  }).sort((left, right) => left.startMinute - right.startMinute)

  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1]
    const previousEnd = previous.endDayOffset * 1_440 + previous.endMinute
    if (normalized[index].startMinute < previousEnd) {
      businessInputError(
        'INVALID_BUSINESS_CALENDAR',
        field,
        `${field} contains overlapping local business intervals.`,
      )
    }
  }
  return normalized
}

function assertAdjacentIntervals(
  previous: NormalizedBusinessInterval[],
  current: NormalizedBusinessInterval[],
  field: string,
) {
  const earliestCurrent = current[0]?.startMinute
  if (earliestCurrent === undefined) return
  if (
    previous.some(
      (interval) => interval.endDayOffset === 1 && interval.endMinute > earliestCurrent,
    )
  ) {
    businessInputError(
      'INVALID_BUSINESS_CALENDAR',
      field,
      'An overnight interval overlaps the following local date business hours.',
    )
  }
}

function canonicalTimeZone(timeZone: string, locale: Locale) {
  const resolution = resolveTimeZoneInput(timeZone, locale)
  if (resolution.status === 'resolved') return resolution.timeZone.id
  if (resolution.status === 'ambiguous') {
    throw new BusinessCalendarInputError({
      candidates: resolution.candidates,
      code: 'AMBIGUOUS_TIME_ZONE',
      field: 'calendar.timeZone',
      input: timeZone,
      message: 'calendar.timeZone matches more than one zone; use one candidate IANA id.',
    })
  }
  businessInputError(
    'UNKNOWN_TIME_ZONE',
    'calendar.timeZone',
    'calendar.timeZone is not a known IANA time zone or unambiguous region name.',
    timeZone,
  )
}

function parseCalendarDate(value: string, field: string) {
  const parsed = parseIsoDate(value)
  if (parsed.status === 'unsupported_year') {
    businessInputError(
      'UNSUPPORTED_YEAR',
      field,
      `${field} must use year 1901 or later.`,
      value,
    )
  }
  if (parsed.status === 'invalid') {
    businessInputError(
      'INVALID_FORMAT',
      field,
      `${field} must name a real ISO date in exact YYYY-MM-DD form.`,
      value,
    )
  }
  return parsed.date
}

function weekdayOf(date: Temporal.PlainDate): BusinessWeekday {
  return BUSINESS_WEEKDAYS[date.dayOfWeek - 1]
}

export function businessIntervalsForDate(
  calendar: NormalizedBusinessCalendar,
  date: Temporal.PlainDate,
) {
  const dateString = formatIsoDate(date)
  const exception = calendar.exceptions.find((item) => item.date === dateString)
  return exception?.intervals ?? calendar.weeklyHours[weekdayOf(date)]
}

export function normalizeBusinessCalendar(
  input: BusinessCalendar,
  locale: Locale,
): NormalizedBusinessCalendar {
  if (input.schemaVersion !== BUSINESS_CALENDAR_SCHEMA_VERSION) {
    businessInputError(
      'INVALID_BUSINESS_CALENDAR',
      'calendar.schemaVersion',
      `calendar.schemaVersion must be ${BUSINESS_CALENDAR_SCHEMA_VERSION}.`,
      input.schemaVersion,
    )
  }
  const id = input.id.trim()
  const version = input.version.trim()
  if (!id || id.length > 128) {
    businessInputError(
      'INVALID_BUSINESS_CALENDAR',
      'calendar.id',
      'calendar.id must contain 1 to 128 non-whitespace characters.',
      input.id,
    )
  }
  if (!version || version.length > 64) {
    businessInputError(
      'INVALID_BUSINESS_CALENDAR',
      'calendar.version',
      'calendar.version must contain 1 to 64 non-whitespace characters.',
      input.version,
    )
  }

  const weeklyHours = Object.fromEntries(
    BUSINESS_WEEKDAYS.map((weekday) => [
      weekday,
      normalizeIntervals(input.weeklyHours[weekday] ?? [], `calendar.weeklyHours.${weekday}`),
    ]),
  ) as Record<BusinessWeekday, NormalizedBusinessInterval[]>

  for (let index = 0; index < BUSINESS_WEEKDAYS.length; index += 1) {
    const previous = BUSINESS_WEEKDAYS[(index + BUSINESS_WEEKDAYS.length - 1) % BUSINESS_WEEKDAYS.length]
    const current = BUSINESS_WEEKDAYS[index]
    assertAdjacentIntervals(
      weeklyHours[previous],
      weeklyHours[current],
      `calendar.weeklyHours.${current}`,
    )
  }

  if ((input.exceptions?.length ?? 0) > MAX_BUSINESS_CALENDAR_EXCEPTIONS) {
    businessInputError(
      'TOO_MANY_CALENDAR_ENTRIES',
      'calendar.exceptions',
      `calendar.exceptions may contain at most ${MAX_BUSINESS_CALENDAR_EXCEPTIONS} dates.`,
    )
  }
  const exceptionDates = new Set<string>()
  const exceptions = (input.exceptions ?? []).map((exception, index) => {
    const date = parseCalendarDate(exception.date, `calendar.exceptions[${index}].date`)
    const canonicalDate = formatIsoDate(date)
    if (exceptionDates.has(canonicalDate)) {
      businessInputError(
        'DUPLICATE_EXCEPTION_DATE',
        'calendar.exceptions',
        'calendar.exceptions must not contain the same local date twice.',
        canonicalDate,
      )
    }
    exceptionDates.add(canonicalDate)
    return {
      date: canonicalDate,
      intervals: normalizeIntervals(
        exception.intervals,
        `calendar.exceptions[${index}].intervals`,
      ),
    }
  }).sort((left, right) => left.date.localeCompare(right.date))

  const intervalCount = BUSINESS_WEEKDAYS.reduce(
    (count, weekday) => count + weeklyHours[weekday].length,
    0,
  ) + exceptions.reduce((count, exception) => count + exception.intervals.length, 0)
  if (intervalCount > MAX_BUSINESS_INTERVALS) {
    businessInputError(
      'TOO_MANY_CALENDAR_ENTRIES',
      'calendar',
      `The calendar may contain at most ${MAX_BUSINESS_INTERVALS} weekly and exception intervals in total.`,
    )
  }

  const timeZone = canonicalTimeZone(input.timeZone, locale)
  const boundaryPolicies = {
    gap: input.boundaryPolicies?.gap ?? 'reject',
    overlap: input.boundaryPolicies?.overlap ?? 'reject',
  } as const
  const withoutFingerprint = {
    boundaryPolicies,
    exceptions,
    id,
    schemaVersion: BUSINESS_CALENDAR_SCHEMA_VERSION,
    timeZone,
    version,
    weeklyHours,
  }
  const fingerprintInterval = ({
    end,
    endDayOffset,
    start,
  }: NormalizedBusinessInterval) => ({ end, endDayOffset, start })
  const fingerprintValue = {
    boundaryPolicies,
    exceptions: exceptions.map((exception) => ({
      date: exception.date,
      intervals: exception.intervals.map(fingerprintInterval),
    })),
    schemaVersion: BUSINESS_CALENDAR_SCHEMA_VERSION,
    timeZone,
    weeklyHours: Object.fromEntries(
      BUSINESS_WEEKDAYS.map((weekday) => [
        weekday,
        weeklyHours[weekday].map(fingerprintInterval),
      ]),
    ),
  }
  const calendar: NormalizedBusinessCalendar = {
    ...withoutFingerprint,
    definitionFingerprint: fingerprintDefinition(fingerprintValue),
  }

  for (const exception of exceptions) {
    const date = parseCalendarDate(exception.date, 'calendar.exceptions.date')
    const previousDate = date.subtract({ days: 1 })
    const nextDate = date.add({ days: 1 })
    assertAdjacentIntervals(
      businessIntervalsForDate(calendar, previousDate),
      businessIntervalsForDate(calendar, date),
      `calendar.exceptions.${exception.date}`,
    )
    assertAdjacentIntervals(
      businessIntervalsForDate(calendar, date),
      businessIntervalsForDate(calendar, nextDate),
      `calendar.exceptions.${exception.date}`,
    )
  }

  return calendar
}
