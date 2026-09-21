import { describe, expect, it } from 'vitest'
import {
  resolveTime,
  TIME_PLAN_SCHEMA_VERSION,
  type FixedWallTimePlan,
  type TimePlanContext,
} from './timePlan'
import { validateTimePlan } from './timePlanValidation'

const context: TimePlanContext = {
  timeZoneData: 'IANA',
  timeZoneDataVersion: 'test-tzdb-a',
}

describe('time plans', () => {
  it('canonicalizes a fixed instant without inventing a tzdb dependency', () => {
    const result = resolveTime(
      {
        intent: {
          anchor: 'fixed_instant',
          instant: '2026-09-01T10:00:00+02:00',
        },
      },
      context,
    )

    expect(result).toEqual({
      plan: {
        anchor: 'fixed_instant',
        dependencies: [],
        intent: { instant: '2026-09-01T08:00:00Z' },
        resolution: { instant: '2026-09-01T08:00:00Z' },
        revalidation: { trigger: 'none' },
        schemaVersion: TIME_PLAN_SCHEMA_VERSION,
      },
      status: 'resolved',
    })
  })

  it('resolves a fixed wall time with canonical zone and tzdb dependency', () => {
    const result = resolveTime(
      {
        intent: {
          anchor: 'fixed_wall_time',
          localDateTime: '2026-09-01T16:30',
          timeZone: '北京时间',
        },
        locale: 'zh',
      },
      context,
    )

    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved' || result.plan.anchor !== 'fixed_wall_time') return
    expect(result.plan).toMatchObject({
      anchor: 'fixed_wall_time',
      dependencies: [
        {
          timeZone: 'Asia/Shanghai',
          type: 'tzdb',
          version: 'test-tzdb-a',
        },
      ],
      intent: {
        disambiguation: 'reject',
        localDateTime: '2026-09-01T16:30',
        timeZone: 'Asia/Shanghai',
      },
      resolution: {
        instant: '2026-09-01T08:30:00Z',
        offset: '+08:00',
      },
      revalidation: { trigger: 'tzdb_change' },
    })
  })

  it('returns two explicit plans for a repeated local time', () => {
    const result = resolveTime(
      {
        intent: {
          anchor: 'fixed_wall_time',
          localDateTime: '2026-11-01T01:30',
          timeZone: 'America/New_York',
        },
      },
      context,
    )

    expect(result.status).toBe('ambiguous')
    if (result.status !== 'ambiguous') return
    expect(result.candidates.map(({ choice }) => choice)).toEqual(['earlier', 'later'])
    expect(result.candidates.map(({ plan }) => plan.resolution)).toEqual([
      { instant: '2026-11-01T05:30:00Z', offset: '-04:00' },
      { instant: '2026-11-01T06:30:00Z', offset: '-05:00' },
    ])
    expect(result.candidates.map(({ plan }) => plan.intent.disambiguation)).toEqual([
      'earlier',
      'later',
    ])
  })

  it('honors an explicit occurrence and rejects a nonexistent local time', () => {
    const later = resolveTime(
      {
        intent: {
          anchor: 'fixed_wall_time',
          disambiguation: 'later',
          localDateTime: '2026-11-01T01:30',
          timeZone: 'America/New_York',
        },
      },
      context,
    )
    const nonexistent = resolveTime(
      {
        intent: {
          anchor: 'fixed_wall_time',
          localDateTime: '2026-03-08T02:30',
          timeZone: 'America/New_York',
        },
      },
      context,
    )

    expect(later.status).toBe('resolved')
    if (later.status === 'resolved') {
      expect(later.plan.resolution.instant).toBe('2026-11-01T06:30:00Z')
    }
    expect(nonexistent.status).toBe('nonexistent')
  })

  it('returns missing fields without guessing and rejects invalid values', () => {
    expect(
      resolveTime({ intent: { anchor: 'fixed_wall_time' } }, context),
    ).toEqual({
      missing: ['intent.localDateTime', 'intent.timeZone'],
      status: 'underspecified',
    })

    const invalidDate = resolveTime(
      {
        intent: {
          anchor: 'fixed_wall_time',
          localDateTime: '2026-02-30T12:00',
          timeZone: 'UTC',
        },
      },
      context,
    )
    expect(invalidDate.status).toBe('error')
    if (invalidDate.status === 'error') {
      expect(invalidDate.error.code).toBe('INVALID_FORMAT')
      expect(invalidDate.error.retryable).toBe(false)
    }

    const invalidInstant = resolveTime(
      { intent: { anchor: 'fixed_instant', instant: 'tomorrow' } },
      context,
    )
    expect(invalidInstant.status).toBe('error')
    if (invalidInstant.status === 'error') {
      expect(invalidInstant.error.code).toBe('INVALID_INSTANT')
    }
  })

  it('revalidates unchanged meaning while surfacing a changed dependency version', () => {
    const resolved = resolveTime(
      {
        intent: {
          anchor: 'fixed_wall_time',
          localDateTime: '2026-09-01T16:30',
          timeZone: 'Asia/Shanghai',
        },
      },
      context,
    )
    expect(resolved.status).toBe('resolved')
    if (resolved.status !== 'resolved') return

    const validation = validateTimePlan(resolved.plan, {
      ...context,
      timeZoneDataVersion: 'test-tzdb-b',
    })
    expect(validation.status).toBe('unchanged')
    if (validation.status !== 'unchanged') return
    expect(validation.dependencyChanges).toEqual([
      {
        current: 'test-tzdb-b',
        field: 'dependencies[0].version',
        previous: 'test-tzdb-a',
      },
    ])
    expect(validation.currentPlan.anchor).toBe('fixed_wall_time')
    if (validation.currentPlan.anchor !== 'fixed_wall_time') return
    expect(validation.currentPlan.dependencies[0].version).toBe('test-tzdb-b')
  })

  it('reports semantic drift and returns the current resolution', () => {
    const resolved = resolveTime(
      {
        intent: {
          anchor: 'fixed_wall_time',
          localDateTime: '2026-09-01T16:30',
          timeZone: 'Asia/Shanghai',
        },
      },
      context,
    )
    expect(resolved.status).toBe('resolved')
    if (resolved.status !== 'resolved' || resolved.plan.anchor !== 'fixed_wall_time') return
    const priorPlan: FixedWallTimePlan = {
      ...resolved.plan,
      dependencies: [{ ...resolved.plan.dependencies[0], version: 'older-tzdb' }],
      resolution: { instant: '2026-09-01T09:30:00Z', offset: '+07:00' },
    }

    const validation = validateTimePlan(priorPlan, context)
    expect(validation.status).toBe('drifted')
    if (validation.status !== 'drifted') return
    expect(validation.differences.map(({ field }) => field)).toEqual([
      'dependencies[0].version',
      'resolution.instant',
      'resolution.offset',
    ])
    expect(validation.current.status).toBe('resolved')
  })

  it('reports a current ambiguity when rules no longer produce one resolution', () => {
    const fabricatedPrior: FixedWallTimePlan = {
      anchor: 'fixed_wall_time',
      dependencies: [
        {
          timeZone: 'America/New_York',
          type: 'tzdb',
          version: 'older-tzdb',
        },
      ],
      intent: {
        disambiguation: 'reject',
        localDateTime: '2026-11-01T01:30',
        timeZone: 'America/New_York',
      },
      resolution: { instant: '2026-11-01T05:30:00Z', offset: '-04:00' },
      revalidation: { trigger: 'tzdb_change' },
      schemaVersion: TIME_PLAN_SCHEMA_VERSION,
    }

    const validation = validateTimePlan(fabricatedPrior, context)
    expect(validation.status).toBe('drifted')
    if (validation.status !== 'drifted') return
    expect(validation.current.status).toBe('ambiguous')
    expect(validation.differences.at(-1)).toEqual({
      current: 'ambiguous',
      field: 'resolution.status',
      previous: 'resolved',
    })
  })

  it('rejects inconsistent fixed-instant plans and preserves unknown versions', () => {
    const resolved = resolveTime(
      { intent: { anchor: 'fixed_instant', instant: '2026-09-01T08:00:00Z' } },
      context,
    )
    expect(resolved.status).toBe('resolved')
    if (resolved.status !== 'resolved' || resolved.plan.anchor !== 'fixed_instant') return

    const invalid = validateTimePlan(
      {
        ...resolved.plan,
        resolution: { instant: '2026-09-01T09:00:00Z' },
      },
      context,
    )
    expect(invalid.status).toBe('error')
    if (invalid.status === 'error') {
      expect(invalid.error.code).toBe('INVALID_TIME_PLAN')
    }

    const unknownVersion = validateTimePlan(
      { ...resolved.plan, schemaVersion: 'migratory.time-plan.v9' },
      context,
    )
    expect(unknownVersion.status).toBe('unverifiable')
  })
})
