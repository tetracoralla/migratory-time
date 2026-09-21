import type { Temporal } from '@js-temporal/polyfill'
import { resolveTimeZoneInput } from '../data/timeZoneRegistry'
import type { Locale } from '../types'
import type { ExactIntervalValue } from './exactIntervalMath'
import {
  mergeExactIntervals,
  subtractExactIntervals,
} from './exactIntervalMath'
import { fingerprintDefinition } from './definitionFingerprint'
import {
  MAX_AVAILABILITY_CANDIDATES,
  MAX_AVAILABILITY_DURATION_MINUTES,
  MAX_AVAILABILITY_INTERVALS_TOTAL,
  MAX_AVAILABILITY_PARTICIPANTS,
  MAX_AVAILABILITY_SEARCH_DAYS,
  MAX_AVAILABILITY_STEP_MINUTES,
  MIN_AVAILABILITY_STEP_MINUTES,
  type AvailabilityError,
  type AvailabilityErrorCode,
  type AvailabilityErrorResult,
  type ExactTimeInterval,
  type FindTimeWindowsInput,
} from './availabilityTypes'
import { getTemporal } from './temporal'

const NANOS_PER_DAY = 86_400_000_000_000n

export interface NormalizedAvailabilityParticipant {
  availability: ExactIntervalValue[]
  busy: ExactIntervalValue[]
  effective: ExactIntervalValue[]
  id: string
  preferred: ExactIntervalValue[]
  timeZone: string
}

export interface NormalizedAvailabilityInput {
  definitionFingerprint: string
  durationMinutes: number
  maxCandidates: number
  participants: NormalizedAvailabilityParticipant[]
  search: ExactIntervalValue
  snapshot: {
    id: string
    version: string
  }
  stepMinutes: number
}

class AvailabilityInputError extends Error {
  readonly detail: AvailabilityError

  constructor(detail: Omit<AvailabilityError, 'retryable'>) {
    super(detail.message)
    this.detail = { ...detail, retryable: false }
  }
}

export function availabilityErrorResult(error: unknown): AvailabilityErrorResult {
  if (error instanceof AvailabilityInputError) {
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

function inputError(
  code: AvailabilityErrorCode,
  field: string,
  message: string,
  input?: string,
): never {
  throw new AvailabilityInputError({ code, field, input, message })
}

function canonicalTimeZone(timeZone: string, locale: Locale, field: string) {
  const resolution = resolveTimeZoneInput(timeZone, locale)
  if (resolution.status === 'resolved') return resolution.timeZone.id
  if (resolution.status === 'ambiguous') {
    throw new AvailabilityInputError({
      candidates: resolution.candidates,
      code: 'AMBIGUOUS_TIME_ZONE',
      field,
      input: timeZone,
      message: `${field} matches more than one zone; use one candidate IANA id.`,
    })
  }
  inputError(
    'UNKNOWN_TIME_ZONE',
    field,
    `${field} is not a known IANA time zone or unambiguous region name.`,
    timeZone,
  )
}

function parseInstant(value: string, field: string) {
  try {
    return getTemporal().Instant.from(value)
  } catch {
    inputError(
      'INVALID_INSTANT',
      field,
      `${field} must be an exact ISO 8601 / RFC 3339 timestamp with an offset.`,
      value,
    )
  }
}

function parseInterval(
  interval: ExactTimeInterval,
  field: string,
  search?: ExactIntervalValue,
): ExactIntervalValue | undefined {
  const start = parseInstant(interval.start, `${field}.start`)
  const end = parseInstant(interval.end, `${field}.end`)
  if (getTemporal().Instant.compare(start, end) >= 0) {
    inputError(
      'INVALID_INTERVAL',
      field,
      `${field}.start must be earlier than ${field}.end.`,
    )
  }
  if (!search) return { end, start }
  const clippedStart = getTemporal().Instant.compare(start, search.start) < 0
    ? search.start
    : start
  const clippedEnd = getTemporal().Instant.compare(end, search.end) > 0
    ? search.end
    : end
  if (getTemporal().Instant.compare(clippedStart, clippedEnd) >= 0) return undefined
  return { end: clippedEnd, start: clippedStart }
}

function normalizeIntervalList(
  intervals: ExactTimeInterval[],
  field: string,
  search: ExactIntervalValue,
) {
  return mergeExactIntervals(
    intervals
      .map((interval, index) => parseInterval(interval, `${field}[${index}]`, search))
      .filter((interval): interval is ExactIntervalValue => interval !== undefined),
  )
}

function serializeIntervals(intervals: ExactIntervalValue[]) {
  return intervals.map((interval) => ({
    end: interval.end.toString(),
    start: interval.start.toString(),
  }))
}

export function normalizeAvailabilityInput(
  input: FindTimeWindowsInput,
): NormalizedAvailabilityInput {
  if (
    !Number.isInteger(input.durationMinutes)
    || input.durationMinutes < 1
    || input.durationMinutes > MAX_AVAILABILITY_DURATION_MINUTES
  ) {
    inputError(
      'INVALID_DURATION',
      'durationMinutes',
      `durationMinutes must be an integer from 1 to ${MAX_AVAILABILITY_DURATION_MINUTES}.`,
      String(input.durationMinutes),
    )
  }
  const stepMinutes = input.stepMinutes ?? 15
  if (
    !Number.isInteger(stepMinutes)
    || stepMinutes < MIN_AVAILABILITY_STEP_MINUTES
    || stepMinutes > MAX_AVAILABILITY_STEP_MINUTES
  ) {
    inputError(
      'INVALID_STEP',
      'stepMinutes',
      `stepMinutes must be an integer from ${MIN_AVAILABILITY_STEP_MINUTES} to ${MAX_AVAILABILITY_STEP_MINUTES}.`,
      String(stepMinutes),
    )
  }
  const maxCandidates = input.maxCandidates ?? 5
  if (
    !Number.isInteger(maxCandidates)
    || maxCandidates < 1
    || maxCandidates > MAX_AVAILABILITY_CANDIDATES
  ) {
    inputError(
      'INVALID_CANDIDATE_LIMIT',
      'maxCandidates',
      `maxCandidates must be an integer from 1 to ${MAX_AVAILABILITY_CANDIDATES}.`,
      String(maxCandidates),
    )
  }
  if (
    input.participants.length < 1
    || input.participants.length > MAX_AVAILABILITY_PARTICIPANTS
  ) {
    inputError(
      'TOO_MANY_PARTICIPANTS',
      'participants',
      `participants must contain 1 to ${MAX_AVAILABILITY_PARTICIPANTS} items.`,
    )
  }
  const intervalCount = input.participants.reduce(
    (count, participant) =>
      count
      + participant.availability.length
      + (participant.busy?.length ?? 0)
      + (participant.preferred?.length ?? 0),
    0,
  )
  if (intervalCount > MAX_AVAILABILITY_INTERVALS_TOTAL) {
    inputError(
      'TOO_MANY_INTERVALS',
      'participants',
      `Availability, busy, and preferred lists may contain at most ${MAX_AVAILABILITY_INTERVALS_TOTAL} intervals in total.`,
    )
  }

  const search = parseInterval(input.search, 'search') as ExactIntervalValue
  if (
    search.end.epochNanoseconds - search.start.epochNanoseconds
    > BigInt(MAX_AVAILABILITY_SEARCH_DAYS) * NANOS_PER_DAY
  ) {
    inputError(
      'RANGE_TOO_LARGE',
      'search',
      `search may span at most ${MAX_AVAILABILITY_SEARCH_DAYS} exact days.`,
    )
  }
  const snapshotId = input.snapshot.id.trim()
  const snapshotVersion = input.snapshot.version.trim()
  if (!snapshotId || snapshotId.length > 128 || !snapshotVersion || snapshotVersion.length > 64) {
    inputError(
      'INVALID_SNAPSHOT',
      'snapshot',
      'snapshot.id and snapshot.version must be non-empty and at most 128 and 64 characters respectively.',
    )
  }

  const participantIds = new Set<string>()
  const participants = input.participants.map((participant, index) => {
    const id = participant.id.trim()
    if (!id || id.length > 64) {
      inputError(
        'INVALID_SNAPSHOT',
        `participants[${index}].id`,
        'Participant id must contain 1 to 64 non-whitespace characters.',
        participant.id,
      )
    }
    if (participantIds.has(id)) {
      inputError(
        'DUPLICATE_PARTICIPANT',
        'participants',
        'Participant ids must be unique.',
        id,
      )
    }
    participantIds.add(id)
    const availability = normalizeIntervalList(
      participant.availability,
      `participants[${index}].availability`,
      search,
    )
    const busy = normalizeIntervalList(
      participant.busy ?? [],
      `participants[${index}].busy`,
      search,
    )
    return {
      availability,
      busy,
      effective: subtractExactIntervals(availability, busy),
      id,
      preferred: normalizeIntervalList(
        participant.preferred ?? [],
        `participants[${index}].preferred`,
        search,
      ),
      timeZone: canonicalTimeZone(
        participant.timeZone,
        input.locale ?? 'en',
        `participants[${index}].timeZone`,
      ),
    }
  }).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)

  for (const participant of participants) {
    const startYear = search.start.toZonedDateTimeISO(participant.timeZone).year
    const endYear = search.end.toZonedDateTimeISO(participant.timeZone).year
    if (startYear < 1901 || endYear < 1901) {
      inputError(
        'UNSUPPORTED_YEAR',
        'search',
        'Availability solving supports local years 1901 and later in every participant time zone.',
      )
    }
  }

  const snapshot = { id: snapshotId, version: snapshotVersion }
  const fingerprintValue = {
    participants: participants.map((participant) => ({
      availability: serializeIntervals(participant.availability),
      busy: serializeIntervals(participant.busy),
      id: participant.id,
      preferred: serializeIntervals(participant.preferred),
      timeZone: participant.timeZone,
    })),
  }
  return {
    definitionFingerprint: fingerprintDefinition(fingerprintValue),
    durationMinutes: input.durationMinutes,
    maxCandidates,
    participants,
    search,
    snapshot,
    stepMinutes,
  }
}
