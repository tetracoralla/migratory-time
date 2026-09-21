import { resolveTime } from './timePlan'
import {
  TIME_PLAN_SCHEMA_VERSION,
  type TimePlanContext,
  type TimePlanDifference,
  type TimePlanErrorResult,
  type TimePlanInput,
  type ValidateTimePlanResult,
} from './timePlanTypes'

function invalidPlan(message: string): TimePlanErrorResult {
  return {
    error: {
      code: 'INVALID_TIME_PLAN',
      field: 'plan',
      message,
      retryable: false,
    },
    status: 'error',
  }
}

function versionDifference(
  previous: string,
  current: string,
): TimePlanDifference[] {
  return previous === current
    ? []
    : [
        {
          current,
          field: 'dependencies[0].version',
          previous,
        },
      ]
}

export function validateTimePlan(
  plan: TimePlanInput,
  context: TimePlanContext,
): ValidateTimePlanResult {
  if (plan.schemaVersion !== TIME_PLAN_SCHEMA_VERSION) {
    return {
      currentContext: context,
      reason: `This runtime supports ${TIME_PLAN_SCHEMA_VERSION}, not ${plan.schemaVersion}.`,
      status: 'unverifiable',
    }
  }

  if (plan.anchor === 'fixed_instant') {
    if (
      plan.dependencies.length !== 0
      || plan.revalidation.trigger !== 'none'
    ) {
      return invalidPlan('A fixed-instant plan cannot have tzdb dependencies or a revalidation trigger.')
    }
    const current = resolveTime(
      { intent: { anchor: 'fixed_instant', instant: plan.intent.instant } },
      context,
    )
    if (current.status === 'error') return current
    if (current.status !== 'resolved' || current.plan.anchor !== 'fixed_instant') {
      return invalidPlan('The fixed-instant intent did not resolve to a fixed-instant plan.')
    }
    if (current.plan.resolution.instant !== plan.resolution.instant) {
      return invalidPlan('The fixed-instant resolution does not match its canonical intent.')
    }
    return { currentPlan: current.plan, dependencyChanges: [], status: 'unchanged' }
  }

  if (
    plan.dependencies.length !== 1
    || plan.dependencies[0].type !== 'tzdb'
    || plan.dependencies[0].timeZone !== plan.intent.timeZone
    || plan.revalidation.trigger !== 'tzdb_change'
  ) {
    return invalidPlan('The fixed-wall-time dependency or revalidation metadata is inconsistent with its intent.')
  }

  const current = resolveTime(
    { intent: { anchor: 'fixed_wall_time', ...plan.intent } },
    context,
  )
  if (current.status === 'error') return current
  if (current.status === 'underspecified') {
    return invalidPlan('The fixed-wall-time plan is missing required intent fields.')
  }

  const differences = versionDifference(
    plan.dependencies[0].version,
    context.timeZoneDataVersion,
  )
  if (current.status !== 'resolved') {
    return {
      current,
      differences: [
        ...differences,
        {
          current: current.status,
          field: 'resolution.status',
          previous: 'resolved',
        },
      ],
      status: 'drifted',
    }
  }
  if (current.plan.anchor !== 'fixed_wall_time') {
    return invalidPlan('The fixed-wall-time intent resolved to the wrong plan anchor.')
  }

  if (current.plan.resolution.instant !== plan.resolution.instant) {
    differences.push({
      current: current.plan.resolution.instant,
      field: 'resolution.instant',
      previous: plan.resolution.instant,
    })
  }
  if (current.plan.resolution.offset !== plan.resolution.offset) {
    differences.push({
      current: current.plan.resolution.offset,
      field: 'resolution.offset',
      previous: plan.resolution.offset,
    })
  }

  const semanticDifferences = differences.filter(
    (difference) => difference.field !== 'dependencies[0].version',
  )
  if (semanticDifferences.length) {
    return { current, differences, status: 'drifted' }
  }
  return {
    currentPlan: current.plan,
    dependencyChanges: differences,
    status: 'unchanged',
  }
}
