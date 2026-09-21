import type { Temporal } from '@js-temporal/polyfill'
import {
  resolveBusinessBoundary,
  type ResolvedBusinessBoundary,
} from './businessBoundary'
import { businessErrorResult, businessInputError } from './businessCalendarErrors'
import {
  businessIntervalsForDate,
  normalizeBusinessCalendar,
  type NormalizedBusinessCalendar,
} from './businessCalendarValidation'
import {
  BUSINESS_DEADLINE_SCHEMA_VERSION,
  MAX_BUSINESS_BOUNDARY_ADJUSTMENTS,
  MAX_BUSINESS_DURATION_MINUTES,
  MAX_BUSINESS_SCAN_DAYS,
  type BusinessBoundaryAdjustment,
  type BusinessDeadlineErrorResult,
  type BusinessDeadlinePlan,
  type ComputeDeadlineInput,
  type ComputeDeadlineResult,
} from './businessCalendarTypes'
import { getTemporal } from './temporal'
import type { TimePlanContext } from './timePlanTypes'

export * from './businessCalendarTypes'

const NANOS_PER_MINUTE = 60_000_000_000n

interface ResolvedBusinessInterval {
  end: ResolvedBusinessBoundary
  sourceDate: string
  start: ResolvedBusinessBoundary
}

interface CalculationState {
  adjustmentCount: number
  adjustments: BusinessBoundaryAdjustment[]
  businessDatesUsed: Set<string>
  scannedDays: number
}

function canonicalInstant(value: string) {
  try {
    return getTemporal().Instant.from(value)
  } catch {
    businessInputError(
      'INVALID_INSTANT',
      'startInstant',
      'startInstant must be an exact ISO 8601 / RFC 3339 timestamp with an offset.',
      value,
    )
  }
}

function recordAdjustment(
  adjustment: BusinessBoundaryAdjustment | undefined,
  state: CalculationState,
) {
  if (!adjustment) return
  state.adjustmentCount += 1
  if (state.adjustments.length < MAX_BUSINESS_BOUNDARY_ADJUSTMENTS) {
    state.adjustments.push(adjustment)
  }
}

function resolvedIntervalsForDate(
  calendar: NormalizedBusinessCalendar,
  sourceDate: Temporal.PlainDate,
  context: TimePlanContext,
  state: CalculationState,
):
  | { intervals: ResolvedBusinessInterval[]; status: 'resolved' }
  | Extract<ComputeDeadlineResult, { status: 'conflict' }> {
  const intervals: ResolvedBusinessInterval[] = []
  for (const interval of businessIntervalsForDate(calendar, sourceDate)) {
    const start = resolveBusinessBoundary(
      calendar,
      sourceDate,
      interval,
      'start',
      context,
    )
    if (start.status === 'conflict') {
      return { conflict: start.conflict, status: 'conflict' }
    }
    const end = resolveBusinessBoundary(
      calendar,
      sourceDate,
      interval,
      'end',
      context,
    )
    if (end.status === 'conflict') {
      return { conflict: end.conflict, status: 'conflict' }
    }
    recordAdjustment(start.boundary.adjustment, state)
    recordAdjustment(end.boundary.adjustment, state)
    if (
      getTemporal().Instant.compare(start.boundary.instant, end.boundary.instant) >= 0
    ) {
      return {
        conflict: {
          endInstant: end.boundary.instant.toString(),
          endLocalDateTime: end.boundary.effectiveLocalDateTime,
          kind: 'invalid_interval_after_resolution',
          sourceDate: sourceDate.toString(),
          startInstant: start.boundary.instant.toString(),
          startLocalDateTime: start.boundary.effectiveLocalDateTime,
        },
        status: 'conflict',
      }
    }
    intervals.push({
      end: end.boundary,
      sourceDate: sourceDate.toString(),
      start: start.boundary,
    })
  }
  return { intervals, status: 'resolved' }
}

function deadlinePlan(
  input: {
    durationMinutes: number
    startInstant: Temporal.Instant
    startPolicy: 'next_open' | 'reject'
  },
  calendar: NormalizedBusinessCalendar,
  context: TimePlanContext,
  state: CalculationState,
  effectiveStart: Temporal.Instant,
  startWasBusinessTime: boolean,
  deadline: Temporal.Instant,
): BusinessDeadlinePlan {
  const deadlineLocal = deadline.toZonedDateTimeISO(calendar.timeZone)
  return {
    dependencies: [
      {
        definitionFingerprint: calendar.definitionFingerprint,
        id: calendar.id,
        timeZone: calendar.timeZone,
        type: 'business_calendar',
        version: calendar.version,
      },
      {
        timeZone: calendar.timeZone,
        type: 'tzdb',
        version: context.timeZoneDataVersion,
      },
    ],
    intent: {
      durationMinutes: input.durationMinutes,
      startInstant: input.startInstant.toString(),
      startPolicy: input.startPolicy,
    },
    operation: 'add_business_duration',
    resolution: {
      boundaryAdjustmentCount: state.adjustmentCount,
      boundaryAdjustments: state.adjustments,
      boundaryAdjustmentsTruncated:
        state.adjustmentCount > state.adjustments.length,
      businessDatesUsed: state.businessDatesUsed.size,
      businessMinutesConsumed: input.durationMinutes,
      calendarDaysScanned: state.scannedDays,
      deadlineInstant: deadline.toString(),
      deadlineLocalDateTime: deadlineLocal.toPlainDateTime().toString(),
      deadlineOffset: deadlineLocal.offset,
      effectiveStartInstant: effectiveStart.toString(),
      startWasBusinessTime,
    },
    revalidation: {
      triggers: ['business_calendar_change', 'tzdb_change'],
    },
    schemaVersion: BUSINESS_DEADLINE_SCHEMA_VERSION,
  }
}

function computeDeadlineUnsafe(
  input: ComputeDeadlineInput,
  context: TimePlanContext,
): Exclude<ComputeDeadlineResult, BusinessDeadlineErrorResult> {
  if (
    !Number.isInteger(input.durationMinutes)
    || input.durationMinutes < 0
    || input.durationMinutes > MAX_BUSINESS_DURATION_MINUTES
  ) {
    businessInputError(
      'INVALID_DURATION',
      'durationMinutes',
      `durationMinutes must be an integer from 0 to ${MAX_BUSINESS_DURATION_MINUTES}.`,
      String(input.durationMinutes),
    )
  }
  const calendar = normalizeBusinessCalendar(input.calendar, input.locale ?? 'en')
  const startInstant = canonicalInstant(input.startInstant)
  const startLocal = startInstant.toZonedDateTimeISO(calendar.timeZone)
  if (startLocal.year < 1901) {
    businessInputError(
      'UNSUPPORTED_YEAR',
      'startInstant',
      'Business-calendar calculation supports local years 1901 and later.',
      input.startInstant,
    )
  }
  const startPolicy = input.startPolicy ?? 'reject'
  let remaining = BigInt(input.durationMinutes) * NANOS_PER_MINUTE
  const state: CalculationState = {
    adjustmentCount: 0,
    adjustments: [],
    businessDatesUsed: new Set(),
    scannedDays: 0,
  }
  let sourceDate = startLocal.toPlainDate().subtract({ days: 1 })
  let effectiveStart: Temporal.Instant | undefined
  let startWasBusinessTime = false
  let previousIntervalEnd: Temporal.Instant | undefined

  for (let dayIndex = 0; dayIndex < MAX_BUSINESS_SCAN_DAYS; dayIndex += 1) {
    state.scannedDays += 1
    const resolved = resolvedIntervalsForDate(
      calendar,
      sourceDate,
      context,
      state,
    )
    if (resolved.status === 'conflict') return resolved

    for (const interval of resolved.intervals) {
      if (
        previousIntervalEnd
        && getTemporal().Instant.compare(interval.start.instant, previousIntervalEnd) < 0
      ) {
        businessInputError(
          'INVALID_BUSINESS_CALENDAR',
          'calendar',
          'Business intervals overlap after applying the selected DST boundary policies.',
        )
      }
      previousIntervalEnd = interval.end.instant
      if (getTemporal().Instant.compare(interval.end.instant, startInstant) <= 0) {
        continue
      }

      let cursor: Temporal.Instant
      if (!effectiveStart) {
        const startsBeforeOrAt =
          getTemporal().Instant.compare(interval.start.instant, startInstant) <= 0
        if (startsBeforeOrAt) {
          cursor = startInstant
          effectiveStart = startInstant
          startWasBusinessTime = true
        } else if (startPolicy === 'reject') {
          return {
            conflict: {
              kind: 'start_outside_business_time',
              nextBusinessOpen: {
                instant: interval.start.instant.toString(),
                localDateTime: interval.start.effectiveLocalDateTime,
                offset: interval.start.offset,
              },
              startInstant: startInstant.toString(),
              timeZone: calendar.timeZone,
            },
            status: 'conflict',
          }
        } else {
          cursor = interval.start.instant
          effectiveStart = interval.start.instant
        }
      } else {
        cursor = interval.start.instant
      }

      if (remaining === 0n) {
        return {
          plan: deadlinePlan(
            { durationMinutes: input.durationMinutes, startInstant, startPolicy },
            calendar,
            context,
            state,
            effectiveStart,
            startWasBusinessTime,
            cursor,
          ),
          status: 'computed',
        }
      }

      const available = interval.end.instant.epochNanoseconds - cursor.epochNanoseconds
      if (available <= 0n) continue
      state.businessDatesUsed.add(interval.sourceDate)
      if (remaining <= available) {
        const deadline = getTemporal().Instant.fromEpochNanoseconds(
          cursor.epochNanoseconds + remaining,
        )
        return {
          plan: deadlinePlan(
            { durationMinutes: input.durationMinutes, startInstant, startPolicy },
            calendar,
            context,
            state,
            effectiveStart,
            startWasBusinessTime,
            deadline,
          ),
          status: 'computed',
        }
      }
      remaining -= available
    }
    sourceDate = sourceDate.add({ days: 1 })
  }

  return {
    context,
    reason: 'no_business_time_within_search_limit',
    scannedDays: state.scannedDays,
    status: 'unsatisfiable',
  }
}

export function computeDeadline(
  input: ComputeDeadlineInput,
  context: TimePlanContext,
): ComputeDeadlineResult {
  try {
    return computeDeadlineUnsafe(input, context)
  } catch (error) {
    return businessErrorResult(error)
  }
}
