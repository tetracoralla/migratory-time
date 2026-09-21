import { describe, expect, it } from 'vitest'
import { findTimeWindows } from './availabilitySolver'
import type { FindTimeWindowsInput } from './availabilityTypes'
import type { TimePlanContext } from './timePlanTypes'

const context: TimePlanContext = {
  timeZoneData: 'IANA',
  timeZoneDataVersion: 'test-tzdb',
}

const search = {
  end: '2026-09-01T08:00:00Z',
  start: '2026-09-01T00:00:00Z',
}

function baseInput(
  overrides: Partial<FindTimeWindowsInput> = {},
): FindTimeWindowsInput {
  return {
    durationMinutes: 60,
    maxCandidates: 3,
    participants: [
      {
        availability: [{ end: '2026-09-01T06:00:00Z', start: search.start }],
        busy: [{ end: '2026-09-01T03:00:00Z', start: '2026-09-01T02:00:00Z' }],
        id: 'shanghai',
        preferred: [{ end: '2026-09-01T06:00:00Z', start: '2026-09-01T04:00:00Z' }],
        timeZone: 'Asia/Shanghai',
      },
      {
        availability: [{ end: '2026-09-01T06:00:00Z', start: '2026-09-01T01:00:00Z' }],
        id: 'london',
        preferred: [{ end: '2026-09-01T05:00:00Z', start: '2026-09-01T04:00:00Z' }],
        timeZone: 'Europe/London',
      },
      {
        availability: [{ end: '2026-09-01T07:00:00Z', start: '2026-09-01T03:00:00Z' }],
        id: 'new-york',
        timeZone: 'America/New_York',
      },
    ],
    search,
    snapshot: { id: 'freebusy/team-a', version: '2026-09-01T00:00Z' },
    stepMinutes: 60,
    ...overrides,
  }
}

describe('availability window solver', () => {
  it('intersects availability, subtracts busy time, and ranks explicit preferences', () => {
    const result = findTimeWindows(baseInput(), context)

    expect(result.status).toBe('solved')
    if (result.status === 'solved') {
      expect(result.candidates.map(({ startInstant }) => startInstant)).toEqual([
        '2026-09-01T04:00:00Z',
        '2026-09-01T05:00:00Z',
        '2026-09-01T03:00:00Z',
      ])
      expect(result.candidates.map(({ preferenceSatisfied }) => preferenceSatisfied)).toEqual([
        2,
        1,
        0,
      ])
      expect(result.candidates[0]).toMatchObject({
        endInstant: '2026-09-01T05:00:00Z',
        outsidePreferenceParticipants: [],
        preferenceTotal: 2,
        preferredParticipants: ['london', 'shanghai'],
      })
      expect(result.candidates[0].localViews).toEqual([
        {
          endLocalDateTime: '2026-09-01T06:00:00',
          endOffset: '+01:00',
          participantId: 'london',
          startLocalDateTime: '2026-09-01T05:00:00',
          startOffset: '+01:00',
          timeZone: 'Europe/London',
        },
        {
          endLocalDateTime: '2026-09-01T01:00:00',
          endOffset: '-04:00',
          participantId: 'new-york',
          startLocalDateTime: '2026-09-01T00:00:00',
          startOffset: '-04:00',
          timeZone: 'America/New_York',
        },
        {
          endLocalDateTime: '2026-09-01T13:00:00',
          endOffset: '+08:00',
          participantId: 'shanghai',
          startLocalDateTime: '2026-09-01T12:00:00',
          startOffset: '+08:00',
          timeZone: 'Asia/Shanghai',
        },
      ])
      expect(result.dependencies[0]).toMatchObject({
        id: 'freebusy/team-a',
        type: 'availability_snapshot',
        version: '2026-09-01T00:00Z',
      })
      expect(result.dependencies[0].definitionFingerprint).toMatch(
        /^fnv1a64:[0-9a-f]{16}$/,
      )
    }
  })

  it('returns a deterministic irreducible participant conflict', () => {
    const result = findTimeWindows(
      baseInput({
        participants: [
          {
            availability: [{ end: '2026-09-01T02:00:00Z', start: search.start }],
            id: 'a',
            timeZone: 'UTC',
          },
          {
            availability: [{ end: '2026-09-01T04:00:00Z', start: '2026-09-01T02:00:00Z' }],
            id: 'b',
            timeZone: 'UTC',
          },
          {
            availability: [{ end: search.end, start: search.start }],
            id: 'irrelevant',
            timeZone: 'UTC',
          },
        ],
      }),
      context,
    )

    expect(result).toMatchObject({
      conflict: {
        kind: 'no_common_availability',
        participantIds: ['a', 'b'],
      },
      status: 'unsatisfiable',
    })
  })

  it('treats participants as an unordered id-keyed set', () => {
    const solved = findTimeWindows(baseInput(), context)
    const reorderedSolved = findTimeWindows(
      baseInput({ participants: [...baseInput().participants].reverse() }),
      context,
    )
    expect(reorderedSolved).toEqual(solved)

    const participants = [
      {
        availability: [{ end: '2026-09-01T01:00:00Z', start: search.start }],
        id: 'a',
        timeZone: 'UTC',
      },
      {
        availability: [{
          end: '2026-09-01T03:00:00Z',
          start: '2026-09-01T02:00:00Z',
        }],
        id: 'b',
        timeZone: 'UTC',
      },
      {
        availability: [{ end: '2026-09-01T01:00:00Z', start: search.start }],
        id: 'c',
        timeZone: 'UTC',
      },
    ]
    const conflict = findTimeWindows(baseInput({ participants }), context)
    const reorderedConflict = findTimeWindows(
      baseInput({ participants: [...participants].reverse() }),
      context,
    )

    expect(conflict).toMatchObject({
      conflict: { participantIds: ['a', 'b'] },
      status: 'unsatisfiable',
    })
    expect(reorderedConflict).toEqual(conflict)
  })

  it('distinguishes duration and alignment failures', () => {
    const participant = {
      availability: [
        { end: '2026-09-01T00:57:00Z', start: '2026-09-01T00:02:00Z' },
      ],
      id: 'a',
      timeZone: 'UTC',
    }
    const durationFailure = findTimeWindows(
      baseInput({ durationMinutes: 60, participants: [participant] }),
      context,
    )
    const alignmentFailure = findTimeWindows(
      baseInput({
        durationMinutes: 30,
        participants: [participant],
        stepMinutes: 30,
      }),
      context,
    )

    expect(durationFailure).toMatchObject({
      conflict: { kind: 'duration_does_not_fit' },
      status: 'unsatisfiable',
    })
    expect(alignmentFailure).toMatchObject({
      conflict: { kind: 'alignment_excludes_all' },
      status: 'unsatisfiable',
    })
  })

  it('merges overlapping inputs and clips them to the exact search window', () => {
    const result = findTimeWindows(
      baseInput({
        participants: [
          {
            availability: [
              { end: '2026-09-01T04:00:00Z', start: '2026-08-31T23:00:00Z' },
              { end: '2026-09-01T06:00:00Z', start: '2026-09-01T03:00:00Z' },
            ],
            id: 'a',
            timeZone: 'UTC',
          },
        ],
        stepMinutes: 60,
      }),
      context,
    )

    expect(result.status).toBe('solved')
    if (result.status === 'solved') {
      expect(result.commonAvailabilityIntervalCount).toBe(1)
      expect(result.eligibleCandidateCount).toBe(6)
      expect(result.candidates.map(({ startInstant }) => startInstant)).toEqual([
        '2026-09-01T00:00:00Z',
        '2026-09-01T01:00:00Z',
        '2026-09-01T02:00:00Z',
      ])
    }
  })

  it('changes the dependency fingerprint when snapshot facts change', () => {
    const first = findTimeWindows(baseInput(), context)
    const changed = findTimeWindows(
      baseInput({
        participants: baseInput().participants.map((participant, index) =>
          index === 0
            ? {
                ...participant,
                busy: [
                  ...(participant.busy ?? []),
                  { end: '2026-09-01T04:00:00Z', start: '2026-09-01T03:30:00Z' },
                ],
              }
            : participant,
        ),
      }),
      context,
    )

    expect(first.status).toBe('solved')
    expect(changed.status).toBe('solved')
    if (first.status === 'solved' && changed.status === 'solved') {
      expect(first.dependencies[0].definitionFingerprint).not.toBe(
        changed.dependencies[0].definitionFingerprint,
      )
    }
  })

  it('keeps the content fingerprint stable across snapshot metadata changes', () => {
    const first = findTimeWindows(baseInput(), context)
    const metadataOnly = findTimeWindows(
      baseInput({
        participants: [...baseInput().participants].reverse(),
        snapshot: { id: 'freebusy/team-renamed', version: 'next' },
      }),
      context,
    )

    expect(first.status).toBe('solved')
    expect(metadataOnly.status).toBe('solved')
    if (first.status === 'solved' && metadataOnly.status === 'solved') {
      expect(metadataOnly.dependencies[0].definitionFingerprint).toBe(
        first.dependencies[0].definitionFingerprint,
      )
    }
  })

  it('rejects duplicate participants, invalid intervals, and oversized searches', () => {
    const duplicate = findTimeWindows(
      baseInput({
        participants: [baseInput().participants[0], baseInput().participants[0]],
      }),
      context,
    )
    const invalidInterval = findTimeWindows(
      baseInput({
        participants: [
          {
            availability: [{ end: search.start, start: search.end }],
            id: 'a',
            timeZone: 'UTC',
          },
        ],
      }),
      context,
    )
    const oversized = findTimeWindows(
      baseInput({
        search: {
          end: '2026-10-03T00:00:00Z',
          start: '2026-09-01T00:00:00Z',
        },
      }),
      context,
    )

    expect(duplicate).toMatchObject({
      error: { code: 'DUPLICATE_PARTICIPANT' },
      status: 'error',
    })
    expect(invalidInterval).toMatchObject({
      error: { code: 'INVALID_INTERVAL' },
      status: 'error',
    })
    expect(oversized).toMatchObject({
      error: { code: 'RANGE_TOO_LARGE' },
      status: 'error',
    })
  })
})
