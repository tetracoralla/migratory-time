import type { TimeZoneCandidate } from '../data/timeZoneRegistry'
import type { Locale } from '../types'

export const TIME_PLAN_SCHEMA_VERSION = 'migratory.time-plan.v0.1' as const

export interface TimePlanContext {
  timeZoneData: 'IANA'
  timeZoneDataVersion: string
}

export type TimePlanDisambiguation = 'reject' | 'earlier' | 'later'

export type ResolveTimeIntent =
  | {
      anchor: 'fixed_instant'
      instant?: string
    }
  | {
      anchor: 'fixed_wall_time'
      disambiguation?: TimePlanDisambiguation
      localDateTime?: string
      timeZone?: string
    }

export interface ResolveTimeInput {
  intent: ResolveTimeIntent
  locale?: Locale
}

export interface TzdbDependency {
  timeZone: string
  type: 'tzdb'
  version: string
}

export interface FixedInstantTimePlan {
  anchor: 'fixed_instant'
  dependencies: []
  intent: {
    instant: string
  }
  resolution: {
    instant: string
  }
  revalidation: {
    trigger: 'none'
  }
  schemaVersion: typeof TIME_PLAN_SCHEMA_VERSION
}

export interface FixedWallTimePlan {
  anchor: 'fixed_wall_time'
  dependencies: [TzdbDependency]
  intent: {
    disambiguation: TimePlanDisambiguation
    localDateTime: string
    timeZone: string
  }
  resolution: {
    instant: string
    offset: string
  }
  revalidation: {
    trigger: 'tzdb_change'
  }
  schemaVersion: typeof TIME_PLAN_SCHEMA_VERSION
}

export type TimePlan = FixedInstantTimePlan | FixedWallTimePlan

export type TimePlanInput =
  | (Omit<FixedInstantTimePlan, 'schemaVersion'> & { schemaVersion: string })
  | (Omit<FixedWallTimePlan, 'schemaVersion'> & { schemaVersion: string })

export type TimePlanErrorCode =
  | 'AMBIGUOUS_TIME_ZONE'
  | 'INTERNAL_ERROR'
  | 'INVALID_FORMAT'
  | 'INVALID_INSTANT'
  | 'INVALID_TIME_PLAN'
  | 'UNKNOWN_TIME_ZONE'
  | 'UNSUPPORTED_PRECISION'
  | 'UNSUPPORTED_YEAR'

export interface TimePlanError {
  candidates?: TimeZoneCandidate[]
  code: TimePlanErrorCode
  field?: string
  input?: string
  message: string
  retryable: false
}

export interface TimePlanErrorResult {
  error: TimePlanError
  status: 'error'
}

export interface ResolvedTimePlanResult {
  plan: TimePlan
  status: 'resolved'
}

export interface AmbiguousTimePlanResult {
  candidates: Array<{
    choice: 'earlier' | 'later'
    plan: FixedWallTimePlan
  }>
  source: {
    localDateTime: string
    timeZone: string
  }
  status: 'ambiguous'
}

export interface UnderspecifiedTimeResult {
  missing: Array<'intent.instant' | 'intent.localDateTime' | 'intent.timeZone'>
  status: 'underspecified'
}

export interface NonexistentTimePlanResult {
  reason: string
  source: {
    localDateTime: string
    timeZone: string
  }
  status: 'nonexistent'
}

export type ResolveTimeResult =
  | ResolvedTimePlanResult
  | AmbiguousTimePlanResult
  | UnderspecifiedTimeResult
  | NonexistentTimePlanResult
  | TimePlanErrorResult

export interface TimePlanDifference {
  current?: string
  field:
    | 'dependencies[0].version'
    | 'resolution.instant'
    | 'resolution.offset'
    | 'resolution.status'
  previous?: string
}

export interface UnchangedTimePlanResult {
  currentPlan: TimePlan
  dependencyChanges: TimePlanDifference[]
  status: 'unchanged'
}

export interface DriftedTimePlanResult {
  current:
    | ResolvedTimePlanResult
    | AmbiguousTimePlanResult
    | NonexistentTimePlanResult
  differences: TimePlanDifference[]
  status: 'drifted'
}

export interface UnverifiableTimePlanResult {
  currentContext: TimePlanContext
  reason: string
  status: 'unverifiable'
}

export type ValidateTimePlanResult =
  | UnchangedTimePlanResult
  | DriftedTimePlanResult
  | UnverifiableTimePlanResult
  | TimePlanErrorResult
