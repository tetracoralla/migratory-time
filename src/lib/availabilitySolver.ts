import type { Temporal } from '@js-temporal/polyfill'
import {
  alignInstantAtOrAfter,
  intervalContains,
  intersectManyExactIntervals,
  type ExactIntervalValue,
} from './exactIntervalMath'
import {
  availabilityErrorResult,
  normalizeAvailabilityInput,
  type NormalizedAvailabilityInput,
  type NormalizedAvailabilityParticipant,
} from './availabilityValidation'
import {
  AVAILABILITY_PLAN_SCHEMA_VERSION,
  type AvailabilityCandidate,
  type AvailabilityErrorResult,
  type FindTimeWindowsInput,
  type FindTimeWindowsResult,
} from './availabilityTypes'
import { hasMinutePrecisionAcrossTimeZones } from './timeConversion'
import { getTemporal } from './temporal'
import type { TimePlanContext } from './timePlanTypes'

export * from './availabilityTypes'

const NANOS_PER_MINUTE = 60_000_000_000n

interface CandidateSeed {
  end: Temporal.Instant
  outsidePreferenceParticipants: string[]
  preferredParticipants: string[]
  start: Temporal.Instant
}

function durationFits(
  intervals: ExactIntervalValue[],
  durationNanoseconds: bigint,
) {
  return intervals.some(
    (interval) =>
      interval.end.epochNanoseconds - interval.start.epochNanoseconds
      >= durationNanoseconds,
  )
}

function alignedSlotExists(
  participants: NormalizedAvailabilityParticipant[],
  normalized: NormalizedAvailabilityInput,
) {
  const duration = BigInt(normalized.durationMinutes) * NANOS_PER_MINUTE
  const step = BigInt(normalized.stepMinutes) * NANOS_PER_MINUTE
  const common = intersectManyExactIntervals(
    participants.map((participant) => participant.effective),
    normalized.search,
  )
  return common.some((interval) => {
    const start = alignInstantAtOrAfter(interval.start, normalized.search.start, step)
    return start.epochNanoseconds + duration <= interval.end.epochNanoseconds
  })
}

function irreducibleConflictParticipants(
  normalized: NormalizedAvailabilityInput,
) {
  let core = [...normalized.participants]
  for (let index = core.length - 1; index >= 0; index -= 1) {
    const trial = core.filter((_, trialIndex) => trialIndex !== index)
    if (trial.length > 0 && !alignedSlotExists(trial, normalized)) {
      core = trial
    }
  }
  return core.map((participant) => participant.id)
}

function candidateSeeds(
  normalized: NormalizedAvailabilityInput,
  common: ExactIntervalValue[],
) {
  const duration = BigInt(normalized.durationMinutes) * NANOS_PER_MINUTE
  const step = BigInt(normalized.stepMinutes) * NANOS_PER_MINUTE
  const seeds: CandidateSeed[] = []
  for (const interval of common) {
    let start = alignInstantAtOrAfter(interval.start, normalized.search.start, step)
    while (start.epochNanoseconds + duration <= interval.end.epochNanoseconds) {
      const end = getTemporal().Instant.fromEpochNanoseconds(
        start.epochNanoseconds + duration,
      )
      const preferredParticipants: string[] = []
      const outsidePreferenceParticipants: string[] = []
      for (const participant of normalized.participants) {
        if (!participant.preferred.length) continue
        if (intervalContains(participant.preferred, start, end)) {
          preferredParticipants.push(participant.id)
        } else {
          outsidePreferenceParticipants.push(participant.id)
        }
      }
      seeds.push({
        end,
        outsidePreferenceParticipants,
        preferredParticipants,
        start,
      })
      start = getTemporal().Instant.fromEpochNanoseconds(
        start.epochNanoseconds + step,
      )
    }
  }
  return seeds.sort((left, right) => {
    const preferenceDifference =
      right.preferredParticipants.length - left.preferredParticipants.length
    if (preferenceDifference !== 0) return preferenceDifference
    return getTemporal().Instant.compare(left.start, right.start)
  })
}

function localViews(
  seed: CandidateSeed,
  participants: NormalizedAvailabilityParticipant[],
) {
  return participants.map((participant) => {
    const start = seed.start.toZonedDateTimeISO(participant.timeZone)
    const end = seed.end.toZonedDateTimeISO(participant.timeZone)
    return {
      endLocalDateTime: end.toPlainDateTime().toString(),
      endOffset: end.offset,
      participantId: participant.id,
      startLocalDateTime: start.toPlainDateTime().toString(),
      startOffset: start.offset,
      timeZone: participant.timeZone,
    }
  })
}

function availabilityCandidate(
  seed: CandidateSeed,
  normalized: NormalizedAvailabilityInput,
): AvailabilityCandidate {
  const timeZones = [...new Set(
    normalized.participants.map((participant) => participant.timeZone),
  )].sort()
  if (
    !hasMinutePrecisionAcrossTimeZones(seed.start, timeZones)
    || !hasMinutePrecisionAcrossTimeZones(seed.end, timeZones)
  ) {
    throw new Error(
      'A candidate uses a historical sub-minute offset unsupported by the availability result contract.',
    )
  }
  const preferenceTotal = normalized.participants.filter(
    (participant) => participant.preferred.length > 0,
  ).length
  return {
    endInstant: seed.end.toString(),
    localViews: localViews(seed, normalized.participants),
    outsidePreferenceParticipants: seed.outsidePreferenceParticipants,
    preferenceSatisfied: seed.preferredParticipants.length,
    preferenceTotal,
    preferredParticipants: seed.preferredParticipants,
    startInstant: seed.start.toString(),
  }
}

function dependency(normalized: NormalizedAvailabilityInput) {
  return {
    definitionFingerprint: normalized.definitionFingerprint,
    id: normalized.snapshot.id,
    type: 'availability_snapshot' as const,
    version: normalized.snapshot.version,
  }
}

function findTimeWindowsUnsafe(
  input: FindTimeWindowsInput,
  context: TimePlanContext,
): Exclude<FindTimeWindowsResult, AvailabilityErrorResult> {
  const normalized = normalizeAvailabilityInput(input)
  const common = intersectManyExactIntervals(
    normalized.participants.map((participant) => participant.effective),
    normalized.search,
  )
  const duration = BigInt(normalized.durationMinutes) * NANOS_PER_MINUTE
  const seeds = candidateSeeds(normalized, common)
  const query = {
    durationMinutes: normalized.durationMinutes,
    search: {
      end: normalized.search.end.toString(),
      start: normalized.search.start.toString(),
    },
    stepMinutes: normalized.stepMinutes,
  }
  if (!seeds.length) {
    const kind = common.length === 0
      ? 'no_common_availability'
      : durationFits(common, duration)
        ? 'alignment_excludes_all'
        : 'duration_does_not_fit'
    return {
      conflict: {
        kind,
        participantIds: irreducibleConflictParticipants(normalized),
      },
      context,
      dependency: dependency(normalized),
      query,
      status: 'unsatisfiable',
    }
  }

  return {
    candidates: seeds
      .slice(0, normalized.maxCandidates)
      .map((seed) => availabilityCandidate(seed, normalized)),
    commonAvailabilityIntervalCount: common.length,
    dependencies: [
      dependency(normalized),
      {
        timeZones: [...new Set(
          normalized.participants.map((participant) => participant.timeZone),
        )].sort(),
        type: 'tzdb',
        version: context.timeZoneDataVersion,
      },
    ],
    eligibleCandidateCount: seeds.length,
    query: { ...query, maxCandidates: normalized.maxCandidates },
    revalidation: {
      triggers: ['availability_snapshot_change', 'tzdb_change'],
    },
    schemaVersion: AVAILABILITY_PLAN_SCHEMA_VERSION,
    status: 'solved',
  }
}

export function findTimeWindows(
  input: FindTimeWindowsInput,
  context: TimePlanContext,
): FindTimeWindowsResult {
  try {
    return findTimeWindowsUnsafe(input, context)
  } catch (error) {
    const result = availabilityErrorResult(error)
    if (
      result.error.code === 'INTERNAL_ERROR'
      && result.error.message.includes('sub-minute offset')
    ) {
      return {
        error: {
          code: 'UNSUPPORTED_PRECISION',
          message: result.error.message,
          retryable: false,
        },
        status: 'error',
      }
    }
    return result
  }
}
