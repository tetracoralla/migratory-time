import type { Temporal } from '@js-temporal/polyfill'
import { resolveTimeZoneInput } from '../data/timeZoneRegistry'
import {
  formatIsoLocalMinute,
  parseIsoDate,
  parseIsoLocalMinute,
} from './isoCalendar'
import { ScheduleInputError, scheduleInputError } from './scheduleErrors'
import {
  MAX_SCHEDULE_INTERVAL,
  type NormalizedScheduleRule,
  type ExpandScheduleInput,
  type ScheduleConflict,
  type ScheduleEffect,
  type SchedulePolicies,
  type ScheduleWeekday,
} from './scheduleTypes'
import { getTemporal } from './temporal'

const WEEKDAY_NUMBER: Record<ScheduleWeekday, number> = {
  FR: 5,
  MO: 1,
  SA: 6,
  SU: 7,
  TH: 4,
  TU: 2,
  WE: 3,
}

export interface ScheduleCandidate {
  localDateTime: string
  sources: Set<'rdate' | 'rule'>
}

export interface NormalizedSchedulePolicies {
  gap: NonNullable<SchedulePolicies['gap']>
  monthOverflow: NonNullable<SchedulePolicies['monthOverflow']>
  overlap: NonNullable<SchedulePolicies['overlap']>
}

export function parseScheduleLocalDateTime(
  value: string,
  field: string,
  invalidFormatCode: 'INVALID_CURSOR' | 'INVALID_FORMAT' = 'INVALID_FORMAT',
) {
  const parsed = parseIsoLocalMinute(value, 'T')
  if (parsed.status === 'unsupported_year') {
    scheduleInputError(
      'UNSUPPORTED_YEAR',
      field,
      `${field} must use year 1901 or later.`,
      value,
    )
  }
  if (parsed.status === 'invalid') {
    scheduleInputError(
      invalidFormatCode,
      field,
      `${field} must name a real ISO calendar minute in exact YYYY-MM-DDTHH:mm form.`,
      value,
    )
  }
  return parsed.dateTime
}

export function parseScheduleWindowDate(value: string, field: string) {
  const parsed = parseIsoDate(value)
  if (parsed.status === 'unsupported_year') {
    scheduleInputError(
      'UNSUPPORTED_YEAR',
      field,
      `${field} must use year 1901 or later.`,
      value,
    )
  }
  if (parsed.status === 'invalid') {
    scheduleInputError(
      'INVALID_FORMAT',
      field,
      `${field} must name a real ISO date in exact YYYY-MM-DD form.`,
      value,
    )
  }
  return parsed.date
}

export function canonicalScheduleTimeZone(
  timeZone: string,
  locale: 'en' | 'zh',
) {
  const resolution = resolveTimeZoneInput(timeZone, locale)
  if (resolution.status === 'resolved') return resolution.timeZone.id
  if (resolution.status === 'ambiguous') {
    throw new ScheduleInputError({
      candidates: resolution.candidates,
      code: 'AMBIGUOUS_TIME_ZONE',
      field: 'timeZone',
      input: timeZone,
      message: 'timeZone matches more than one zone; use one candidate IANA id.',
    })
  }
  scheduleInputError(
    'UNKNOWN_TIME_ZONE',
    'timeZone',
    'timeZone is not a known IANA time zone or unambiguous region name.',
    timeZone,
  )
}

export function assertUniqueScheduleValues(values: string[], field: string) {
  if (new Set(values).size !== values.length) {
    scheduleInputError(
      'DUPLICATE_SCHEDULE_DATE',
      field,
      `${field} must not contain duplicate local date-times.`,
    )
  }
}

export function normalizeSchedulePolicies(
  policies: SchedulePolicies | undefined,
): NormalizedSchedulePolicies {
  return {
    gap: policies?.gap ?? 'reject',
    monthOverflow: policies?.monthOverflow ?? 'reject',
    overlap: policies?.overlap ?? 'reject',
  }
}

export function normalizeScheduleRule(
  rule: ExpandScheduleInput['rule'],
  scheduleStart: Temporal.PlainDateTime,
): NormalizedScheduleRule {
  const interval = rule.interval ?? 1
  if (!Number.isInteger(interval) || interval < 1 || interval > MAX_SCHEDULE_INTERVAL) {
    scheduleInputError(
      'INVALID_SCHEDULE',
      'rule.interval',
      `rule.interval must be an integer from 1 to ${MAX_SCHEDULE_INTERVAL}.`,
    )
  }
  if (rule.frequency !== 'weekly') return { frequency: rule.frequency, interval }

  const requested = rule.weekdays ?? [
    (Object.entries(WEEKDAY_NUMBER).find(
      ([, number]) => number === scheduleStart.dayOfWeek,
    )?.[0] ?? 'MO') as ScheduleWeekday,
  ]
  if (!requested.length || new Set(requested).size !== requested.length) {
    scheduleInputError(
      'INVALID_SCHEDULE',
      'rule.weekdays',
      'rule.weekdays must contain one or more unique weekday codes.',
    )
  }
  return {
    frequency: 'weekly',
    interval,
    weekdays: [...requested].sort(
      (left, right) => WEEKDAY_NUMBER[left] - WEEKDAY_NUMBER[right],
    ),
  }
}

function monthIntersectsWindow(
  yearMonth: Temporal.PlainYearMonth,
  windowStart: Temporal.PlainDate,
  windowEnd: Temporal.PlainDate,
) {
  const first = getTemporal().PlainDate.from({
    day: 1,
    month: yearMonth.month,
    year: yearMonth.year,
  })
  const after = first.add({ months: 1 })
  return (
    getTemporal().PlainDate.compare(after, windowStart) > 0
    && getTemporal().PlainDate.compare(first, windowEnd) < 0
  )
}

export function addScheduleCandidate(
  candidates: Map<string, ScheduleCandidate>,
  dateTime: Temporal.PlainDateTime,
  source: 'rdate' | 'rule',
  scheduleStart: Temporal.PlainDateTime,
  windowStart: Temporal.PlainDate,
  windowEnd: Temporal.PlainDate,
  cursor: Temporal.PlainDateTime | undefined,
) {
  const date = dateTime.toPlainDate()
  if (source === 'rule' && getTemporal().PlainDateTime.compare(dateTime, scheduleStart) < 0) {
    return
  }
  if (
    getTemporal().PlainDate.compare(date, windowStart) < 0
    || getTemporal().PlainDate.compare(date, windowEnd) >= 0
    || (cursor && getTemporal().PlainDateTime.compare(dateTime, cursor) <= 0)
  ) {
    return
  }
  const localDateTime = formatIsoLocalMinute(dateTime)
  const existing = candidates.get(localDateTime)
  if (existing) {
    existing.sources.add(source)
  } else {
    candidates.set(localDateTime, { localDateTime, sources: new Set([source]) })
  }
}

export function generateScheduleCandidates(
  input: ExpandScheduleInput,
  scheduleStart: Temporal.PlainDateTime,
  windowStart: Temporal.PlainDate,
  windowEnd: Temporal.PlainDate,
  cursor: Temporal.PlainDateTime | undefined,
  policies: NormalizedSchedulePolicies,
  effects: ScheduleEffect[],
): { candidates: Map<string, ScheduleCandidate>; conflict?: ScheduleConflict } {
  const candidates = new Map<string, ScheduleCandidate>()
  const normalizedRule = normalizeScheduleRule(input.rule, scheduleStart)
  const interval = normalizedRule.interval

  if (input.rule.frequency === 'daily') {
    const daysToWindow = scheduleStart.toPlainDate().until(windowStart).days
    const skippedIntervals = daysToWindow > 0
      ? Math.floor(daysToWindow / interval)
      : 0
    let firstCandidate = scheduleStart.add({
      days: skippedIntervals * interval,
    })
    while (
      getTemporal().PlainDate.compare(firstCandidate.toPlainDate(), windowStart) < 0
    ) {
      firstCandidate = firstCandidate.add({ days: interval })
    }
    for (
      let current = firstCandidate;
      getTemporal().PlainDate.compare(current.toPlainDate(), windowEnd) < 0;
      current = current.add({ days: interval })
    ) {
      addScheduleCandidate(
        candidates,
        current,
        'rule',
        scheduleStart,
        windowStart,
        windowEnd,
        cursor,
      )
    }
    return { candidates }
  }

  if (normalizedRule.frequency === 'weekly') {
    const weekdays = normalizedRule.weekdays
      .map((weekday) => WEEKDAY_NUMBER[weekday])
    const anchorWeekStart = scheduleStart
      .toPlainDate()
      .subtract({ days: scheduleStart.dayOfWeek - 1 })
    const daysToWindow = anchorWeekStart.until(windowStart).days
    const skippedIntervals = daysToWindow > 0
      ? Math.floor(Math.floor(daysToWindow / 7) / interval)
      : 0
    let weekStart = anchorWeekStart.add({
      weeks: skippedIntervals * interval,
    })
    while (
      getTemporal().PlainDate.compare(weekStart.add({ days: 7 }), windowStart) <= 0
    ) {
      weekStart = weekStart.add({ weeks: interval })
    }
    while (getTemporal().PlainDate.compare(weekStart, windowEnd) < 0) {
      for (const weekday of weekdays) {
        const date = weekStart.add({ days: weekday - 1 })
        addScheduleCandidate(
          candidates,
          date.toPlainDateTime(scheduleStart.toPlainTime()),
          'rule',
          scheduleStart,
          windowStart,
          windowEnd,
          cursor,
        )
      }
      weekStart = weekStart.add({ weeks: interval })
    }
    return { candidates }
  }

  const requestedDay = scheduleStart.day
  let yearMonth = getTemporal().PlainYearMonth.from({
    month: scheduleStart.month,
    year: scheduleStart.year,
  })
  const monthsToWindow =
    (windowStart.year - yearMonth.year) * 12
    + windowStart.month
    - yearMonth.month
  if (monthsToWindow > 0) {
    yearMonth = yearMonth.add({
      months: Math.floor(monthsToWindow / interval) * interval,
    })
  }
  while (
    getTemporal().PlainDate.compare(
      getTemporal().PlainDate.from({
        day: 1,
        month: yearMonth.month,
        year: yearMonth.year,
      }),
      windowEnd,
    ) < 0
  ) {
    let date: Temporal.PlainDate | undefined
    try {
      date = getTemporal().PlainDate.from(
        { day: requestedDay, month: yearMonth.month, year: yearMonth.year },
        { overflow: 'reject' },
      )
    } catch {
      if (monthIntersectsWindow(yearMonth, windowStart, windowEnd)) {
        const calendarMonth = `${String(yearMonth.year).padStart(4, '0')}-${String(yearMonth.month).padStart(2, '0')}`
        if (policies.monthOverflow === 'reject') {
          return {
            candidates,
            conflict: { calendarMonth, kind: 'month_overflow', requestedDay },
          }
        }
        if (policies.monthOverflow === 'skip') {
          effects.push({
            action: 'skipped',
            calendarMonth,
            kind: 'month_overflow',
            requestedDay,
          })
        } else {
          date = getTemporal().PlainDate.from(
            { day: requestedDay, month: yearMonth.month, year: yearMonth.year },
            { overflow: 'constrain' },
          )
          effects.push({
            action: 'constrained',
            calendarMonth,
            effectiveLocalDateTime: formatIsoLocalMinute(
              date.toPlainDateTime(scheduleStart.toPlainTime()),
            ),
            kind: 'month_overflow',
            requestedDay,
          })
        }
      }
    }
    if (date) {
      addScheduleCandidate(
        candidates,
        date.toPlainDateTime(scheduleStart.toPlainTime()),
        'rule',
        scheduleStart,
        windowStart,
        windowEnd,
        cursor,
      )
    }
    yearMonth = yearMonth.add({ months: interval })
  }
  return { candidates }
}
