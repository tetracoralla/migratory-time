import { fingerprintDefinition } from './definitionFingerprint'
import { expandSchedule } from './schedule'
import {
  SCHEDULE_PLAN_SCHEMA_VERSION,
  type ExpandedScheduleResult,
  type ScheduleErrorResult,
  type SchedulePlanDifference,
  type ValidateSchedulePlanResult,
} from './scheduleTypes'
import type { TimePlanContext } from './timePlanTypes'

function invalidPlan(message: string): ScheduleErrorResult {
  return {
    error: {
      code: 'INVALID_SCHEDULE_PLAN',
      field: 'plan',
      message,
      retryable: false,
    },
    status: 'error',
  }
}

function expansionFingerprint(plan: ExpandedScheduleResult) {
  return fingerprintDefinition({
    effects: plan.effects,
    instances: plan.instances.map((instance) => ({
      effectiveLocalDateTime: instance.effectiveLocalDateTime,
      plans: instance.plans.map((timePlan) => ({
        anchor: timePlan.anchor,
        intent: timePlan.intent,
        resolution: timePlan.resolution,
      })),
      scheduledLocalDateTime: instance.scheduledLocalDateTime,
      sources: instance.sources,
    })),
    nextCursor: plan.nextCursor,
    truncated: plan.truncated,
  })
}

function assertPlanShape(plan: ExpandedScheduleResult) {
  return (
    plan.schemaVersion === SCHEDULE_PLAN_SCHEMA_VERSION
    && plan.dependencies?.length === 1
    && plan.dependencies[0]?.type === 'tzdb'
    && plan.dependencies[0].timeZone === plan.request?.timeZone
    && plan.revalidation?.triggers?.length === 1
    && plan.revalidation.triggers[0] === 'tzdb_change'
    && plan.instances.length <= plan.request.maxInstances
  )
}

export function validateSchedulePlan(
  plan: ExpandedScheduleResult,
  context: TimePlanContext,
): ValidateSchedulePlanResult {
  if (plan.schemaVersion !== SCHEDULE_PLAN_SCHEMA_VERSION) {
    return {
      currentContext: context,
      reason: `This runtime supports ${SCHEDULE_PLAN_SCHEMA_VERSION}, not ${String(plan.schemaVersion)}.`,
      status: 'unverifiable',
    }
  }
  if (!assertPlanShape(plan)) {
    return invalidPlan(
      'The schedule plan has inconsistent dependency, request, revalidation, or instance metadata.',
    )
  }

  const dependencyChanges: SchedulePlanDifference[] =
    plan.dependencies[0].version === context.timeZoneDataVersion
      ? []
      : [
          {
            current: context.timeZoneDataVersion,
            field: 'dependencies[0].version',
            previous: plan.dependencies[0].version,
          },
        ]
  const current = expandSchedule(plan.request, context)
  if (current.status === 'error') return current
  if (current.status !== 'expanded') {
    return {
      current,
      differences: [
        ...dependencyChanges,
        {
          current: current.status,
          field: 'resolution.status',
          previous: 'expanded',
        },
      ],
      status: 'drifted',
    }
  }
  const previousFingerprint = expansionFingerprint(plan)
  const currentFingerprint = expansionFingerprint(current)
  if (previousFingerprint !== currentFingerprint) {
    return {
      current,
      differences: [
        ...dependencyChanges,
        {
          current: currentFingerprint,
          field: 'resolution.expansion',
          previous: previousFingerprint,
        },
      ],
      status: 'drifted',
    }
  }
  return {
    currentPlan: current,
    dependencyChanges,
    status: 'unchanged',
  }
}
