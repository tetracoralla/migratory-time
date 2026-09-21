import { describe, expect, it } from 'vitest'
import { computeDeadline } from './businessDeadline'
import { validateBusinessDeadlinePlan } from './businessDeadlineValidation'
import { normalizeBusinessCalendar } from './businessCalendarValidation'
import type { BusinessCalendar } from './businessCalendarTypes'
import type { TimePlanContext } from './timePlanTypes'

const context: TimePlanContext = {
  timeZoneData: 'IANA',
  timeZoneDataVersion: 'test-tzdb',
}

function calendar(overrides: Partial<BusinessCalendar> = {}): BusinessCalendar {
  return {
    id: 'company.support.cn',
    schemaVersion: 'migratory.business-calendar.v0.1',
    timeZone: 'Asia/Shanghai',
    version: '2026.09',
    weeklyHours: {
      FR: [{ end: '18:00', start: '09:00' }],
      MO: [{ end: '18:00', start: '09:00' }],
      TH: [{ end: '18:00', start: '09:00' }],
      TU: [{ end: '18:00', start: '09:00' }],
      WE: [{ end: '18:00', start: '09:00' }],
    },
    ...overrides,
  }
}

function originalPlan() {
  const result = computeDeadline(
    {
      calendar: calendar(),
      durationMinutes: 240,
      startInstant: '2026-09-03T08:40:00Z',
    },
    context,
  )
  expect(result.status).toBe('computed')
  if (result.status !== 'computed') throw new Error('Expected computed plan')
  return result.plan
}

describe('business deadline plan validation', () => {
  it('fingerprints normalized public calendar meaning rather than input order', () => {
    const ordered = normalizeBusinessCalendar(
      calendar({
        exceptions: [
          { date: '2026-09-08', intervals: [] },
          { date: '2026-09-07', intervals: [{ end: '18:00', start: '09:00' }] },
        ],
        weeklyHours: {
          MO: [
            { end: '18:00', start: '13:00' },
            { end: '12:00', start: '09:00' },
          ],
        },
      }),
      'en',
    )
    const reordered = normalizeBusinessCalendar(
      calendar({
        exceptions: [
          { date: '2026-09-07', intervals: [{ end: '18:00', start: '09:00' }] },
          { date: '2026-09-08', intervals: [] },
        ],
        weeklyHours: {
          MO: [
            { end: '12:00', start: '09:00' },
            { end: '18:00', start: '13:00' },
          ],
        },
      }),
      'en',
    )

    expect(ordered.definitionFingerprint).toBe(reordered.definitionFingerprint)
  })

  it('keeps identity and provider version outside the content fingerprint', () => {
    const original = normalizeBusinessCalendar(calendar(), 'en')
    const metadataOnly = normalizeBusinessCalendar(
      calendar({ id: 'company.support.renamed', version: '2026.10' }),
      'en',
    )

    expect(metadataOnly.definitionFingerprint).toBe(
      original.definitionFingerprint,
    )
  })

  it('recomputes an unchanged plan and reports dependency-only changes separately', () => {
    const plan = originalPlan()
    const unchanged = validateBusinessDeadlinePlan(
      plan,
      calendar(),
      'en',
      context,
    )
    const newerDefinition = validateBusinessDeadlinePlan(
      plan,
      calendar({ version: '2026.10' }),
      'en',
      { ...context, timeZoneDataVersion: 'test-tzdb-next' },
    )

    expect(unchanged).toMatchObject({ dependencyChanges: [], status: 'unchanged' })
    expect(newerDefinition.status).toBe('unchanged')
    if (newerDefinition.status === 'unchanged') {
      expect(newerDefinition.dependencyChanges.map(({ field }) => field)).toEqual([
        'dependencies[0].version',
        'dependencies[1].version',
      ])
      expect(newerDefinition.currentPlan.resolution.deadlineInstant).toBe(
        plan.resolution.deadlineInstant,
      )
    }
  })

  it('reports changed business facts as semantic drift with the current result', () => {
    const plan = originalPlan()
    const validation = validateBusinessDeadlinePlan(
      plan,
      calendar({
        version: '2026.10',
        weeklyHours: {
          FR: [{ end: '10:00', start: '09:00' }],
          MO: [{ end: '18:00', start: '09:00' }],
          TH: [{ end: '18:00', start: '09:00' }],
          TU: [{ end: '18:00', start: '09:00' }],
          WE: [{ end: '18:00', start: '09:00' }],
        },
      }),
      'en',
      context,
    )

    expect(validation.status).toBe('drifted')
    if (validation.status === 'drifted') {
      expect(validation.differences.map(({ field }) => field)).toContain(
        'resolution.deadlineInstant',
      )
      expect(validation.current.status).toBe('computed')
      if (validation.current.status === 'computed') {
        expect(validation.current.plan.resolution.deadlineInstant).not.toBe(
          plan.resolution.deadlineInstant,
        )
      }
    }
  })

  it('does not substitute a different calendar and rejects inconsistent plans', () => {
    const plan = originalPlan()
    const wrongCalendar = validateBusinessDeadlinePlan(
      plan,
      calendar({ id: 'company.other' }),
      'en',
      context,
    )
    const invalidPlan = validateBusinessDeadlinePlan(
      {
        ...plan,
        resolution: {
          ...plan.resolution,
          businessMinutesConsumed: plan.intent.durationMinutes - 1,
        },
      },
      calendar(),
      'en',
      context,
    )

    expect(wrongCalendar.status).toBe('unverifiable')
    expect(invalidPlan).toMatchObject({
      error: { code: 'INVALID_BUSINESS_DEADLINE_PLAN' },
      status: 'error',
    })
  })
})
