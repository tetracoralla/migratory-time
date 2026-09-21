import { businessErrorResult } from './businessCalendarErrors'
import { normalizeBusinessCalendar } from './businessCalendarValidation'
import { computeDeadline } from './businessDeadline'
import {
  BUSINESS_DEADLINE_SCHEMA_VERSION,
  type BusinessCalendar,
  type BusinessDeadlineDifference,
  type BusinessDeadlineDifferenceField,
  type BusinessDeadlineErrorResult,
  type BusinessDeadlinePlan,
  type ValidateBusinessDeadlinePlanResult,
} from './businessCalendarTypes'
import type { TimePlanContext } from './timePlanTypes'
import type { Locale } from '../types'

function invalidPlan(message: string): BusinessDeadlineErrorResult {
  return {
    error: {
      code: 'INVALID_BUSINESS_DEADLINE_PLAN',
      field: 'plan',
      message,
      retryable: false,
    },
    status: 'error',
  }
}

function difference(
  field: BusinessDeadlineDifferenceField,
  previous: string,
  current: string,
): BusinessDeadlineDifference[] {
  return previous === current ? [] : [{ current, field, previous }]
}

function assertPlanShape(plan: BusinessDeadlinePlan) {
  if (plan.schemaVersion !== BUSINESS_DEADLINE_SCHEMA_VERSION) return false
  if (plan.operation !== 'add_business_duration') return false
  if (
    plan.dependencies?.length !== 2
    || plan.dependencies[0]?.type !== 'business_calendar'
    || plan.dependencies[1]?.type !== 'tzdb'
    || plan.dependencies[0].timeZone !== plan.dependencies[1].timeZone
  ) return false
  if (
    plan.revalidation?.triggers?.[0] !== 'business_calendar_change'
    || plan.revalidation.triggers[1] !== 'tzdb_change'
    || plan.revalidation.triggers.length !== 2
  ) return false
  return (
    plan.resolution.businessMinutesConsumed === plan.intent.durationMinutes
    && plan.resolution.boundaryAdjustmentCount
      >= plan.resolution.boundaryAdjustments.length
    && plan.resolution.boundaryAdjustmentsTruncated
      === (
        plan.resolution.boundaryAdjustmentCount
        > plan.resolution.boundaryAdjustments.length
      )
  )
}

export function validateBusinessDeadlinePlan(
  plan: BusinessDeadlinePlan,
  calendar: BusinessCalendar,
  locale: Locale,
  context: TimePlanContext,
): ValidateBusinessDeadlinePlanResult {
  if (plan.schemaVersion !== BUSINESS_DEADLINE_SCHEMA_VERSION) {
    return {
      currentContext: context,
      reason: `This runtime supports ${BUSINESS_DEADLINE_SCHEMA_VERSION}, not ${String(plan.schemaVersion)}.`,
      status: 'unverifiable',
    }
  }
  if (!assertPlanShape(plan)) {
    return invalidPlan(
      'The business-deadline plan has inconsistent operation, dependency, revalidation, or resolution metadata.',
    )
  }

  try {
    const normalized = normalizeBusinessCalendar(calendar, locale)
    if (normalized.id !== plan.dependencies[0].id) {
      return {
        currentContext: context,
        reason: `The supplied calendar id ${normalized.id} does not match required dependency ${plan.dependencies[0].id}.`,
        status: 'unverifiable',
      }
    }

    const dependencyChanges = [
      ...difference(
        'dependencies[0].version',
        plan.dependencies[0].version,
        normalized.version,
      ),
      ...difference(
        'dependencies[0].definitionFingerprint',
        plan.dependencies[0].definitionFingerprint,
        normalized.definitionFingerprint,
      ),
      ...difference(
        'dependencies[1].version',
        plan.dependencies[1].version,
        context.timeZoneDataVersion,
      ),
    ]
    const current = computeDeadline(
      {
        calendar,
        durationMinutes: plan.intent.durationMinutes,
        locale,
        startInstant: plan.intent.startInstant,
        startPolicy: plan.intent.startPolicy,
      },
      context,
    )
    if (current.status === 'error') return current
    if (current.status !== 'computed') {
      return {
        current,
        differences: [
          ...dependencyChanges,
          {
            current: current.status,
            field: 'resolution.status',
            previous: 'computed',
          },
        ],
        status: 'drifted',
      }
    }

    const semanticDifferences = [
      ...difference(
        'resolution.deadlineInstant',
        plan.resolution.deadlineInstant,
        current.plan.resolution.deadlineInstant,
      ),
      ...difference(
        'resolution.deadlineLocalDateTime',
        plan.resolution.deadlineLocalDateTime,
        current.plan.resolution.deadlineLocalDateTime,
      ),
      ...difference(
        'resolution.deadlineOffset',
        plan.resolution.deadlineOffset,
        current.plan.resolution.deadlineOffset,
      ),
      ...difference(
        'resolution.effectiveStartInstant',
        plan.resolution.effectiveStartInstant,
        current.plan.resolution.effectiveStartInstant,
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
      currentPlan: current.plan,
      dependencyChanges,
      status: 'unchanged',
    }
  } catch (error) {
    return businessErrorResult(error)
  }
}
