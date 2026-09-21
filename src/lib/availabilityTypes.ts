import type { TimeZoneCandidate } from '../data/timeZoneRegistry'
import type { Locale } from '../types'
import type { TimePlanContext } from './timePlanTypes'

export const AVAILABILITY_PLAN_SCHEMA_VERSION =
  'migratory.availability-plan.v0.1' as const
export const MAX_AVAILABILITY_PARTICIPANTS = 12
export const MAX_AVAILABILITY_INTERVALS_PER_LIST = 64
export const MAX_AVAILABILITY_INTERVALS_TOTAL = 512
export const MAX_AVAILABILITY_CANDIDATES = 10
export const MAX_AVAILABILITY_SEARCH_DAYS = 31
export const MAX_AVAILABILITY_DURATION_MINUTES = 1_440
export const MIN_AVAILABILITY_STEP_MINUTES = 5
export const MAX_AVAILABILITY_STEP_MINUTES = 1_440

export interface ExactTimeInterval {
  end: string
  start: string
}

export interface AvailabilityParticipant {
  availability: ExactTimeInterval[]
  busy?: ExactTimeInterval[]
  id: string
  preferred?: ExactTimeInterval[]
  timeZone: string
}

export interface FindTimeWindowsInput {
  durationMinutes: number
  locale?: Locale
  maxCandidates?: number
  participants: AvailabilityParticipant[]
  search: ExactTimeInterval
  snapshot: {
    id: string
    version: string
  }
  stepMinutes?: number
}

export interface AvailabilitySnapshotDependency {
  definitionFingerprint: string
  id: string
  type: 'availability_snapshot'
  version: string
}

export interface AvailabilityTzdbDependency {
  timeZones: string[]
  type: 'tzdb'
  version: string
}

export interface AvailabilityCandidate {
  endInstant: string
  localViews: Array<{
    endLocalDateTime: string
    endOffset: string
    participantId: string
    startLocalDateTime: string
    startOffset: string
    timeZone: string
  }>
  outsidePreferenceParticipants: string[]
  preferenceSatisfied: number
  preferenceTotal: number
  preferredParticipants: string[]
  startInstant: string
}

export interface SolvedAvailabilityPlan {
  candidates: AvailabilityCandidate[]
  commonAvailabilityIntervalCount: number
  dependencies: [AvailabilitySnapshotDependency, AvailabilityTzdbDependency]
  eligibleCandidateCount: number
  query: {
    durationMinutes: number
    maxCandidates: number
    search: ExactTimeInterval
    stepMinutes: number
  }
  revalidation: {
    triggers: ['availability_snapshot_change', 'tzdb_change']
  }
  schemaVersion: typeof AVAILABILITY_PLAN_SCHEMA_VERSION
  status: 'solved'
}

export interface UnsatisfiableAvailabilityResult {
  conflict: {
    kind:
      | 'alignment_excludes_all'
      | 'duration_does_not_fit'
      | 'no_common_availability'
    participantIds: string[]
  }
  context: TimePlanContext
  dependency: AvailabilitySnapshotDependency
  query: {
    durationMinutes: number
    search: ExactTimeInterval
    stepMinutes: number
  }
  status: 'unsatisfiable'
}

export type AvailabilityErrorCode =
  | 'AMBIGUOUS_TIME_ZONE'
  | 'DUPLICATE_PARTICIPANT'
  | 'INTERNAL_ERROR'
  | 'INVALID_CANDIDATE_LIMIT'
  | 'INVALID_DURATION'
  | 'INVALID_INSTANT'
  | 'INVALID_INTERVAL'
  | 'INVALID_AVAILABILITY_PLAN'
  | 'INVALID_SNAPSHOT'
  | 'INVALID_STEP'
  | 'RANGE_TOO_LARGE'
  | 'TOO_MANY_INTERVALS'
  | 'TOO_MANY_PARTICIPANTS'
  | 'UNKNOWN_TIME_ZONE'
  | 'UNSUPPORTED_PRECISION'
  | 'UNSUPPORTED_YEAR'

export interface AvailabilityError {
  candidates?: TimeZoneCandidate[]
  code: AvailabilityErrorCode
  field?: string
  input?: string
  message: string
  retryable: false
}

export interface AvailabilityErrorResult {
  error: AvailabilityError
  status: 'error'
}

export type FindTimeWindowsResult =
  | SolvedAvailabilityPlan
  | UnsatisfiableAvailabilityResult
  | AvailabilityErrorResult

export type AvailabilityPlanDifferenceField =
  | 'dependencies[0].definitionFingerprint'
  | 'dependencies[0].version'
  | 'dependencies[1].timeZones'
  | 'dependencies[1].version'
  | 'resolution.candidates'
  | 'resolution.commonAvailabilityIntervalCount'
  | 'resolution.eligibleCandidateCount'
  | 'resolution.status'

export interface AvailabilityPlanDifference {
  current?: string
  field: AvailabilityPlanDifferenceField
  previous?: string
}

export type ValidateAvailabilityPlanResult =
  | {
      currentPlan: SolvedAvailabilityPlan
      dependencyChanges: AvailabilityPlanDifference[]
      status: 'unchanged'
    }
  | {
      current: SolvedAvailabilityPlan | UnsatisfiableAvailabilityResult
      differences: AvailabilityPlanDifference[]
      status: 'drifted'
    }
  | {
      currentContext: TimePlanContext
      reason: string
      status: 'unverifiable'
    }
  | AvailabilityErrorResult
