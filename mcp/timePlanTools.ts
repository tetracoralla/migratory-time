import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  resolveTime,
  type ResolveTimeResult,
  type TimePlanInput,
  type ValidateTimePlanResult,
} from '../src/lib/timePlan'
import { validateTimePlan } from '../src/lib/timePlanValidation'
import {
  validateBusinessDeadlinePlan,
} from '../src/lib/businessDeadlineValidation'
import type {
  ValidateBusinessDeadlinePlanResult,
} from '../src/lib/businessCalendarTypes'
import {
  validateAvailabilityPlan,
} from '../src/lib/availabilityPlanValidation'
import type {
  ValidateAvailabilityPlanResult,
} from '../src/lib/availabilityTypes'
import { validateSchedulePlan } from '../src/lib/schedulePlanValidation'
import type {
  ExpandedScheduleResult,
  ValidateSchedulePlanResult,
} from '../src/lib/scheduleTypes'
import {
  resolveTimeInputSchema,
  resolveTimeResultSchema,
} from './timePlanSchemas'
import {
  validateTemporalPlanInputSchema,
  validateTemporalPlanResultSchema,
} from './planValidationSchemas'
import {
  readOnlyAnnotations,
  timePlanContext,
  validatedToolResult,
} from './toolSupport'

function resolveTimeText(result: ResolveTimeResult) {
  if (result.status === 'resolved') {
    if (result.plan.anchor === 'fixed_instant') {
      return `Resolved fixed instant: ${result.plan.resolution.instant}`
    }
    return `${result.plan.intent.localDateTime}[${result.plan.intent.timeZone}] resolves to ${result.plan.resolution.instant} (${result.plan.resolution.offset}); revalidate when tzdb changes.`
  }
  if (result.status === 'ambiguous') {
    return `This wall time occurs twice. Choose earlier (${result.candidates[0].plan.resolution.instant}) or later (${result.candidates[1].plan.resolution.instant}).`
  }
  if (result.status === 'underspecified') {
    return `More information is required: ${result.missing.join(', ')}.`
  }
  if (result.status === 'nonexistent') return result.reason
  return `${result.error.code}: ${result.error.message}`
}

function validateTimePlanText(
  result:
    | ValidateTimePlanResult
    | ValidateBusinessDeadlinePlanResult
    | ValidateAvailabilityPlanResult
    | ValidateSchedulePlanResult,
) {
  if (result.status === 'unchanged') {
    if (!result.dependencyChanges.length) {
      return 'The plan is unchanged under the current runtime.'
    }
    const changedFields = result.dependencyChanges
      .map((change) => change.field)
      .join(', ')
    return `The plan still resolves to the same result; dependencies changed: ${changedFields}.`
  }
  if (result.status === 'drifted') {
    return `The plan drifted: ${result.differences.map((difference) => difference.field).join(', ')}.`
  }
  if (result.status === 'unverifiable') return result.reason
  return `${result.error.code}: ${result.error.message}`
}

export function registerTimePlanTools(server: McpServer) {
  server.registerTool(
    'resolve_time',
    {
      annotations: readOnlyAnnotations,
      description:
        'Compile explicit fixed-instant or fixed-wall-time intent into a replayable TimePlan. Status is resolved, ambiguous, underspecified, nonexistent, or error.',
      inputSchema: resolveTimeInputSchema,
      title: 'Resolve a reusable time plan',
    },
    async (input) => {
      const result = resolveTime(input, timePlanContext)
      return validatedToolResult(resolveTimeResultSchema, result, resolveTimeText(result))
    },
  )

  server.registerTool(
    'validate_time_plan',
    {
      annotations: readOnlyAnnotations,
      description:
        'Recompute one stored plan without mutation. Fixed time: {plan}. Schedule: {kind:"schedule",plan}. Business deadline: {kind:"business_deadline",plan,currentCalendar}; currentCalendar must be the complete BusinessCalendar, not a dependency summary. Availability: {kind:"availability",plan,currentSnapshot:{participants,snapshot,locale?}}. Returns unchanged, drifted, unverifiable, or error.',
      inputSchema: validateTemporalPlanInputSchema,
      title: 'Revalidate a time plan',
    },
    async (input) => {
      let result:
        | ValidateTimePlanResult
        | ValidateBusinessDeadlinePlanResult
        | ValidateAvailabilityPlanResult
        | ValidateSchedulePlanResult
      if (!('kind' in input)) {
        result = validateTimePlan(input.plan as TimePlanInput, timePlanContext)
      } else if (input.kind === 'business_deadline') {
        const plan = {
          ...input.plan,
          resolution: {
            ...input.plan.resolution,
            boundaryAdjustmentsTruncated:
              input.plan.resolution.boundaryAdjustmentsTruncated
              ?? input.plan.resolution.boundaryAdjustmentCount
                > input.plan.resolution.boundaryAdjustments.length,
          },
        }
        result = validateBusinessDeadlinePlan(
          plan,
          input.currentCalendar,
          input.locale ?? 'en',
          timePlanContext,
        )
      } else if (input.kind === 'availability') {
        result = validateAvailabilityPlan(
          input.plan,
          input.currentSnapshot,
          timePlanContext,
        )
      } else {
        result = validateSchedulePlan(
          input.plan as ExpandedScheduleResult,
          timePlanContext,
        )
      }
      return validatedToolResult(
        validateTemporalPlanResultSchema,
        result,
        validateTimePlanText(result),
      )
    },
  )
}
