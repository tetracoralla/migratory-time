import { describe, expect, it } from 'vitest'
import { computeDeadline } from './businessDeadline'
import type {
  BusinessCalendar,
  ComputeDeadlineInput,
} from './businessCalendarTypes'
import type { TimePlanContext } from './timePlanTypes'

const context: TimePlanContext = {
  timeZoneData: 'IANA',
  timeZoneDataVersion: 'test-tzdb',
}

function weekdayCalendar(
  overrides: Partial<BusinessCalendar> = {},
): BusinessCalendar {
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

function compute(
  overrides: Partial<ComputeDeadlineInput> = {},
) {
  return computeDeadline(
    {
      calendar: weekdayCalendar(),
      durationMinutes: 240,
      startInstant: '2026-09-03T08:40:00Z',
      ...overrides,
    },
    context,
  )
}

describe('business deadline calculation', () => {
  it('adds exact business minutes across local business dates', () => {
    const result = compute()

    expect(result.status).toBe('computed')
    if (result.status === 'computed') {
      expect(result.plan).toMatchObject({
        dependencies: [
          {
            id: 'company.support.cn',
            timeZone: 'Asia/Shanghai',
            type: 'business_calendar',
            version: '2026.09',
          },
          { type: 'tzdb', version: 'test-tzdb' },
        ],
        intent: {
          durationMinutes: 240,
          startInstant: '2026-09-03T08:40:00Z',
          startPolicy: 'reject',
        },
        resolution: {
          businessDatesUsed: 2,
          businessMinutesConsumed: 240,
          deadlineInstant: '2026-09-04T03:40:00Z',
          deadlineLocalDateTime: '2026-09-04T11:40:00',
          deadlineOffset: '+08:00',
          effectiveStartInstant: '2026-09-03T08:40:00Z',
          startWasBusinessTime: true,
        },
        schemaVersion: 'migratory.business-deadline.v0.1',
      })
      expect(result.plan.dependencies[0].definitionFingerprint).toMatch(
        /^fnv1a64:[0-9a-f]{16}$/,
      )
    }
  })

  it('rejects an outside start by default and can explicitly move to next open', () => {
    const rejected = compute({ startInstant: '2026-09-03T12:00:00Z' })
    const moved = compute({
      startInstant: '2026-09-03T12:00:00Z',
      startPolicy: 'next_open',
    })

    expect(rejected).toEqual({
      conflict: {
        kind: 'start_outside_business_time',
        nextBusinessOpen: {
          instant: '2026-09-04T01:00:00Z',
          localDateTime: '2026-09-04T09:00',
          offset: '+08:00',
        },
        startInstant: '2026-09-03T12:00:00Z',
        timeZone: 'Asia/Shanghai',
      },
      status: 'conflict',
    })
    expect(moved.status).toBe('computed')
    if (moved.status === 'computed') {
      expect(moved.plan.resolution).toMatchObject({
        deadlineInstant: '2026-09-04T05:00:00Z',
        effectiveStartInstant: '2026-09-04T01:00:00Z',
        startWasBusinessTime: false,
      })
    }
  })

  it('uses exception dates as full replacements for weekly hours', () => {
    const result = compute({
      calendar: weekdayCalendar({
        exceptions: [{ date: '2026-09-04', intervals: [] }],
      }),
    })

    expect(result.status).toBe('computed')
    if (result.status === 'computed') {
      expect(result.plan.resolution.deadlineInstant).toBe('2026-09-07T03:40:00Z')
      expect(result.plan.resolution.deadlineLocalDateTime).toBe(
        '2026-09-07T11:40:00',
      )
    }
  })

  it('supports explicit overnight intervals without treating them as two dates', () => {
    const result = computeDeadline(
      {
        calendar: weekdayCalendar({
          id: 'night-shift',
          timeZone: 'UTC',
          weeklyHours: {
            MO: [{ end: '06:00', endDayOffset: 1, start: '22:00' }],
          },
        }),
        durationMinutes: 120,
        startInstant: '2026-09-07T23:00:00Z',
      },
      context,
    )

    expect(result.status).toBe('computed')
    if (result.status === 'computed') {
      expect(result.plan.resolution).toMatchObject({
        businessDatesUsed: 1,
        deadlineInstant: '2026-09-08T01:00:00Z',
        deadlineLocalDateTime: '2026-09-08T01:00:00',
      })
    }
  })

  it('rejects a nonexistent DST boundary until a shift policy is explicit', () => {
    const baseCalendar = weekdayCalendar({
      id: 'sunday-operations',
      timeZone: 'America/New_York',
      weeklyHours: {
        SU: [{ end: '04:00', start: '02:30' }],
      },
    })
    const rejected = computeDeadline(
      {
        calendar: baseCalendar,
        durationMinutes: 30,
        startInstant: '2026-03-08T06:00:00Z',
        startPolicy: 'next_open',
      },
      context,
    )
    const shifted = computeDeadline(
      {
        calendar: {
          ...baseCalendar,
          boundaryPolicies: { gap: 'shift_forward' },
        },
        durationMinutes: 30,
        startInstant: '2026-03-08T06:00:00Z',
        startPolicy: 'next_open',
      },
      context,
    )

    expect(rejected).toMatchObject({
      conflict: {
        boundary: 'start',
        kind: 'dst_gap',
        localDateTime: '2026-03-08T02:30',
      },
      status: 'conflict',
    })
    expect(shifted.status).toBe('computed')
    if (shifted.status === 'computed') {
      expect(shifted.plan.resolution).toMatchObject({
        boundaryAdjustmentCount: 1,
        deadlineInstant: '2026-03-08T08:00:00Z',
        effectiveStartInstant: '2026-03-08T07:30:00Z',
      })
      expect(shifted.plan.resolution.boundaryAdjustments).toEqual([
        {
          boundary: 'start',
          direction: 'forward',
          effectiveLocalDateTime: '2026-03-08T03:30',
          scheduledLocalDateTime: '2026-03-08T02:30',
          sourceDate: '2026-03-08',
        },
      ])
    }
  })

  it('requires an explicit occurrence for an overlapping DST boundary', () => {
    const baseCalendar = weekdayCalendar({
      id: 'fallback-operations',
      timeZone: 'America/New_York',
      weeklyHours: {
        SU: [{ end: '03:00', start: '01:30' }],
      },
    })
    const rejected = computeDeadline(
      {
        calendar: baseCalendar,
        durationMinutes: 60,
        startInstant: '2026-11-01T04:00:00Z',
        startPolicy: 'next_open',
      },
      context,
    )
    const earlier = computeDeadline(
      {
        calendar: {
          ...baseCalendar,
          boundaryPolicies: { overlap: 'earlier' },
        },
        durationMinutes: 60,
        startInstant: '2026-11-01T04:00:00Z',
        startPolicy: 'next_open',
      },
      context,
    )
    const later = computeDeadline(
      {
        calendar: {
          ...baseCalendar,
          boundaryPolicies: { overlap: 'later' },
        },
        durationMinutes: 60,
        startInstant: '2026-11-01T04:00:00Z',
        startPolicy: 'next_open',
      },
      context,
    )

    expect(rejected).toMatchObject({
      conflict: {
        boundary: 'start',
        kind: 'dst_overlap',
        localDateTime: '2026-11-01T01:30',
      },
      status: 'conflict',
    })
    expect(earlier.status).toBe('computed')
    expect(later.status).toBe('computed')
    if (earlier.status === 'computed' && later.status === 'computed') {
      expect(earlier.plan.resolution.deadlineInstant).toBe('2026-11-01T06:30:00Z')
      expect(earlier.plan.resolution.deadlineLocalDateTime).toBe(
        '2026-11-01T01:30:00',
      )
      expect(later.plan.resolution.deadlineInstant).toBe('2026-11-01T07:30:00Z')
      expect(later.plan.resolution.deadlineLocalDateTime).toBe(
        '2026-11-01T02:30:00',
      )
    }
  })

  it('rejects overlapping, duplicate, and oversized calendar inputs', () => {
    const overlapping = compute({
      calendar: weekdayCalendar({
        weeklyHours: {
          MO: [{ end: '06:00', endDayOffset: 1, start: '22:00' }],
          TU: [{ end: '08:00', start: '05:00' }],
        },
      }),
    })
    const duplicateException = compute({
      calendar: weekdayCalendar({
        exceptions: [
          { date: '2026-09-04', intervals: [] },
          { date: '2026-09-04', intervals: [] },
        ],
      }),
    })
    const invalidDuration = compute({ durationMinutes: 525_601 })

    expect(overlapping).toMatchObject({
      error: { code: 'INVALID_BUSINESS_CALENDAR' },
      status: 'error',
    })
    expect(duplicateException).toMatchObject({
      error: { code: 'DUPLICATE_EXCEPTION_DATE' },
      status: 'error',
    })
    expect(invalidDuration).toMatchObject({
      error: { code: 'INVALID_DURATION' },
      status: 'error',
    })
  })

  it('reports a closed calendar as bounded unsatisfiable work', () => {
    const result = computeDeadline(
      {
        calendar: weekdayCalendar({ weeklyHours: {} }),
        durationMinutes: 1,
        startInstant: '2026-09-03T08:40:00Z',
        startPolicy: 'next_open',
      },
      context,
    )

    expect(result).toEqual({
      context,
      reason: 'no_business_time_within_search_limit',
      scannedDays: 3_660,
      status: 'unsatisfiable',
    })
  })
})
