import type { Temporal } from '@js-temporal/polyfill'
import { resolveTimeZoneInput } from '../data/timeZoneRegistry'
import type { Locale } from '../types'
import {
  hasMinutePrecisionAcrossTimeZones,
  MIN_SUPPORTED_YEAR,
  resolveWallTime,
} from './timeConversion'
import { getTemporal } from './temporal'
import { parseIsoLocalMinute } from './isoCalendar'
import {
  TIME_PLAN_SCHEMA_VERSION,
  type FixedInstantTimePlan,
  type FixedWallTimePlan,
  type ResolveTimeInput,
  type ResolveTimeResult,
  type TimePlanContext,
  type TimePlanDisambiguation,
  type TimePlanError,
  type TimePlanErrorResult,
  type UnderspecifiedTimeResult,
} from './timePlanTypes'

export * from './timePlanTypes'

class TimePlanInputError extends Error {
  readonly detail: TimePlanError

  constructor(detail: Omit<TimePlanError, 'retryable'>) {
    super(detail.message)
    this.detail = { ...detail, retryable: false }
  }
}

function errorResult(error: unknown): TimePlanErrorResult {
  if (error instanceof TimePlanInputError) {
    return { error: error.detail, status: 'error' }
  }
  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unexpected internal error',
      retryable: false,
    },
    status: 'error',
  }
}

function parseLocalMinute(localDateTime: string) {
  const parsed = parseIsoLocalMinute(localDateTime, 'T')
  if (parsed.status === 'unsupported_year') {
    throw new TimePlanInputError({
      code: 'UNSUPPORTED_YEAR',
      field: 'intent.localDateTime',
      input: localDateTime,
      message: `localDateTime must be in year ${MIN_SUPPORTED_YEAR} or later.`,
    })
  }
  if (parsed.status === 'invalid') {
    throw new TimePlanInputError({
      code: 'INVALID_FORMAT',
      field: 'intent.localDateTime',
      input: localDateTime,
      message:
        'localDateTime must name a real ISO calendar minute in exact YYYY-MM-DDTHH:mm form.',
    })
  }
  return parsed
}

function canonicalTimeZone(timeZone: string, locale: Locale) {
  const resolution = resolveTimeZoneInput(timeZone, locale)
  if (resolution.status === 'resolved') return resolution.timeZone.id
  if (resolution.status === 'ambiguous') {
    throw new TimePlanInputError({
      candidates: resolution.candidates,
      code: 'AMBIGUOUS_TIME_ZONE',
      field: 'intent.timeZone',
      input: timeZone,
      message: 'timeZone matches more than one zone; use one candidate IANA id.',
    })
  }
  throw new TimePlanInputError({
    code: 'UNKNOWN_TIME_ZONE',
    field: 'intent.timeZone',
    input: timeZone,
    message: 'timeZone is not a known IANA time zone or unambiguous region name.',
  })
}

function assertMinutePrecision(instant: Temporal.Instant, timeZone: string) {
  if (!hasMinutePrecisionAcrossTimeZones(instant, [timeZone])) {
    throw new TimePlanInputError({
      code: 'UNSUPPORTED_PRECISION',
      field: 'intent.localDateTime',
      message:
        'The resolved historical time-zone offset has sub-minute precision; this TimePlan version does not round it.',
    })
  }
}

function fixedInstantPlan(instant: string): FixedInstantTimePlan {
  let canonicalInstant: string
  try {
    canonicalInstant = getTemporal().Instant.from(instant).toString()
  } catch {
    throw new TimePlanInputError({
      code: 'INVALID_INSTANT',
      field: 'intent.instant',
      input: instant,
      message: 'instant must be an exact ISO 8601 / RFC 3339 timestamp with an offset.',
    })
  }
  return {
    anchor: 'fixed_instant',
    dependencies: [],
    intent: { instant: canonicalInstant },
    resolution: { instant: canonicalInstant },
    revalidation: { trigger: 'none' },
    schemaVersion: TIME_PLAN_SCHEMA_VERSION,
  }
}

function fixedWallTimePlan(
  localDateTime: string,
  timeZone: string,
  disambiguation: TimePlanDisambiguation,
  instant: Temporal.Instant,
  context: TimePlanContext,
): FixedWallTimePlan {
  assertMinutePrecision(instant, timeZone)
  return {
    anchor: 'fixed_wall_time',
    dependencies: [
      {
        timeZone,
        type: 'tzdb',
        version: context.timeZoneDataVersion,
      },
    ],
    intent: { disambiguation, localDateTime, timeZone },
    resolution: {
      instant: instant.toString(),
      offset: instant.toZonedDateTimeISO(timeZone).offset,
    },
    revalidation: { trigger: 'tzdb_change' },
    schemaVersion: TIME_PLAN_SCHEMA_VERSION,
  }
}

function resolveTimeUnsafe(
  input: ResolveTimeInput,
  context: TimePlanContext,
): Exclude<ResolveTimeResult, TimePlanErrorResult> {
  if (input.intent.anchor === 'fixed_instant') {
    if (input.intent.instant === undefined) {
      return { missing: ['intent.instant'], status: 'underspecified' }
    }
    return { plan: fixedInstantPlan(input.intent.instant), status: 'resolved' }
  }

  const missing: UnderspecifiedTimeResult['missing'] = []
  if (input.intent.localDateTime === undefined) missing.push('intent.localDateTime')
  if (input.intent.timeZone === undefined) missing.push('intent.timeZone')
  if (missing.length) return { missing, status: 'underspecified' }

  const localDateTime = input.intent.localDateTime as string
  const timeZone = canonicalTimeZone(input.intent.timeZone as string, input.locale ?? 'en')
  const disambiguation = input.intent.disambiguation ?? 'reject'
  const parsed = parseLocalMinute(localDateTime)
  const resolution = resolveWallTime(parsed.date, parsed.time, timeZone)
  const source = { localDateTime, timeZone }

  if (resolution.status === 'nonexistent') {
    return {
      reason:
        'This local date and time does not exist because a time-zone transition skipped it.',
      source,
      status: 'nonexistent',
    }
  }
  if (resolution.status === 'unsupported') {
    throw new TimePlanInputError({
      code: 'UNSUPPORTED_YEAR',
      field: 'intent.localDateTime',
      input: localDateTime,
      message: `localDateTime must be in year ${MIN_SUPPORTED_YEAR} or later.`,
    })
  }
  if (resolution.status === 'ambiguous') {
    if (disambiguation === 'reject') {
      return {
        candidates: [
          {
            choice: 'earlier',
            plan: fixedWallTimePlan(
              localDateTime,
              timeZone,
              'earlier',
              resolution.earlier,
              context,
            ),
          },
          {
            choice: 'later',
            plan: fixedWallTimePlan(
              localDateTime,
              timeZone,
              'later',
              resolution.later,
              context,
            ),
          },
        ],
        source,
        status: 'ambiguous',
      }
    }
    return {
      plan: fixedWallTimePlan(
        localDateTime,
        timeZone,
        disambiguation,
        disambiguation === 'earlier' ? resolution.earlier : resolution.later,
        context,
      ),
      status: 'resolved',
    }
  }

  return {
    plan: fixedWallTimePlan(
      localDateTime,
      timeZone,
      disambiguation,
      resolution.instant,
      context,
    ),
    status: 'resolved',
  }
}

export function resolveTime(
  input: ResolveTimeInput,
  context: TimePlanContext,
): ResolveTimeResult {
  try {
    return resolveTimeUnsafe(input, context)
  } catch (error) {
    return errorResult(error)
  }
}
