import type { TimeZoneCandidate } from '../data/timeZoneRegistry'
import type { Locale } from '../types'
import type { FixedWallTimePlan, TimePlanContext } from './timePlanTypes'

export const MAX_SCHEDULE_INSTANCES = 32
export const MAX_SCHEDULE_RANGE_DAYS = 3_660
export const MAX_SCHEDULE_DATE_OVERRIDES = 64
export const MAX_SCHEDULE_INTERVAL = 100
export const SCHEDULE_PLAN_SCHEMA_VERSION =
  'migratory.schedule-plan.v0.1' as const

export type ScheduleWeekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'

export type ScheduleRule =
  | {
      frequency: 'daily'
      interval?: number
    }
  | {
      frequency: 'weekly'
      interval?: number
      weekdays?: ScheduleWeekday[]
    }
  | {
      frequency: 'monthly'
      interval?: number
    }

export interface SchedulePolicies {
  gap?: 'reject' | 'skip' | 'shift_backward' | 'shift_forward'
  monthOverflow?: 'constrain_to_last_day' | 'reject' | 'skip'
  overlap?: 'both' | 'earlier' | 'later' | 'reject'
}

export type NormalizedScheduleRule =
  | { frequency: 'daily'; interval: number }
  | {
      frequency: 'weekly'
      interval: number
      weekdays: ScheduleWeekday[]
    }
  | { frequency: 'monthly'; interval: number }

export interface SchedulePlanRequest {
  additionalLocalDateTimes: string[]
  cursor?: string
  excludedLocalDateTimes: string[]
  maxInstances: number
  policies: {
    gap: NonNullable<SchedulePolicies['gap']>
    monthOverflow: NonNullable<SchedulePolicies['monthOverflow']>
    overlap: NonNullable<SchedulePolicies['overlap']>
  }
  rule: NormalizedScheduleRule
  startLocalDateTime: string
  timeZone: string
  window: {
    endDateExclusive: string
    startDateInclusive: string
  }
}

export interface ExpandScheduleInput {
  additionalLocalDateTimes?: string[]
  cursor?: string
  excludedLocalDateTimes?: string[]
  locale?: Locale
  maxInstances?: number
  policies?: SchedulePolicies
  rule: ScheduleRule
  startLocalDateTime: string
  timeZone: string
  window: {
    endDateExclusive: string
    startDateInclusive: string
  }
}

export type ScheduleErrorCode =
  | 'AMBIGUOUS_TIME_ZONE'
  | 'DUPLICATE_SCHEDULE_DATE'
  | 'INTERNAL_ERROR'
  | 'INVALID_CURSOR'
  | 'INVALID_FORMAT'
  | 'INVALID_SCHEDULE'
  | 'INVALID_SCHEDULE_PLAN'
  | 'INVALID_WINDOW'
  | 'RANGE_TOO_LARGE'
  | 'TOO_MANY_SCHEDULE_DATES'
  | 'UNKNOWN_TIME_ZONE'
  | 'UNSUPPORTED_PRECISION'
  | 'UNSUPPORTED_YEAR'

export interface ScheduleError {
  candidates?: TimeZoneCandidate[]
  code: ScheduleErrorCode
  field?: string
  input?: string
  message: string
  retryable: false
}

export interface ScheduleErrorResult {
  error: ScheduleError
  status: 'error'
}

export type ScheduleEffect =
  | {
      kind: 'excluded'
      localDateTime: string
    }
  | {
      kind: 'gap_skipped'
      localDateTime: string
    }
  | {
      direction: 'backward' | 'forward'
      fromLocalDateTime: string
      kind: 'gap_shifted'
      toLocalDateTime: string
    }
  | {
      action: 'constrained'
      calendarMonth: string
      effectiveLocalDateTime: string
      kind: 'month_overflow'
      requestedDay: number
    }
  | {
      action: 'skipped'
      calendarMonth: string
      kind: 'month_overflow'
      requestedDay: number
    }

export type ScheduleConflict =
  | {
      kind: 'dst_gap'
      localDateTime: string
      timeZone: string
    }
  | {
      candidates: Array<{
        choice: 'earlier' | 'later'
        instant: string
        offset: string
      }>
      kind: 'dst_overlap'
      localDateTime: string
      timeZone: string
    }
  | {
      calendarMonth: string
      kind: 'month_overflow'
      requestedDay: number
    }

export interface ScheduleInstance {
  effectiveLocalDateTime: string
  plans: FixedWallTimePlan[]
  scheduledLocalDateTime: string
  sources: Array<'rdate' | 'rule'>
}

export interface ExpandedScheduleResult {
  context: TimePlanContext
  dependencies: [
    {
      timeZone: string
      type: 'tzdb'
      version: string
    },
  ]
  effects: ScheduleEffect[]
  instances: ScheduleInstance[]
  nextCursor: string | null
  request: SchedulePlanRequest
  revalidation: { triggers: ['tzdb_change'] }
  schemaVersion: typeof SCHEDULE_PLAN_SCHEMA_VERSION
  status: 'expanded'
  truncated: boolean
}

export interface ScheduleConflictResult {
  conflict: ScheduleConflict
  status: 'conflict'
}

export type ExpandScheduleResult =
  | ExpandedScheduleResult
  | ScheduleConflictResult
  | ScheduleErrorResult

export type SchedulePlanDifferenceField =
  | 'dependencies[0].version'
  | 'resolution.expansion'
  | 'resolution.status'

export interface SchedulePlanDifference {
  current?: string
  field: SchedulePlanDifferenceField
  previous?: string
}

export type ValidateSchedulePlanResult =
  | {
      currentPlan: ExpandedScheduleResult
      dependencyChanges: SchedulePlanDifference[]
      status: 'unchanged'
    }
  | {
      current: ExpandedScheduleResult | ScheduleConflictResult
      differences: SchedulePlanDifference[]
      status: 'drifted'
    }
  | {
      currentContext: TimePlanContext
      reason: string
      status: 'unverifiable'
    }
  | ScheduleErrorResult
