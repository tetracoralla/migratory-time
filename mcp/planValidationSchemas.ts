import { z } from 'zod'
import {
  businessCalendarSchema,
  businessDeadlineErrorResultSchema,
  computedBusinessDeadlineResultSchema,
  conflictedBusinessDeadlineResultSchema,
  deadlinePlanSchema,
  unsatisfiableBusinessDeadlineResultSchema,
} from './businessCalendarSchemas'
import {
  availabilityErrorResultSchema,
  availabilityParticipantSchema,
  availabilitySnapshotSchema,
  solvedAvailabilityPlanSchema,
  unsatisfiableAvailabilityResultSchema,
} from './availabilitySchemas'
import {
  validateTimePlanInputSchema,
  validateTimePlanResultSchema,
} from './timePlanSchemas'
import {
  expandedSchedulePlanSchema,
  scheduleConflictResultSchema,
  scheduleErrorResultSchema,
} from './scheduleSchemas'

const localeSchema = z.enum(['zh', 'en']).optional()

const deadlinePlanValidationInputSchema = deadlinePlanSchema
  .extend({
    resolution: deadlinePlanSchema.shape.resolution.extend({
      boundaryAdjustmentsTruncated: z
        .boolean()
        .optional()
        .describe(
          'May be omitted on replay because it is derived from boundaryAdjustmentCount and boundaryAdjustments.length.',
        ),
    }),
  })
  .strict()

const businessDifferenceSchema = z
  .object({
    current: z.string().optional(),
    field: z.enum([
      'dependencies[0].definitionFingerprint',
      'dependencies[0].version',
      'dependencies[1].version',
      'resolution.deadlineInstant',
      'resolution.deadlineLocalDateTime',
      'resolution.deadlineOffset',
      'resolution.effectiveStartInstant',
      'resolution.status',
    ]),
    previous: z.string().optional(),
  })
  .strict()

const availabilityDifferenceSchema = z
  .object({
    current: z.string().optional(),
    field: z.enum([
      'dependencies[0].definitionFingerprint',
      'dependencies[0].version',
      'dependencies[1].timeZones',
      'dependencies[1].version',
      'resolution.candidates',
      'resolution.commonAvailabilityIntervalCount',
      'resolution.eligibleCandidateCount',
      'resolution.status',
    ]),
    previous: z.string().optional(),
  })
  .strict()

const scheduleDifferenceSchema = z
  .object({
    current: z.string().optional(),
    field: z.enum([
      'dependencies[0].version',
      'resolution.expansion',
      'resolution.status',
    ]),
    previous: z.string().optional(),
  })
  .strict()

const businessValidationResultSchema = z.union([
  z
    .object({
      currentPlan: deadlinePlanSchema,
      dependencyChanges: z.array(businessDifferenceSchema).max(3),
      status: z.literal('unchanged'),
    })
    .strict(),
  z
    .object({
      current: z.union([
        computedBusinessDeadlineResultSchema,
        conflictedBusinessDeadlineResultSchema,
        unsatisfiableBusinessDeadlineResultSchema,
      ]),
      differences: z.array(businessDifferenceSchema).min(1).max(7),
      status: z.literal('drifted'),
    })
    .strict(),
  z
    .object({
      currentContext: z
        .object({
          timeZoneData: z.literal('IANA'),
          timeZoneDataVersion: z.string().min(1).max(80),
        })
        .strict(),
      reason: z.string().max(512),
      status: z.literal('unverifiable'),
    })
    .strict(),
  businessDeadlineErrorResultSchema,
])

const availabilityValidationResultSchema = z.union([
  z
    .object({
      currentPlan: solvedAvailabilityPlanSchema,
      dependencyChanges: z.array(availabilityDifferenceSchema).max(4),
      status: z.literal('unchanged'),
    })
    .strict(),
  z
    .object({
      current: z.union([
        solvedAvailabilityPlanSchema,
        unsatisfiableAvailabilityResultSchema,
      ]),
      differences: z.array(availabilityDifferenceSchema).min(1).max(7),
      status: z.literal('drifted'),
    })
    .strict(),
  z
    .object({
      currentContext: z
        .object({
          timeZoneData: z.literal('IANA'),
          timeZoneDataVersion: z.string().min(1).max(80),
        })
        .strict(),
      reason: z.string().max(512),
      status: z.literal('unverifiable'),
    })
    .strict(),
  availabilityErrorResultSchema,
])

const scheduleValidationResultSchema = z.union([
  z
    .object({
      currentPlan: expandedSchedulePlanSchema,
      dependencyChanges: z.array(scheduleDifferenceSchema).max(1),
      status: z.literal('unchanged'),
    })
    .strict(),
  z
    .object({
      current: z.union([
        expandedSchedulePlanSchema,
        scheduleConflictResultSchema,
      ]),
      differences: z.array(scheduleDifferenceSchema).min(1).max(2),
      status: z.literal('drifted'),
    })
    .strict(),
  z
    .object({
      currentContext: z
        .object({
          timeZoneData: z.literal('IANA'),
          timeZoneDataVersion: z.string().min(1).max(80),
        })
        .strict(),
      reason: z.string().max(512),
      status: z.literal('unverifiable'),
    })
    .strict(),
  scheduleErrorResultSchema,
])

export const validateTemporalPlanInputSchema = z.union([
  validateTimePlanInputSchema,
  z
    .object({
      currentCalendar: businessCalendarSchema.describe(
        'Complete current BusinessCalendar definition used to replay the stored deadline plan. This is not a dependency summary.',
      ),
      kind: z.literal('business_deadline').describe(
        'Required discriminator for a stored business-deadline plan.',
      ),
      locale: localeSchema,
      plan: deadlinePlanValidationInputSchema.describe(
        'Stored migratory.business-deadline.v0.1 plan returned by compute_deadline.',
      ),
    })
    .strict()
    .describe(
      'Business deadline input shape: {kind:"business_deadline", plan, currentCalendar}.',
    ),
  z
    .object({
      currentSnapshot: z
        .object({
          locale: localeSchema,
          participants: z.array(availabilityParticipantSchema).min(1).max(12),
          snapshot: availabilitySnapshotSchema,
        })
        .strict(),
      kind: z.literal('availability'),
      plan: solvedAvailabilityPlanSchema,
    })
    .strict()
    .describe(
      'Availability input shape: {kind:"availability", plan, currentSnapshot:{participants,snapshot,locale?}}.',
    ),
  z
    .object({
      kind: z.literal('schedule'),
      plan: expandedSchedulePlanSchema,
    })
    .strict()
    .describe('Schedule input shape: {kind:"schedule", plan}.'),
])

export const validateTemporalPlanResultSchema = z.union([
  validateTimePlanResultSchema,
  businessValidationResultSchema,
  availabilityValidationResultSchema,
  scheduleValidationResultSchema,
])
