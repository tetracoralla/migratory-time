import type { TimeZoneCandidate } from '../data/timeZoneRegistry'
import type { Locale } from '../types'
import type { TimePlanContext, TzdbDependency } from './timePlanTypes'

export const BUSINESS_CALENDAR_SCHEMA_VERSION =
  'migratory.business-calendar.v0.1' as const
export const BUSINESS_DEADLINE_SCHEMA_VERSION =
  'migratory.business-deadline.v0.1' as const

export const MAX_BUSINESS_CALENDAR_EXCEPTIONS = 64
export const MAX_BUSINESS_INTERVALS = 128
export const MAX_BUSINESS_INTERVALS_PER_DAY = 8
export const MAX_BUSINESS_DURATION_MINUTES = 525_600
export const MAX_BUSINESS_SCAN_DAYS = 3_660
export const MAX_BUSINESS_BOUNDARY_ADJUSTMENTS = 32

export type BusinessWeekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'

export interface BusinessHoursInterval {
  end: string
  endDayOffset?: 0 | 1
  start: string
}

export type BusinessWeeklyHours = Partial<
  Record<BusinessWeekday, BusinessHoursInterval[]>
>

export interface BusinessCalendarException {
  date: string
  intervals: BusinessHoursInterval[]
}

export interface BusinessCalendar {
  boundaryPolicies?: {
    gap?: 'reject' | 'shift_backward' | 'shift_forward'
    overlap?: 'earlier' | 'later' | 'reject'
  }
  exceptions?: BusinessCalendarException[]
  id: string
  schemaVersion: typeof BUSINESS_CALENDAR_SCHEMA_VERSION
  timeZone: string
  version: string
  weeklyHours: BusinessWeeklyHours
}

export interface ComputeDeadlineInput {
  calendar: BusinessCalendar
  durationMinutes: number
  locale?: Locale
  startInstant: string
  startPolicy?: 'next_open' | 'reject'
}

export interface BusinessCalendarDependency {
  definitionFingerprint: string
  id: string
  timeZone: string
  type: 'business_calendar'
  version: string
}

export interface BusinessBoundaryAdjustment {
  boundary: 'end' | 'start'
  direction: 'backward' | 'forward'
  effectiveLocalDateTime: string
  scheduledLocalDateTime: string
  sourceDate: string
}

export interface BusinessDeadlinePlan {
  dependencies: [BusinessCalendarDependency, TzdbDependency]
  intent: {
    durationMinutes: number
    startInstant: string
    startPolicy: 'next_open' | 'reject'
  }
  operation: 'add_business_duration'
  resolution: {
    boundaryAdjustmentCount: number
    boundaryAdjustments: BusinessBoundaryAdjustment[]
    boundaryAdjustmentsTruncated: boolean
    businessDatesUsed: number
    businessMinutesConsumed: number
    calendarDaysScanned: number
    deadlineInstant: string
    deadlineLocalDateTime: string
    deadlineOffset: string
    effectiveStartInstant: string
    startWasBusinessTime: boolean
  }
  revalidation: {
    triggers: ['business_calendar_change', 'tzdb_change']
  }
  schemaVersion: typeof BUSINESS_DEADLINE_SCHEMA_VERSION
}

export type BusinessDeadlineConflict =
  | {
      kind: 'start_outside_business_time'
      nextBusinessOpen: {
        instant: string
        localDateTime: string
        offset: string
      }
      startInstant: string
      timeZone: string
    }
  | {
      boundary: 'end' | 'start'
      kind: 'dst_gap'
      localDateTime: string
      sourceDate: string
      timeZone: string
    }
  | {
      boundary: 'end' | 'start'
      candidates: Array<{
        choice: 'earlier' | 'later'
        instant: string
        offset: string
      }>
      kind: 'dst_overlap'
      localDateTime: string
      sourceDate: string
      timeZone: string
    }
  | {
      endInstant: string
      endLocalDateTime: string
      kind: 'invalid_interval_after_resolution'
      sourceDate: string
      startInstant: string
      startLocalDateTime: string
    }

export type BusinessDeadlineErrorCode =
  | 'AMBIGUOUS_TIME_ZONE'
  | 'DUPLICATE_EXCEPTION_DATE'
  | 'INTERNAL_ERROR'
  | 'INVALID_BUSINESS_CALENDAR'
  | 'INVALID_BUSINESS_DEADLINE_PLAN'
  | 'INVALID_DURATION'
  | 'INVALID_FORMAT'
  | 'INVALID_INSTANT'
  | 'TOO_MANY_CALENDAR_ENTRIES'
  | 'UNKNOWN_TIME_ZONE'
  | 'UNSUPPORTED_PRECISION'
  | 'UNSUPPORTED_YEAR'

export interface BusinessDeadlineError {
  candidates?: TimeZoneCandidate[]
  code: BusinessDeadlineErrorCode
  field?: string
  input?: string
  message: string
  retryable: false
}

export interface ComputedBusinessDeadlineResult {
  plan: BusinessDeadlinePlan
  status: 'computed'
}

export interface ConflictedBusinessDeadlineResult {
  conflict: BusinessDeadlineConflict
  status: 'conflict'
}

export interface UnsatisfiableBusinessDeadlineResult {
  context: TimePlanContext
  reason: 'no_business_time_within_search_limit'
  scannedDays: number
  status: 'unsatisfiable'
}

export interface BusinessDeadlineErrorResult {
  error: BusinessDeadlineError
  status: 'error'
}

export type ComputeDeadlineResult =
  | ComputedBusinessDeadlineResult
  | ConflictedBusinessDeadlineResult
  | UnsatisfiableBusinessDeadlineResult
  | BusinessDeadlineErrorResult

export type BusinessDeadlineDifferenceField =
  | 'dependencies[0].definitionFingerprint'
  | 'dependencies[0].version'
  | 'dependencies[1].version'
  | 'resolution.deadlineInstant'
  | 'resolution.deadlineLocalDateTime'
  | 'resolution.deadlineOffset'
  | 'resolution.effectiveStartInstant'
  | 'resolution.status'

export interface BusinessDeadlineDifference {
  current?: string
  field: BusinessDeadlineDifferenceField
  previous?: string
}

export type ValidateBusinessDeadlinePlanResult =
  | {
      currentPlan: BusinessDeadlinePlan
      dependencyChanges: BusinessDeadlineDifference[]
      status: 'unchanged'
    }
  | {
      current:
        | ComputedBusinessDeadlineResult
        | ConflictedBusinessDeadlineResult
        | UnsatisfiableBusinessDeadlineResult
      differences: BusinessDeadlineDifference[]
      status: 'drifted'
    }
  | {
      currentContext: TimePlanContext
      reason: string
      status: 'unverifiable'
    }
  | BusinessDeadlineErrorResult
