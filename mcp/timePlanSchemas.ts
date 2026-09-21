import { z } from 'zod'

const localeSchema = z
  .enum(['zh', 'en'])
  .optional()
  .describe('Language used only to resolve ordinary region aliases. Defaults to en.')

const timeZoneInputSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .describe('An IANA time-zone id or an unambiguous city, country, region, or signed UTC/GMT offset.')

const fixedInstantIntentSchema = z
  .object({
    anchor: z.literal('fixed_instant'),
    instant: z
      .string()
      .trim()
      .min(1)
      .max(96)
      .optional()
      .describe('Exact ISO 8601 / RFC 3339 timestamp with an offset.'),
  })
  .strict()

const fixedWallTimeIntentSchema = z
  .object({
    anchor: z.literal('fixed_wall_time'),
    disambiguation: z
      .enum(['reject', 'earlier', 'later'])
      .optional()
      .describe('How to resolve a repeated local time. Defaults to reject.'),
    localDateTime: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .optional()
      .describe('Local calendar minute in exact YYYY-MM-DDTHH:mm form, year 1901+.'),
    timeZone: timeZoneInputSchema.optional(),
  })
  .strict()

export const resolveTimeInputSchema = z
  .object({
    intent: z.discriminatedUnion('anchor', [
      fixedInstantIntentSchema,
      fixedWallTimeIntentSchema,
    ]),
    locale: localeSchema,
  })
  .strict()

export const timeZoneCandidateSchema = z
  .object({
    countryCode: z.string(),
    countryName: z.string(),
    id: z.string(),
    label: z.string(),
    labelEn: z.string(),
    mainCities: z.array(z.string()),
  })
  .strict()
  .meta({ id: 'TimeZoneCandidate' })

const timePlanErrorSchema = z
  .object({
    candidates: z.array(timeZoneCandidateSchema).max(10).optional(),
    code: z.enum([
      'AMBIGUOUS_TIME_ZONE',
      'INTERNAL_ERROR',
      'INVALID_FORMAT',
      'INVALID_INSTANT',
      'INVALID_TIME_PLAN',
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

const timePlanErrorResultSchema = z
  .object({ error: timePlanErrorSchema, status: z.literal('error') })
  .strict()

const tzdbDependencySchema = z
  .object({
    timeZone: z.string().min(1).max(80),
    type: z.literal('tzdb'),
    version: z.string().min(1).max(80),
  })
  .strict()
  .meta({ id: 'TzdbDependency' })

const fixedInstantPlanBaseSchema = z
  .object({
    anchor: z.literal('fixed_instant'),
    dependencies: z.array(tzdbDependencySchema).max(0),
    intent: z.object({ instant: z.string().min(1).max(96) }).strict(),
    resolution: z.object({ instant: z.string().min(1).max(96) }).strict(),
    revalidation: z.object({ trigger: z.literal('none') }).strict(),
  })
  .strict()

const fixedInstantPlanSchema = fixedInstantPlanBaseSchema
  .extend({ schemaVersion: z.literal('migratory.time-plan.v0.1') })
  .strict()
  .meta({ id: 'FixedInstantTimePlan' })

const fixedInstantPlanInputSchema = fixedInstantPlanBaseSchema
  .extend({ schemaVersion: z.string().min(1).max(64) })
  .strict()

const fixedWallTimePlanBaseSchema = z
  .object({
    anchor: z.literal('fixed_wall_time'),
    dependencies: z.array(tzdbDependencySchema).length(1),
    intent: z
      .object({
        disambiguation: z.enum(['reject', 'earlier', 'later']),
        localDateTime: z.string().min(1).max(32),
        timeZone: z.string().min(1).max(80),
      })
      .strict(),
    resolution: z
      .object({
        instant: z.string().min(1).max(96),
        offset: z.string().min(1).max(24),
      })
      .strict(),
    revalidation: z.object({ trigger: z.literal('tzdb_change') }).strict(),
  })
  .strict()

export const fixedWallTimePlanSchema = fixedWallTimePlanBaseSchema
  .extend({ schemaVersion: z.literal('migratory.time-plan.v0.1') })
  .strict()
  .meta({ id: 'FixedWallTimePlan' })

const fixedWallTimePlanInputSchema = fixedWallTimePlanBaseSchema
  .extend({ schemaVersion: z.string().min(1).max(64) })
  .strict()

export const timePlanSchema = z.discriminatedUnion('anchor', [
  fixedInstantPlanSchema,
  fixedWallTimePlanSchema,
]).meta({ id: 'TimePlan' })

const timePlanInputSchema = z.discriminatedUnion('anchor', [
  fixedInstantPlanInputSchema,
  fixedWallTimePlanInputSchema,
])

const resolvedTimePlanResultSchema = z
  .object({ plan: timePlanSchema, status: z.literal('resolved') })
  .strict()

const ambiguousTimePlanResultSchema = z
  .object({
    candidates: z
      .array(
        z
          .object({
            choice: z.enum(['earlier', 'later']),
            plan: fixedWallTimePlanSchema,
          })
          .strict(),
      )
      .length(2),
    source: z
      .object({
        localDateTime: z.string(),
        timeZone: z.string(),
      })
      .strict(),
    status: z.literal('ambiguous'),
  })
  .strict()

const underspecifiedTimeResultSchema = z
  .object({
    missing: z
      .array(
        z.enum(['intent.instant', 'intent.localDateTime', 'intent.timeZone']),
      )
      .min(1)
      .max(2),
    status: z.literal('underspecified'),
  })
  .strict()

const nonexistentTimePlanResultSchema = z
  .object({
    reason: z.string(),
    source: z
      .object({
        localDateTime: z.string(),
        timeZone: z.string(),
      })
      .strict(),
    status: z.literal('nonexistent'),
  })
  .strict()

export const resolveTimeResultSchema = z.discriminatedUnion('status', [
  resolvedTimePlanResultSchema,
  ambiguousTimePlanResultSchema,
  underspecifiedTimeResultSchema,
  nonexistentTimePlanResultSchema,
  timePlanErrorResultSchema,
])

export const validateTimePlanInputSchema = z
  .object({ plan: timePlanInputSchema })
  .strict()

const timePlanDifferenceSchema = z
  .object({
    current: z.string().optional(),
    field: z.enum([
      'dependencies[0].version',
      'resolution.instant',
      'resolution.offset',
      'resolution.status',
    ]),
    previous: z.string().optional(),
  })
  .strict()

const currentResolutionSchema = z.discriminatedUnion('status', [
  resolvedTimePlanResultSchema,
  ambiguousTimePlanResultSchema,
  nonexistentTimePlanResultSchema,
])

export const validateTimePlanResultSchema = z.discriminatedUnion('status', [
  z
    .object({
      currentPlan: timePlanSchema,
      dependencyChanges: z.array(timePlanDifferenceSchema).max(1),
      status: z.literal('unchanged'),
    })
    .strict(),
  z
    .object({
      current: currentResolutionSchema,
      differences: z.array(timePlanDifferenceSchema).min(1).max(4),
      status: z.literal('drifted'),
    })
    .strict(),
  z
    .object({
      currentContext: z
        .object({
          timeZoneData: z.literal('IANA'),
          timeZoneDataVersion: z.string(),
        })
        .strict(),
      reason: z.string(),
      status: z.literal('unverifiable'),
    })
    .strict(),
  timePlanErrorResultSchema,
])
