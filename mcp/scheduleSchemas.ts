import { z } from 'zod'
import {
  MAX_SCHEDULE_DATE_OVERRIDES,
  MAX_SCHEDULE_INSTANCES,
  MAX_SCHEDULE_INTERVAL,
  SCHEDULE_PLAN_SCHEMA_VERSION,
} from '../src/lib/scheduleTypes'
import {
  fixedWallTimePlanSchema,
  timeZoneCandidateSchema,
} from './timePlanSchemas'

const localMinuteSchema = z.string().trim().min(1).max(32)
const localDateSchema = z.string().trim().min(1).max(16)
const intervalValueSchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_SCHEDULE_INTERVAL)
const intervalSchema = intervalValueSchema.optional()

const weekdaySchema = z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'])

const scheduleRuleSchema = z.discriminatedUnion('frequency', [
  z.object({ frequency: z.literal('daily'), interval: intervalSchema }).strict(),
  z
    .object({
      frequency: z.literal('weekly'),
      interval: intervalSchema,
      weekdays: z
        .array(weekdaySchema)
        .min(1)
        .max(7)
        .optional(),
    })
    .strict(),
  z.object({ frequency: z.literal('monthly'), interval: intervalSchema }).strict(),
])

const normalizedScheduleRuleSchema = z.discriminatedUnion('frequency', [
  z.object({ frequency: z.literal('daily'), interval: intervalValueSchema }).strict(),
  z
    .object({
      frequency: z.literal('weekly'),
      interval: intervalValueSchema,
      weekdays: z.array(weekdaySchema).min(1).max(7),
    })
    .strict(),
  z.object({ frequency: z.literal('monthly'), interval: intervalValueSchema }).strict(),
])

const normalizedSchedulePoliciesSchema = z
  .object({
    gap: z.enum(['reject', 'skip', 'shift_backward', 'shift_forward']),
    monthOverflow: z.enum(['constrain_to_last_day', 'reject', 'skip']),
    overlap: z.enum(['both', 'earlier', 'later', 'reject']),
  })
  .strict()

const schedulePlanRequestSchema = z
  .object({
    additionalLocalDateTimes: z.array(localMinuteSchema).max(MAX_SCHEDULE_DATE_OVERRIDES),
    cursor: localMinuteSchema.optional(),
    excludedLocalDateTimes: z.array(localMinuteSchema).max(MAX_SCHEDULE_DATE_OVERRIDES),
    maxInstances: z.number().int().min(1).max(MAX_SCHEDULE_INSTANCES),
    policies: normalizedSchedulePoliciesSchema,
    rule: normalizedScheduleRuleSchema,
    startLocalDateTime: localMinuteSchema,
    timeZone: z.string().trim().min(1).max(80),
    window: z
      .object({
        endDateExclusive: localDateSchema,
        startDateInclusive: localDateSchema,
      })
      .strict(),
  })
  .strict()
  .meta({ id: 'SchedulePlanRequest' })

export const expandScheduleInputSchema = z
  .object({
    additionalLocalDateTimes: z
      .array(localMinuteSchema)
      .max(MAX_SCHEDULE_DATE_OVERRIDES)
      .optional()
      .describe('Explicit local recurrence dates. Combined RDATE/EXDATE limit is enforced by the runtime.'),
    cursor: localMinuteSchema
      .optional()
      .describe('Last processed local candidate returned as nextCursor; later candidates only.'),
    excludedLocalDateTimes: z
      .array(localMinuteSchema)
      .max(MAX_SCHEDULE_DATE_OVERRIDES)
      .optional(),
    locale: z.enum(['zh', 'en']).optional(),
    maxInstances: z
      .number()
      .int()
      .min(1)
      .max(MAX_SCHEDULE_INSTANCES)
      .optional(),
    policies: z
      .object({
        gap: z
          .enum(['reject', 'skip', 'shift_backward', 'shift_forward'])
          .optional(),
        monthOverflow: z
          .enum(['constrain_to_last_day', 'reject', 'skip'])
          .optional(),
        overlap: z.enum(['both', 'earlier', 'later', 'reject']).optional(),
      })
      .strict()
      .optional()
      .describe('All policies default to reject so the tool never guesses.'),
    rule: scheduleRuleSchema,
    startLocalDateTime: localMinuteSchema.describe(
      'DTSTART-like local calendar minute in exact YYYY-MM-DDTHH:mm form.',
    ),
    timeZone: z.string().trim().min(1).max(80),
    window: z
      .object({
        endDateExclusive: localDateSchema,
        startDateInclusive: localDateSchema,
      })
      .strict()
      .describe('Required bounded local-date window; end date is exclusive.'),
  })
  .strict()

const scheduleErrorSchema = z
  .object({
    candidates: z.array(timeZoneCandidateSchema).max(10).optional(),
    code: z.enum([
      'AMBIGUOUS_TIME_ZONE',
      'DUPLICATE_SCHEDULE_DATE',
      'INTERNAL_ERROR',
      'INVALID_CURSOR',
      'INVALID_FORMAT',
      'INVALID_SCHEDULE',
      'INVALID_SCHEDULE_PLAN',
      'INVALID_WINDOW',
      'RANGE_TOO_LARGE',
      'TOO_MANY_SCHEDULE_DATES',
      'UNKNOWN_TIME_ZONE',
      'UNSUPPORTED_PRECISION',
      'UNSUPPORTED_YEAR',
    ]),
    field: z.string().optional(),
    input: z.string().optional(),
    message: z.string(),
    retryable: z.literal(false),
  })
  .strict()

const scheduleEffectSchema = z.union([
  z.object({ kind: z.literal('excluded'), localDateTime: z.string() }).strict(),
  z.object({ kind: z.literal('gap_skipped'), localDateTime: z.string() }).strict(),
  z
    .object({
      direction: z.enum(['backward', 'forward']),
      fromLocalDateTime: z.string(),
      kind: z.literal('gap_shifted'),
      toLocalDateTime: z.string(),
    })
    .strict(),
  z
    .object({
      action: z.literal('constrained'),
      calendarMonth: z.string(),
      effectiveLocalDateTime: z.string(),
      kind: z.literal('month_overflow'),
      requestedDay: z.number().int().min(1).max(31),
    })
    .strict(),
  z
    .object({
      action: z.literal('skipped'),
      calendarMonth: z.string(),
      kind: z.literal('month_overflow'),
      requestedDay: z.number().int().min(1).max(31),
    })
    .strict(),
])

const scheduleConflictSchema = z.union([
  z
    .object({
      kind: z.literal('dst_gap'),
      localDateTime: z.string(),
      timeZone: z.string(),
    })
    .strict(),
  z
    .object({
      candidates: z
        .array(
          z
            .object({
              choice: z.enum(['earlier', 'later']),
              instant: z.string(),
              offset: z.string(),
            })
            .strict(),
        )
        .length(2),
      kind: z.literal('dst_overlap'),
      localDateTime: z.string(),
      timeZone: z.string(),
    })
    .strict(),
  z
    .object({
      calendarMonth: z.string(),
      kind: z.literal('month_overflow'),
      requestedDay: z.number().int().min(1).max(31),
    })
    .strict(),
])

export const expandedSchedulePlanSchema = z
    .object({
      context: z
        .object({
          timeZoneData: z.literal('IANA'),
          timeZoneDataVersion: z.string().min(1).max(80),
        })
        .strict(),
      dependencies: z
        .tuple([
          z
            .object({
              timeZone: z.string().min(1).max(80),
              type: z.literal('tzdb'),
              version: z.string().min(1).max(80),
            })
            .strict(),
        ]),
      effects: z.array(scheduleEffectSchema).max(128),
      instances: z
        .array(
          z
            .object({
              effectiveLocalDateTime: z.string(),
              plans: z.array(fixedWallTimePlanSchema).min(1).max(2),
              scheduledLocalDateTime: z.string(),
              sources: z.array(z.enum(['rdate', 'rule'])).min(1).max(2),
            })
            .strict(),
        )
        .max(MAX_SCHEDULE_INSTANCES),
      nextCursor: z.string().nullable(),
      request: schedulePlanRequestSchema,
      revalidation: z
        .object({ triggers: z.tuple([z.literal('tzdb_change')]) })
        .strict(),
      schemaVersion: z.literal(SCHEDULE_PLAN_SCHEMA_VERSION),
      status: z.literal('expanded'),
      truncated: z.boolean(),
    })
    .strict()
    .meta({ id: 'ExpandedSchedulePlan' })

export const scheduleConflictResultSchema = z
    .object({
      conflict: scheduleConflictSchema,
      status: z.literal('conflict'),
    })
    .strict()
    .meta({ id: 'ScheduleConflictResult' })

export const scheduleErrorResultSchema = z
    .object({
      error: scheduleErrorSchema,
      status: z.literal('error'),
    })
    .strict()
    .meta({ id: 'ScheduleErrorResult' })

export const expandScheduleResultSchema = z.discriminatedUnion('status', [
  expandedSchedulePlanSchema,
  scheduleConflictResultSchema,
  scheduleErrorResultSchema,
])
