import { formatIsoDate, formatIsoLocalMinute } from './isoCalendar'
import {
  addScheduleCandidate,
  assertUniqueScheduleValues,
  canonicalScheduleTimeZone,
  generateScheduleCandidates,
  normalizeSchedulePolicies,
  normalizeScheduleRule,
  parseScheduleLocalDateTime,
  parseScheduleWindowDate,
  type NormalizedSchedulePolicies,
} from './scheduleCandidates'
import {
  mapTimePlanError,
  scheduleErrorResult,
  scheduleInputError,
} from './scheduleErrors'
import { resolveTime } from './timePlan'
import type { FixedWallTimePlan, TimePlanContext } from './timePlanTypes'
import { getTemporal } from './temporal'
import {
  MAX_SCHEDULE_DATE_OVERRIDES,
  MAX_SCHEDULE_INSTANCES,
  MAX_SCHEDULE_RANGE_DAYS,
  SCHEDULE_PLAN_SCHEMA_VERSION,
  type ExpandScheduleInput,
  type ExpandScheduleResult,
  type ScheduleConflict,
  type ScheduleEffect,
  type ScheduleErrorResult,
} from './scheduleTypes'

export * from './scheduleTypes'

function shiftedLocalDateTime(
  localDateTime: string,
  timeZone: string,
  direction: 'backward' | 'forward',
) {
  const parsed = parseScheduleLocalDateTime(localDateTime, 'candidate.localDateTime')
  const shifted = getTemporal().ZonedDateTime.from(
    {
      day: parsed.day,
      hour: parsed.hour,
      minute: parsed.minute,
      month: parsed.month,
      timeZone,
      year: parsed.year,
    },
    {
      disambiguation: direction === 'forward' ? 'later' : 'earlier',
      overflow: 'reject',
    },
  )
  return formatIsoLocalMinute(shifted.toPlainDateTime())
}

function resolveCandidate(
  localDateTime: string,
  timeZone: string,
  policies: NormalizedSchedulePolicies,
  context: TimePlanContext,
  effects: ScheduleEffect[],
):
  | { plans: FixedWallTimePlan[]; effectiveLocalDateTime: string }
  | { conflict: ScheduleConflict }
  | { skipped: true } {
  const result = resolveTime(
    {
      intent: {
        anchor: 'fixed_wall_time',
        localDateTime,
        timeZone,
      },
    },
    context,
  )
  if (result.status === 'error') mapTimePlanError(result.error)
  if (result.status === 'underspecified') {
    scheduleInputError('INVALID_SCHEDULE', 'schedule', 'A generated occurrence was underspecified.')
  }
  if (result.status === 'ambiguous') {
    if (policies.overlap === 'reject') {
      return {
        conflict: {
          candidates: result.candidates.map(({ choice, plan }) => ({
            choice,
            instant: plan.resolution.instant,
            offset: plan.resolution.offset,
          })),
          kind: 'dst_overlap',
          localDateTime,
          timeZone,
        },
      }
    }
    const plans = policies.overlap === 'both'
      ? result.candidates.map(({ plan }) => plan)
      : [
          result.candidates.find(({ choice }) => choice === policies.overlap)?.plan,
        ].filter((plan): plan is FixedWallTimePlan => plan !== undefined)
    return { effectiveLocalDateTime: localDateTime, plans }
  }
  if (result.status === 'nonexistent') {
    if (policies.gap === 'reject') {
      return {
        conflict: { kind: 'dst_gap', localDateTime, timeZone },
      }
    }
    if (policies.gap === 'skip') {
      effects.push({ kind: 'gap_skipped', localDateTime })
      return { skipped: true }
    }
    const direction = policies.gap === 'shift_forward' ? 'forward' : 'backward'
    const effectiveLocalDateTime = shiftedLocalDateTime(
      localDateTime,
      timeZone,
      direction,
    )
    const shifted = resolveTime(
      {
        intent: {
          anchor: 'fixed_wall_time',
          localDateTime: effectiveLocalDateTime,
          timeZone,
        },
      },
      context,
    )
    if (shifted.status === 'error') mapTimePlanError(shifted.error)
    if (shifted.status !== 'resolved' || shifted.plan.anchor !== 'fixed_wall_time') {
      scheduleInputError(
        'INVALID_SCHEDULE',
        'policies.gap',
        'The selected gap policy did not produce one valid wall-time plan.',
      )
    }
    effects.push({
      direction,
      fromLocalDateTime: localDateTime,
      kind: 'gap_shifted',
      toLocalDateTime: effectiveLocalDateTime,
    })
    return { effectiveLocalDateTime, plans: [shifted.plan] }
  }
  if (result.plan.anchor !== 'fixed_wall_time') {
    scheduleInputError('INVALID_SCHEDULE', 'schedule', 'A wall-time occurrence resolved to the wrong plan anchor.')
  }
  return { effectiveLocalDateTime: localDateTime, plans: [result.plan] }
}

function expandScheduleUnsafe(
  input: ExpandScheduleInput,
  context: TimePlanContext,
): Exclude<ExpandScheduleResult, ScheduleErrorResult> {
  const scheduleStart = parseScheduleLocalDateTime(
    input.startLocalDateTime,
    'startLocalDateTime',
  )
  const windowStart = parseScheduleWindowDate(
    input.window.startDateInclusive,
    'window.startDateInclusive',
  )
  const windowEnd = parseScheduleWindowDate(
    input.window.endDateExclusive,
    'window.endDateExclusive',
  )
  if (getTemporal().PlainDate.compare(windowStart, windowEnd) >= 0) {
    scheduleInputError(
      'INVALID_WINDOW',
      'window',
      'window.startDateInclusive must be earlier than window.endDateExclusive.',
    )
  }
  const rangeDays = windowStart.until(windowEnd).days
  if (rangeDays > MAX_SCHEDULE_RANGE_DAYS) {
    scheduleInputError(
      'RANGE_TOO_LARGE',
      'window',
      `The local-date window may span at most ${MAX_SCHEDULE_RANGE_DAYS} days.`,
    )
  }

  const overrideCount =
    (input.additionalLocalDateTimes?.length ?? 0)
    + (input.excludedLocalDateTimes?.length ?? 0)
  if (overrideCount > MAX_SCHEDULE_DATE_OVERRIDES) {
    scheduleInputError(
      'TOO_MANY_SCHEDULE_DATES',
      'additionalLocalDateTimes',
      `Additional and excluded local date-times may contain at most ${MAX_SCHEDULE_DATE_OVERRIDES} items in total.`,
    )
  }
  assertUniqueScheduleValues(input.additionalLocalDateTimes ?? [], 'additionalLocalDateTimes')
  assertUniqueScheduleValues(input.excludedLocalDateTimes ?? [], 'excludedLocalDateTimes')

  const maxInstances = input.maxInstances ?? MAX_SCHEDULE_INSTANCES
  if (
    !Number.isInteger(maxInstances)
    || maxInstances < 1
    || maxInstances > MAX_SCHEDULE_INSTANCES
  ) {
    scheduleInputError(
      'INVALID_SCHEDULE',
      'maxInstances',
      `maxInstances must be an integer from 1 to ${MAX_SCHEDULE_INSTANCES}.`,
    )
  }

  const cursor = input.cursor === undefined
    ? undefined
    : parseScheduleLocalDateTime(input.cursor, 'cursor', 'INVALID_CURSOR')
  const timeZone = canonicalScheduleTimeZone(input.timeZone, input.locale ?? 'en')
  const policies = normalizeSchedulePolicies(input.policies)
  const normalizedRule = normalizeScheduleRule(input.rule, scheduleStart)
  const additionalLocalDateTimes = (input.additionalLocalDateTimes ?? [])
    .map((value) => formatIsoLocalMinute(
      parseScheduleLocalDateTime(value, 'additionalLocalDateTimes'),
    ))
    .sort()
  const excludedLocalDateTimes = (input.excludedLocalDateTimes ?? [])
    .map((value) => formatIsoLocalMinute(
      parseScheduleLocalDateTime(value, 'excludedLocalDateTimes'),
    ))
    .sort()
  const effects: ScheduleEffect[] = []
  const generated = generateScheduleCandidates(
    input,
    scheduleStart,
    windowStart,
    windowEnd,
    cursor,
    policies,
    effects,
  )
  if (generated.conflict) {
    return { conflict: generated.conflict, status: 'conflict' }
  }

  for (const value of additionalLocalDateTimes) {
    const dateTime = parseScheduleLocalDateTime(value, 'additionalLocalDateTimes')
    addScheduleCandidate(
      generated.candidates,
      dateTime,
      'rdate',
      scheduleStart,
      windowStart,
      windowEnd,
      cursor,
    )
  }
  const excluded = new Set(
    excludedLocalDateTimes,
  )

  const orderedCandidates = [...generated.candidates.values()].sort((left, right) =>
    left.localDateTime.localeCompare(right.localDateTime),
  )
  const instances = []
  let nextCursor: string | null = null
  let truncated = false

  for (let index = 0; index < orderedCandidates.length; index += 1) {
    const candidate = orderedCandidates[index]
    if (excluded.has(candidate.localDateTime)) {
      effects.push({ kind: 'excluded', localDateTime: candidate.localDateTime })
    } else {
      const resolved = resolveCandidate(
        candidate.localDateTime,
        timeZone,
        policies,
        context,
        effects,
      )
      if ('conflict' in resolved) {
        return { conflict: resolved.conflict, status: 'conflict' }
      }
      if (!('skipped' in resolved)) {
        instances.push({
          effectiveLocalDateTime: resolved.effectiveLocalDateTime,
          plans: resolved.plans,
          scheduledLocalDateTime: candidate.localDateTime,
          sources: [...candidate.sources].sort((left, right) =>
            left === right ? 0 : left === 'rule' ? -1 : 1,
          ),
        })
      }
    }

    if (instances.length === maxInstances && index < orderedCandidates.length - 1) {
      truncated = true
      nextCursor = candidate.localDateTime
      break
    }
  }

  return {
    context,
    dependencies: [
      {
        timeZone,
        type: 'tzdb',
        version: context.timeZoneDataVersion,
      },
    ],
    effects,
    instances,
    nextCursor,
    request: {
      additionalLocalDateTimes,
      ...(cursor ? { cursor: formatIsoLocalMinute(cursor) } : {}),
      excludedLocalDateTimes,
      maxInstances,
      policies,
      rule: normalizedRule,
      startLocalDateTime: formatIsoLocalMinute(scheduleStart),
      timeZone,
      window: {
        endDateExclusive: formatIsoDate(windowEnd),
        startDateInclusive: formatIsoDate(windowStart),
      },
    },
    revalidation: { triggers: ['tzdb_change'] },
    schemaVersion: SCHEDULE_PLAN_SCHEMA_VERSION,
    status: 'expanded',
    truncated,
  }
}

export function expandSchedule(
  input: ExpandScheduleInput,
  context: TimePlanContext,
): ExpandScheduleResult {
  try {
    return expandScheduleUnsafe(input, context)
  } catch (error) {
    return scheduleErrorResult(error)
  }
}
