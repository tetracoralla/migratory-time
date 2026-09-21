import { z } from 'zod'
import {
  AVAILABILITY_PLAN_SCHEMA_VERSION,
  MAX_AVAILABILITY_CANDIDATES,
  MAX_AVAILABILITY_DURATION_MINUTES,
  MAX_AVAILABILITY_INTERVALS_PER_LIST,
  MAX_AVAILABILITY_PARTICIPANTS,
  MAX_AVAILABILITY_STEP_MINUTES,
  MIN_AVAILABILITY_STEP_MINUTES,
} from '../src/lib/availabilityTypes'
import { timeZoneCandidateSchema } from './timePlanSchemas'

const exactIntervalSchema = z
  .object({
    end: z.string().trim().min(1).max(96),
    start: z.string().trim().min(1).max(96),
  })
  .strict()
  .meta({ id: 'ExactInterval' })

const exactIntervalListSchema = z
  .array(exactIntervalSchema)
  .max(MAX_AVAILABILITY_INTERVALS_PER_LIST)
  .meta({ id: 'ExactIntervalList' })

export const availabilityParticipantSchema = z
  .object({
    availability: exactIntervalListSchema,
    busy: exactIntervalListSchema.optional(),
    id: z.string().trim().min(1).max(64),
    preferred: exactIntervalListSchema.optional(),
    timeZone: z.string().trim().min(1).max(80),
  })
  .strict()
  .meta({ id: 'AvailabilityParticipant' })

export const availabilitySnapshotSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    version: z.string().trim().min(1).max(64),
  })
  .strict()
  .meta({ id: 'AvailabilitySnapshot' })

export const findTimeWindowsInputSchema = z
  .object({
    durationMinutes: z
      .number()
      .int()
      .min(1)
      .max(MAX_AVAILABILITY_DURATION_MINUTES),
    locale: z.enum(['zh', 'en']).optional(),
    maxCandidates: z
      .number()
      .int()
      .min(1)
      .max(MAX_AVAILABILITY_CANDIDATES)
      .optional(),
    participants: z
      .array(availabilityParticipantSchema)
      .min(1)
      .max(MAX_AVAILABILITY_PARTICIPANTS)
      .describe('Unordered participant set keyed by unique id; results use canonical id order.'),
    search: exactIntervalSchema,
    snapshot: availabilitySnapshotSchema,
    stepMinutes: z
      .number()
      .int()
      .min(MIN_AVAILABILITY_STEP_MINUTES)
      .max(MAX_AVAILABILITY_STEP_MINUTES)
      .optional()
      .describe('Candidate starts align to this step from search.start; defaults to 15.'),
  })
  .strict()

const availabilityDependencySchema = z
  .object({
    definitionFingerprint: z.string().describe(
      'Fingerprint of normalized participant facts; excludes snapshot id and version metadata.',
    ),
    id: z.string(),
    type: z.literal('availability_snapshot'),
    version: z.string(),
  })
  .strict()

const tzdbDependencySchema = z
  .object({
    timeZones: z.array(z.string()).min(1).max(MAX_AVAILABILITY_PARTICIPANTS),
    type: z.literal('tzdb'),
    version: z.string(),
  })
  .strict()

const querySchema = z
  .object({
    durationMinutes: z.number().int().positive(),
    search: exactIntervalSchema,
    stepMinutes: z.number().int().positive(),
  })
  .strict()

const candidateSchema = z
  .object({
    endInstant: z.string(),
    localViews: z
      .array(
        z
          .object({
            endLocalDateTime: z.string(),
            endOffset: z.string(),
            participantId: z.string(),
            startLocalDateTime: z.string(),
            startOffset: z.string(),
            timeZone: z.string(),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_AVAILABILITY_PARTICIPANTS),
    outsidePreferenceParticipants: z
      .array(z.string())
      .max(MAX_AVAILABILITY_PARTICIPANTS),
    preferenceSatisfied: z.number().int().nonnegative(),
    preferenceTotal: z.number().int().nonnegative(),
    preferredParticipants: z
      .array(z.string())
      .max(MAX_AVAILABILITY_PARTICIPANTS),
    startInstant: z.string(),
  })
  .strict()

const availabilityErrorSchema = z
  .object({
    candidates: z.array(timeZoneCandidateSchema).max(10).optional(),
    code: z.enum([
      'AMBIGUOUS_TIME_ZONE',
      'DUPLICATE_PARTICIPANT',
      'INTERNAL_ERROR',
      'INVALID_CANDIDATE_LIMIT',
      'INVALID_DURATION',
      'INVALID_AVAILABILITY_PLAN',
      'INVALID_INSTANT',
      'INVALID_INTERVAL',
      'INVALID_SNAPSHOT',
      'INVALID_STEP',
      'RANGE_TOO_LARGE',
      'TOO_MANY_INTERVALS',
      'TOO_MANY_PARTICIPANTS',
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

export const solvedAvailabilityPlanSchema = z
    .object({
      candidates: z.array(candidateSchema).max(MAX_AVAILABILITY_CANDIDATES),
      commonAvailabilityIntervalCount: z.number().int().nonnegative(),
      dependencies: z.tuple([
        availabilityDependencySchema,
        tzdbDependencySchema,
      ]),
      eligibleCandidateCount: z.number().int().nonnegative(),
      query: querySchema.extend({
        maxCandidates: z.number().int().positive(),
      }),
      revalidation: z
        .object({
          triggers: z.tuple([
            z.literal('availability_snapshot_change'),
            z.literal('tzdb_change'),
          ]),
        })
        .strict(),
      schemaVersion: z.literal(AVAILABILITY_PLAN_SCHEMA_VERSION),
      status: z.literal('solved'),
    })
    .strict()
    .meta({ id: 'SolvedAvailabilityPlan' })

export const unsatisfiableAvailabilityResultSchema = z
    .object({
      conflict: z
        .object({
          kind: z.enum([
            'alignment_excludes_all',
            'duration_does_not_fit',
            'no_common_availability',
          ]),
          participantIds: z.array(z.string()).min(1).max(MAX_AVAILABILITY_PARTICIPANTS),
        })
        .strict(),
      context: z
        .object({
          timeZoneData: z.literal('IANA'),
          timeZoneDataVersion: z.string(),
        })
        .strict(),
      dependency: availabilityDependencySchema,
      query: querySchema,
      status: z.literal('unsatisfiable'),
    })
    .strict()
    .meta({ id: 'UnsatisfiableAvailabilityResult' })

export const availabilityErrorResultSchema = z
  .object({ error: availabilityErrorSchema, status: z.literal('error') })
  .strict()
  .meta({ id: 'AvailabilityErrorResult' })

export const findTimeWindowsResultSchema = z.discriminatedUnion('status', [
  solvedAvailabilityPlanSchema,
  unsatisfiableAvailabilityResultSchema,
  availabilityErrorResultSchema,
])
