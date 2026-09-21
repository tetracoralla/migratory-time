import { z } from 'zod'
import {
  BUSINESS_CALENDAR_SCHEMA_VERSION,
  BUSINESS_DEADLINE_SCHEMA_VERSION,
  MAX_BUSINESS_BOUNDARY_ADJUSTMENTS,
  MAX_BUSINESS_CALENDAR_EXCEPTIONS,
  MAX_BUSINESS_DURATION_MINUTES,
  MAX_BUSINESS_INTERVALS_PER_DAY,
} from '../src/lib/businessCalendarTypes'
import { timeZoneCandidateSchema } from './timePlanSchemas'

const businessIntervalSchema = z
  .object({
    end: z.string().trim().min(1).max(5),
    endDayOffset: z.union([z.literal(0), z.literal(1)]).optional(),
    start: z.string().trim().min(1).max(5),
  })
  .strict()
  .meta({ id: 'BusinessInterval' })

const businessIntervalsSchema = z
  .array(businessIntervalSchema)
  .max(MAX_BUSINESS_INTERVALS_PER_DAY)
  .meta({ id: 'BusinessIntervals' })

const weeklyHoursSchema = z
  .object({
    FR: businessIntervalsSchema.optional(),
    MO: businessIntervalsSchema.optional(),
    SA: businessIntervalsSchema.optional(),
    SU: businessIntervalsSchema.optional(),
    TH: businessIntervalsSchema.optional(),
    TU: businessIntervalsSchema.optional(),
    WE: businessIntervalsSchema.optional(),
  })
  .strict()

export const businessCalendarSchema = z
  .object({
    boundaryPolicies: z
      .object({
        gap: z
          .enum(['reject', 'shift_backward', 'shift_forward'])
          .optional(),
        overlap: z.enum(['earlier', 'later', 'reject']).optional(),
      })
      .strict()
      .optional()
      .describe('Both DST boundary policies default to reject.'),
    exceptions: z
      .array(
        z
          .object({
            date: z.string().trim().min(1).max(16),
            intervals: businessIntervalsSchema,
          })
          .strict(),
      )
      .max(MAX_BUSINESS_CALENDAR_EXCEPTIONS)
      .optional()
      .describe('Each date fully replaces weekly hours; an empty list closes it.'),
    id: z.string().trim().min(1).max(128),
    schemaVersion: z.literal(BUSINESS_CALENDAR_SCHEMA_VERSION),
    timeZone: z.string().trim().min(1).max(80),
    version: z.string().trim().min(1).max(64),
    weeklyHours: weeklyHoursSchema,
  })
  .strict()
  .meta({ id: 'BusinessCalendar' })

export const computeDeadlineInputSchema = z
  .object({
    calendar: businessCalendarSchema,
    durationMinutes: z
      .number()
      .int()
      .min(0)
      .max(MAX_BUSINESS_DURATION_MINUTES),
    locale: z.enum(['zh', 'en']).optional(),
    startInstant: z.string().trim().min(1).max(96),
    startPolicy: z.enum(['next_open', 'reject']).optional().describe(
      'Defaults to reject when the exact start is outside business time.',
    ),
  })
  .strict()

const businessCalendarDependencySchema = z
  .object({
    definitionFingerprint: z.string().describe(
      'Fingerprint of normalized operational calendar content; excludes provider id and version metadata.',
    ),
    id: z.string(),
    timeZone: z.string(),
    type: z.literal('business_calendar'),
    version: z.string(),
  })
  .strict()

const tzdbDependencySchema = z
  .object({
    timeZone: z.string(),
    type: z.literal('tzdb'),
    version: z.string(),
  })
  .strict()

const adjustmentSchema = z
  .object({
    boundary: z.enum(['end', 'start']),
    direction: z.enum(['backward', 'forward']),
    effectiveLocalDateTime: z.string(),
    scheduledLocalDateTime: z.string(),
    sourceDate: z.string(),
  })
  .strict()

export const deadlinePlanSchema = z
  .object({
    dependencies: z.tuple([
      businessCalendarDependencySchema,
      tzdbDependencySchema,
    ]),
    intent: z
      .object({
        durationMinutes: z.number().int().nonnegative(),
        startInstant: z.string(),
        startPolicy: z.enum(['next_open', 'reject']),
      })
      .strict(),
    operation: z.literal('add_business_duration'),
    resolution: z
      .object({
        boundaryAdjustmentCount: z.number().int().nonnegative(),
        boundaryAdjustments: z
          .array(adjustmentSchema)
          .max(MAX_BUSINESS_BOUNDARY_ADJUSTMENTS),
        boundaryAdjustmentsTruncated: z.boolean(),
        businessDatesUsed: z.number().int().nonnegative(),
        businessMinutesConsumed: z.number().int().nonnegative(),
        calendarDaysScanned: z.number().int().nonnegative(),
        deadlineInstant: z.string(),
        deadlineLocalDateTime: z.string(),
        deadlineOffset: z.string(),
        effectiveStartInstant: z.string(),
        startWasBusinessTime: z.boolean(),
      })
      .strict(),
    revalidation: z
      .object({
        triggers: z.tuple([
          z.literal('business_calendar_change'),
          z.literal('tzdb_change'),
        ]),
      })
      .strict(),
    schemaVersion: z.literal(BUSINESS_DEADLINE_SCHEMA_VERSION),
  })
  .strict()
  .meta({ id: 'BusinessDeadlinePlan' })

const conflictSchema = z.union([
  z
    .object({
      kind: z.literal('start_outside_business_time'),
      nextBusinessOpen: z
        .object({
          instant: z.string(),
          localDateTime: z.string(),
          offset: z.string(),
        })
        .strict(),
      startInstant: z.string(),
      timeZone: z.string(),
    })
    .strict(),
  z
    .object({
      boundary: z.enum(['end', 'start']),
      kind: z.literal('dst_gap'),
      localDateTime: z.string(),
      sourceDate: z.string(),
      timeZone: z.string(),
    })
    .strict(),
  z
    .object({
      boundary: z.enum(['end', 'start']),
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
      sourceDate: z.string(),
      timeZone: z.string(),
    })
    .strict(),
  z
    .object({
      endInstant: z.string(),
      endLocalDateTime: z.string(),
      kind: z.literal('invalid_interval_after_resolution'),
      sourceDate: z.string(),
      startInstant: z.string(),
      startLocalDateTime: z.string(),
    })
    .strict(),
])

const businessErrorSchema = z
  .object({
    candidates: z.array(timeZoneCandidateSchema).max(10).optional(),
    code: z.enum([
      'AMBIGUOUS_TIME_ZONE',
      'DUPLICATE_EXCEPTION_DATE',
      'INTERNAL_ERROR',
      'INVALID_BUSINESS_CALENDAR',
      'INVALID_BUSINESS_DEADLINE_PLAN',
      'INVALID_DURATION',
      'INVALID_FORMAT',
      'INVALID_INSTANT',
      'TOO_MANY_CALENDAR_ENTRIES',
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

export const computedBusinessDeadlineResultSchema = z
  .object({ plan: deadlinePlanSchema, status: z.literal('computed') })
  .strict()
  .meta({ id: 'ComputedBusinessDeadlineResult' })

export const conflictedBusinessDeadlineResultSchema = z
  .object({ conflict: conflictSchema, status: z.literal('conflict') })
  .strict()
  .meta({ id: 'ConflictedBusinessDeadlineResult' })

export const unsatisfiableBusinessDeadlineResultSchema = z
    .object({
      context: z
        .object({
          timeZoneData: z.literal('IANA'),
          timeZoneDataVersion: z.string(),
        })
        .strict(),
      reason: z.literal('no_business_time_within_search_limit'),
      scannedDays: z.number().int().nonnegative(),
      status: z.literal('unsatisfiable'),
    })
    .strict()
    .meta({ id: 'UnsatisfiableBusinessDeadlineResult' })

export const businessDeadlineErrorResultSchema = z
  .object({ error: businessErrorSchema, status: z.literal('error') })
  .strict()
  .meta({ id: 'BusinessDeadlineErrorResult' })

export const computeDeadlineResultSchema = z.discriminatedUnion('status', [
  computedBusinessDeadlineResultSchema,
  conflictedBusinessDeadlineResultSchema,
  unsatisfiableBusinessDeadlineResultSchema,
  businessDeadlineErrorResultSchema,
])
