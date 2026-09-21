import type { Locale } from '../types'
import { fingerprintDefinition } from './definitionFingerprint'
import { findTimeWindows } from './availabilitySolver'
import {
  availabilityErrorResult,
  normalizeAvailabilityInput,
} from './availabilityValidation'
import {
  AVAILABILITY_PLAN_SCHEMA_VERSION,
  type AvailabilityParticipant,
  type AvailabilityPlanDifference,
  type AvailabilityPlanDifferenceField,
  type AvailabilityErrorResult,
  type SolvedAvailabilityPlan,
  type ValidateAvailabilityPlanResult,
} from './availabilityTypes'
import type { TimePlanContext } from './timePlanTypes'

function invalidPlan(message: string): AvailabilityErrorResult {
  return {
    error: {
      code: 'INVALID_AVAILABILITY_PLAN',
      field: 'plan',
      message,
      retryable: false,
    },
    status: 'error',
  }
}

function difference(
  field: AvailabilityPlanDifferenceField,
  previous: string,
  current: string,
): AvailabilityPlanDifference[] {
  return previous === current ? [] : [{ current, field, previous }]
}

function assertPlanShape(plan: SolvedAvailabilityPlan) {
  return (
    plan.schemaVersion === AVAILABILITY_PLAN_SCHEMA_VERSION
    && plan.dependencies?.length === 2
    && plan.dependencies[0]?.type === 'availability_snapshot'
    && plan.dependencies[1]?.type === 'tzdb'
    && plan.revalidation?.triggers?.length === 2
    && plan.revalidation.triggers[0] === 'availability_snapshot_change'
    && plan.revalidation.triggers[1] === 'tzdb_change'
    && plan.candidates.length <= plan.query.maxCandidates
  )
}

export function validateAvailabilityPlan(
  plan: SolvedAvailabilityPlan,
  currentSnapshot: {
    locale?: Locale
    participants: AvailabilityParticipant[]
    snapshot: { id: string; version: string }
  },
  context: TimePlanContext,
): ValidateAvailabilityPlanResult {
  if (plan.schemaVersion !== AVAILABILITY_PLAN_SCHEMA_VERSION) {
    return {
      currentContext: context,
      reason: `This runtime supports ${AVAILABILITY_PLAN_SCHEMA_VERSION}, not ${String(plan.schemaVersion)}.`,
      status: 'unverifiable',
    }
  }
  if (!assertPlanShape(plan)) {
    return invalidPlan(
      'The availability plan has inconsistent dependency, revalidation, candidate, or query metadata.',
    )
  }

  const input = {
    durationMinutes: plan.query.durationMinutes,
    locale: currentSnapshot.locale,
    maxCandidates: plan.query.maxCandidates,
    participants: currentSnapshot.participants,
    search: plan.query.search,
    snapshot: currentSnapshot.snapshot,
    stepMinutes: plan.query.stepMinutes,
  }
  try {
    const normalized = normalizeAvailabilityInput(input)
    if (normalized.snapshot.id !== plan.dependencies[0].id) {
      return {
        currentContext: context,
        reason: `The supplied snapshot id ${normalized.snapshot.id} does not match required dependency ${plan.dependencies[0].id}.`,
        status: 'unverifiable',
      }
    }

    const currentTimeZones = [...new Set(
      normalized.participants.map((participant) => participant.timeZone),
    )].sort()
    const dependencyChanges = [
      ...difference(
        'dependencies[0].version',
        plan.dependencies[0].version,
        normalized.snapshot.version,
      ),
      ...difference(
        'dependencies[0].definitionFingerprint',
        plan.dependencies[0].definitionFingerprint,
        normalized.definitionFingerprint,
      ),
      ...difference(
        'dependencies[1].timeZones',
        JSON.stringify(plan.dependencies[1].timeZones),
        JSON.stringify(currentTimeZones),
      ),
      ...difference(
        'dependencies[1].version',
        plan.dependencies[1].version,
        context.timeZoneDataVersion,
      ),
    ]
    const current = findTimeWindows(input, context)
    if (current.status === 'error') return current
    if (current.status !== 'solved') {
      return {
        current,
        differences: [
          ...dependencyChanges,
          {
            current: current.status,
            field: 'resolution.status',
            previous: 'solved',
          },
        ],
        status: 'drifted',
      }
    }

    const semanticDifferences = [
      ...difference(
        'resolution.candidates',
        fingerprintDefinition({ candidates: plan.candidates }),
        fingerprintDefinition({ candidates: current.candidates }),
      ),
      ...difference(
        'resolution.commonAvailabilityIntervalCount',
        String(plan.commonAvailabilityIntervalCount),
        String(current.commonAvailabilityIntervalCount),
      ),
      ...difference(
        'resolution.eligibleCandidateCount',
        String(plan.eligibleCandidateCount),
        String(current.eligibleCandidateCount),
      ),
    ]
    if (semanticDifferences.length) {
      return {
        current,
        differences: [...dependencyChanges, ...semanticDifferences],
        status: 'drifted',
      }
    }
    return {
      currentPlan: current,
      dependencyChanges,
      status: 'unchanged',
    }
  } catch (error) {
    return availabilityErrorResult(error)
  }
}
