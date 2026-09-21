import { describe, expect, it } from 'vitest'
import { expandSchedule } from './schedule'
import { validateSchedulePlan } from './schedulePlanValidation'
import type { TimePlanContext } from './timePlanTypes'

const context: TimePlanContext = {
  timeZoneData: 'IANA',
  timeZoneDataVersion: 'test-tzdb',
}

function originalPlan() {
  const result = expandSchedule(
    {
      maxInstances: 3,
      rule: { frequency: 'daily' },
      startLocalDateTime: '2026-09-01T09:00',
      timeZone: 'UTC',
      window: {
        endDateExclusive: '2026-09-04',
        startDateInclusive: '2026-09-01',
      },
    },
    context,
  )
  expect(result.status).toBe('expanded')
  if (result.status !== 'expanded') throw new Error('Expected expanded plan')
  return result
}

describe('schedule plan validation', () => {
  it('replays the normalized request and separates tzdb version changes', () => {
    const plan = originalPlan()
    const unchanged = validateSchedulePlan(plan, context)
    const newerTzdb = validateSchedulePlan(
      plan,
      { ...context, timeZoneDataVersion: 'test-tzdb-next' },
    )

    expect(plan).toMatchObject({
      dependencies: [{ timeZone: 'UTC', type: 'tzdb', version: 'test-tzdb' }],
      request: {
        additionalLocalDateTimes: [],
        excludedLocalDateTimes: [],
        maxInstances: 3,
        policies: { gap: 'reject', monthOverflow: 'reject', overlap: 'reject' },
        rule: { frequency: 'daily', interval: 1 },
        timeZone: 'UTC',
      },
      revalidation: { triggers: ['tzdb_change'] },
      schemaVersion: 'migratory.schedule-plan.v0.1',
    })
    expect(unchanged).toMatchObject({ dependencyChanges: [], status: 'unchanged' })
    expect(newerTzdb.status).toBe('unchanged')
    if (newerTzdb.status === 'unchanged') {
      expect(newerTzdb.dependencyChanges).toEqual([
        {
          current: 'test-tzdb-next',
          field: 'dependencies[0].version',
          previous: 'test-tzdb',
        },
      ])
    }
  })

  it('treats a stored plan with reordered JSON keys as unchanged', () => {
    const reverseKeys = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reverseKeys)
      if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .reverse()
            .map(([key, child]) => [key, reverseKeys(child)]),
        )
      }
      return value
    }
    const plan = originalPlan()
    const reorderedPlan = reverseKeys(JSON.parse(JSON.stringify(plan))) as typeof plan

    const validation = validateSchedulePlan(reorderedPlan, context)

    expect(validation).toMatchObject({ dependencyChanges: [], status: 'unchanged' })
  })

  it('detects a changed expansion and a newly conflicting recurrence', () => {
    const plan = originalPlan()
    const changedExpansion = validateSchedulePlan(
      {
        ...plan,
        instances: plan.instances.slice(1),
      },
      context,
    )
    const nowConflicting = validateSchedulePlan(
      {
        ...plan,
        dependencies: [
          {
            timeZone: 'America/New_York',
            type: 'tzdb',
            version: 'older-tzdb',
          },
        ],
        request: {
          ...plan.request,
          maxInstances: 4,
          startLocalDateTime: '2026-03-07T02:30',
          timeZone: 'America/New_York',
          window: {
            endDateExclusive: '2026-03-10',
            startDateInclusive: '2026-03-07',
          },
        },
      },
      context,
    )

    expect(changedExpansion.status).toBe('drifted')
    if (changedExpansion.status === 'drifted') {
      expect(changedExpansion.differences.at(-1)?.field).toBe(
        'resolution.expansion',
      )
    }
    expect(nowConflicting.status).toBe('drifted')
    if (nowConflicting.status === 'drifted') {
      expect(nowConflicting.current.status).toBe('conflict')
      expect(nowConflicting.differences.at(-1)).toEqual({
        current: 'conflict',
        field: 'resolution.status',
        previous: 'expanded',
      })
    }
  })

  it('rejects internally inconsistent schedule plans', () => {
    const plan = originalPlan()
    const invalid = validateSchedulePlan(
      {
        ...plan,
        instances: [...plan.instances, ...plan.instances],
      },
      context,
    )

    expect(invalid).toMatchObject({
      error: { code: 'INVALID_SCHEDULE_PLAN' },
      status: 'error',
    })
  })
})
