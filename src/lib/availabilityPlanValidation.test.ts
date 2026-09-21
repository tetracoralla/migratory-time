import { describe, expect, it } from 'vitest'
import { validateAvailabilityPlan } from './availabilityPlanValidation'
import { findTimeWindows } from './availabilitySolver'
import type {
  AvailabilityParticipant,
  FindTimeWindowsInput,
} from './availabilityTypes'
import type { TimePlanContext } from './timePlanTypes'

const context: TimePlanContext = {
  timeZoneData: 'IANA',
  timeZoneDataVersion: 'test-tzdb',
}
const search = {
  end: '2026-09-01T08:00:00Z',
  start: '2026-09-01T00:00:00Z',
}

function participants(): AvailabilityParticipant[] {
  return [
    {
      availability: [{ end: '2026-09-01T06:00:00Z', start: search.start }],
      id: 'shanghai',
      preferred: [{ end: '2026-09-01T06:00:00Z', start: '2026-09-01T04:00:00Z' }],
      timeZone: 'Asia/Shanghai',
    },
    {
      availability: [{ end: '2026-09-01T06:00:00Z', start: '2026-09-01T01:00:00Z' }],
      id: 'london',
      timeZone: 'Europe/London',
    },
  ]
}

function input(overrides: Partial<FindTimeWindowsInput> = {}): FindTimeWindowsInput {
  return {
    durationMinutes: 60,
    maxCandidates: 3,
    participants: participants(),
    search,
    snapshot: { id: 'freebusy/team-a', version: '1' },
    stepMinutes: 60,
    ...overrides,
  }
}

function originalPlan() {
  const result = findTimeWindows(input(), context)
  expect(result.status).toBe('solved')
  if (result.status !== 'solved') throw new Error('Expected solved plan')
  return result
}

describe('availability plan validation', () => {
  it('recomputes an unchanged plan and separates dependency-only changes', () => {
    const plan = originalPlan()
    const unchanged = validateAvailabilityPlan(
      plan,
      { participants: participants(), snapshot: { id: 'freebusy/team-a', version: '1' } },
      context,
    )
    const newerSnapshot = validateAvailabilityPlan(
      plan,
      { participants: participants(), snapshot: { id: 'freebusy/team-a', version: '2' } },
      { ...context, timeZoneDataVersion: 'test-tzdb-next' },
    )
    const reorderedSnapshot = validateAvailabilityPlan(
      plan,
      {
        participants: [...participants()].reverse(),
        snapshot: { id: 'freebusy/team-a', version: '1' },
      },
      context,
    )

    expect(unchanged).toMatchObject({ dependencyChanges: [], status: 'unchanged' })
    expect(reorderedSnapshot).toMatchObject({
      dependencyChanges: [],
      status: 'unchanged',
    })
    expect(newerSnapshot.status).toBe('unchanged')
    if (newerSnapshot.status === 'unchanged') {
      expect(newerSnapshot.dependencyChanges.map(({ field }) => field)).toEqual([
        'dependencies[0].version',
        'dependencies[1].version',
      ])
    }
  })

  it('reports changed availability facts as semantic drift', () => {
    const plan = originalPlan()
    const changedParticipants = participants().map((participant, index) =>
      index === 0
        ? {
            ...participant,
            busy: [{ end: '2026-09-01T05:00:00Z', start: '2026-09-01T04:00:00Z' }],
          }
        : participant,
    )
    const validation = validateAvailabilityPlan(
      plan,
      {
        participants: changedParticipants,
        snapshot: { id: 'freebusy/team-a', version: '2' },
      },
      context,
    )

    expect(validation.status).toBe('drifted')
    if (validation.status === 'drifted') {
      expect(validation.differences.map(({ field }) => field)).toContain(
        'resolution.candidates',
      )
      expect(validation.current.status).toBe('solved')
    }
  })

  it('does not substitute a different snapshot and rejects inconsistent plans', () => {
    const plan = originalPlan()
    const wrongSnapshot = validateAvailabilityPlan(
      plan,
      { participants: participants(), snapshot: { id: 'freebusy/team-b', version: '1' } },
      context,
    )
    const invalidPlan = validateAvailabilityPlan(
      { ...plan, candidates: [...plan.candidates, ...plan.candidates] },
      { participants: participants(), snapshot: { id: 'freebusy/team-a', version: '1' } },
      context,
    )

    expect(wrongSnapshot.status).toBe('unverifiable')
    expect(invalidPlan).toMatchObject({
      error: { code: 'INVALID_AVAILABILITY_PLAN' },
      status: 'error',
    })
  })
})
