import type { Temporal } from '@js-temporal/polyfill'
import { formatIsoLocalMinute } from './isoCalendar'
import { businessInputError, mapBusinessTimePlanError } from './businessCalendarErrors'
import type {
  BusinessBoundaryAdjustment,
  BusinessDeadlineConflict,
} from './businessCalendarTypes'
import type {
  NormalizedBusinessCalendar,
  NormalizedBusinessInterval,
} from './businessCalendarValidation'
import { resolveTime } from './timePlan'
import type { TimePlanContext } from './timePlanTypes'
import { getTemporal } from './temporal'

export interface ResolvedBusinessBoundary {
  adjustment?: BusinessBoundaryAdjustment
  effectiveLocalDateTime: string
  instant: Temporal.Instant
  offset: string
}

export type BusinessBoundaryResult =
  | { boundary: ResolvedBusinessBoundary; status: 'resolved' }
  | { conflict: BusinessDeadlineConflict; status: 'conflict' }

function localDateTime(
  sourceDate: Temporal.PlainDate,
  interval: NormalizedBusinessInterval,
  boundary: 'end' | 'start',
) {
  const minute = boundary === 'start' ? interval.startMinute : interval.endMinute
  const date = boundary === 'end' && interval.endDayOffset === 1
    ? sourceDate.add({ days: 1 })
    : sourceDate
  return date.toPlainDateTime({
    hour: Math.floor(minute / 60),
    minute: minute % 60,
  })
}

export function resolveBusinessBoundary(
  calendar: NormalizedBusinessCalendar,
  sourceDate: Temporal.PlainDate,
  interval: NormalizedBusinessInterval,
  boundary: 'end' | 'start',
  context: TimePlanContext,
): BusinessBoundaryResult {
  const scheduled = localDateTime(sourceDate, interval, boundary)
  const scheduledLocalDateTime = formatIsoLocalMinute(scheduled)
  const result = resolveTime(
    {
      intent: {
        anchor: 'fixed_wall_time',
        localDateTime: scheduledLocalDateTime,
        timeZone: calendar.timeZone,
      },
    },
    context,
  )
  if (result.status === 'error') mapBusinessTimePlanError(result.error)
  if (result.status === 'underspecified') {
    businessInputError(
      'INVALID_BUSINESS_CALENDAR',
      'calendar',
      'A business interval boundary was unexpectedly underspecified.',
    )
  }
  if (result.status === 'ambiguous') {
    if (calendar.boundaryPolicies.overlap === 'reject') {
      return {
        conflict: {
          boundary,
          candidates: result.candidates.map(({ choice, plan }) => ({
            choice,
            instant: plan.resolution.instant,
            offset: plan.resolution.offset,
          })),
          kind: 'dst_overlap',
          localDateTime: scheduledLocalDateTime,
          sourceDate: sourceDate.toString(),
          timeZone: calendar.timeZone,
        },
        status: 'conflict',
      }
    }
    const selected = result.candidates.find(
      ({ choice }) => choice === calendar.boundaryPolicies.overlap,
    )
    if (!selected) {
      businessInputError(
        'INVALID_BUSINESS_CALENDAR',
        'calendar.boundaryPolicies.overlap',
        'The selected overlap policy did not resolve one boundary.',
      )
    }
    return {
      boundary: {
        effectiveLocalDateTime: scheduledLocalDateTime,
        instant: getTemporal().Instant.from(selected.plan.resolution.instant),
        offset: selected.plan.resolution.offset,
      },
      status: 'resolved',
    }
  }
  if (result.status === 'nonexistent') {
    if (calendar.boundaryPolicies.gap === 'reject') {
      return {
        conflict: {
          boundary,
          kind: 'dst_gap',
          localDateTime: scheduledLocalDateTime,
          sourceDate: sourceDate.toString(),
          timeZone: calendar.timeZone,
        },
        status: 'conflict',
      }
    }
    const direction = calendar.boundaryPolicies.gap === 'shift_forward'
      ? 'forward'
      : 'backward'
    const shifted = getTemporal().ZonedDateTime.from(
      {
        day: scheduled.day,
        hour: scheduled.hour,
        minute: scheduled.minute,
        month: scheduled.month,
        timeZone: calendar.timeZone,
        year: scheduled.year,
      },
      {
        disambiguation: direction === 'forward' ? 'later' : 'earlier',
        overflow: 'reject',
      },
    )
    const effectiveLocalDateTime = formatIsoLocalMinute(shifted.toPlainDateTime())
    return {
      boundary: {
        adjustment: {
          boundary,
          direction,
          effectiveLocalDateTime,
          scheduledLocalDateTime,
          sourceDate: sourceDate.toString(),
        },
        effectiveLocalDateTime,
        instant: shifted.toInstant(),
        offset: shifted.offset,
      },
      status: 'resolved',
    }
  }
  if (result.plan.anchor !== 'fixed_wall_time') {
    businessInputError(
      'INVALID_BUSINESS_CALENDAR',
      'calendar',
      'A business interval boundary resolved to the wrong TimePlan anchor.',
    )
  }
  return {
    boundary: {
      effectiveLocalDateTime: scheduledLocalDateTime,
      instant: getTemporal().Instant.from(result.plan.resolution.instant),
      offset: result.plan.resolution.offset,
    },
    status: 'resolved',
  }
}
