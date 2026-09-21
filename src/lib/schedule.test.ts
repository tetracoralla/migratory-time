import { describe, expect, it } from 'vitest'
import { expandSchedule } from './schedule'
import type { TimePlanContext } from './timePlan'

const context: TimePlanContext = {
  timeZoneData: 'IANA',
  timeZoneDataVersion: 'test-tzdb',
}

describe('schedule expansion', () => {
  it('rejects a DST gap by default instead of silently changing the schedule', () => {
    const result = expandSchedule(
      {
        rule: { frequency: 'daily' },
        startLocalDateTime: '2026-03-07T02:30',
        timeZone: 'America/New_York',
        window: {
          endDateExclusive: '2026-03-10',
          startDateInclusive: '2026-03-07',
        },
      },
      context,
    )

    expect(result).toEqual({
      conflict: {
        kind: 'dst_gap',
        localDateTime: '2026-03-08T02:30',
        timeZone: 'America/New_York',
      },
      status: 'conflict',
    })
  })

  it('can skip or explicitly shift a DST gap', () => {
    const base = {
      rule: { frequency: 'daily' as const },
      startLocalDateTime: '2026-03-07T02:30',
      timeZone: 'America/New_York',
      window: {
        endDateExclusive: '2026-03-10',
        startDateInclusive: '2026-03-07',
      },
    }
    const skipped = expandSchedule(
      { ...base, policies: { gap: 'skip' } },
      context,
    )
    const shifted = expandSchedule(
      { ...base, policies: { gap: 'shift_forward' } },
      context,
    )

    expect(skipped.status).toBe('expanded')
    if (skipped.status === 'expanded') {
      expect(skipped.instances.map(({ scheduledLocalDateTime }) => scheduledLocalDateTime)).toEqual([
        '2026-03-07T02:30',
        '2026-03-09T02:30',
      ])
      expect(skipped.effects).toContainEqual({
        kind: 'gap_skipped',
        localDateTime: '2026-03-08T02:30',
      })
    }

    expect(shifted.status).toBe('expanded')
    if (shifted.status === 'expanded') {
      expect(shifted.instances[1]).toMatchObject({
        effectiveLocalDateTime: '2026-03-08T03:30',
        scheduledLocalDateTime: '2026-03-08T02:30',
      })
      expect(shifted.effects).toContainEqual({
        direction: 'forward',
        fromLocalDateTime: '2026-03-08T02:30',
        kind: 'gap_shifted',
        toLocalDateTime: '2026-03-08T03:30',
      })
    }
  })

  it('returns both plans only when the overlap policy explicitly requests both', () => {
    const result = expandSchedule(
      {
        policies: { overlap: 'both' },
        rule: { frequency: 'daily' },
        startLocalDateTime: '2026-10-31T01:30',
        timeZone: 'America/New_York',
        window: {
          endDateExclusive: '2026-11-02',
          startDateInclusive: '2026-10-31',
        },
      },
      context,
    )

    expect(result.status).toBe('expanded')
    if (result.status !== 'expanded') return
    const repeated = result.instances.find(
      ({ scheduledLocalDateTime }) => scheduledLocalDateTime === '2026-11-01T01:30',
    )
    expect(repeated?.plans.map(({ resolution }) => resolution)).toEqual([
      { instant: '2026-11-01T05:30:00Z', offset: '-04:00' },
      { instant: '2026-11-01T06:30:00Z', offset: '-05:00' },
    ])
  })

  it('expands selected weekdays from a Monday-based weekly interval', () => {
    const result = expandSchedule(
      {
        rule: {
          frequency: 'weekly',
          interval: 1,
          weekdays: ['MO', 'WE'],
        },
        startLocalDateTime: '2026-08-03T09:00',
        timeZone: 'Europe/London',
        window: {
          endDateExclusive: '2026-08-13',
          startDateInclusive: '2026-08-03',
        },
      },
      context,
    )

    expect(result.status).toBe('expanded')
    if (result.status !== 'expanded') return
    expect(result.instances.map(({ scheduledLocalDateTime }) => scheduledLocalDateTime)).toEqual([
      '2026-08-03T09:00',
      '2026-08-05T09:00',
      '2026-08-10T09:00',
      '2026-08-12T09:00',
    ])
  })

  it('makes monthly overflow reject, skip, and constrain observably different', () => {
    const base = {
      rule: { frequency: 'monthly' as const },
      startLocalDateTime: '2026-01-31T09:00',
      timeZone: 'UTC',
      window: {
        endDateExclusive: '2026-04-01',
        startDateInclusive: '2026-01-01',
      },
    }
    const rejected = expandSchedule(base, context)
    const skipped = expandSchedule(
      { ...base, policies: { monthOverflow: 'skip' } },
      context,
    )
    const constrained = expandSchedule(
      { ...base, policies: { monthOverflow: 'constrain_to_last_day' } },
      context,
    )

    expect(rejected).toEqual({
      conflict: {
        calendarMonth: '2026-02',
        kind: 'month_overflow',
        requestedDay: 31,
      },
      status: 'conflict',
    })
    expect(skipped.status).toBe('expanded')
    if (skipped.status === 'expanded') {
      expect(skipped.instances.map(({ scheduledLocalDateTime }) => scheduledLocalDateTime)).toEqual([
        '2026-01-31T09:00',
        '2026-03-31T09:00',
      ])
      expect(skipped.effects).toContainEqual({
        action: 'skipped',
        calendarMonth: '2026-02',
        kind: 'month_overflow',
        requestedDay: 31,
      })
    }
    expect(constrained.status).toBe('expanded')
    if (constrained.status === 'expanded') {
      expect(
        constrained.instances.map(({ scheduledLocalDateTime }) => scheduledLocalDateTime),
      ).toEqual([
        '2026-01-31T09:00',
        '2026-02-28T09:00',
        '2026-03-31T09:00',
      ])
      expect(constrained.effects).toContainEqual({
        action: 'constrained',
        calendarMonth: '2026-02',
        effectiveLocalDateTime: '2026-02-28T09:00',
        kind: 'month_overflow',
        requestedDay: 31,
      })
    }
  })

  it('merges explicit dates, applies exclusions, and paginates without duplicates', () => {
    const input = {
      additionalLocalDateTimes: ['2026-08-04T09:00', '2026-08-05T09:00'],
      excludedLocalDateTimes: ['2026-08-04T09:00'],
      maxInstances: 2,
      rule: { frequency: 'daily' as const },
      startLocalDateTime: '2026-08-03T09:00',
      timeZone: '北京时间',
      window: {
        endDateExclusive: '2026-08-08',
        startDateInclusive: '2026-08-03',
      },
    }
    const first = expandSchedule(input, context)
    expect(first.status).toBe('expanded')
    if (first.status !== 'expanded') return
    expect(first.instances.map(({ scheduledLocalDateTime, sources }) => ({
      scheduledLocalDateTime,
      sources,
    }))).toEqual([
      { scheduledLocalDateTime: '2026-08-03T09:00', sources: ['rule'] },
      {
        scheduledLocalDateTime: '2026-08-05T09:00',
        sources: ['rule', 'rdate'],
      },
    ])
    expect(first.effects).toContainEqual({
      kind: 'excluded',
      localDateTime: '2026-08-04T09:00',
    })
    expect(first.truncated).toBe(true)
    expect(first.nextCursor).toBe('2026-08-05T09:00')

    const second = expandSchedule({ ...input, cursor: first.nextCursor ?? undefined }, context)
    expect(second.status).toBe('expanded')
    if (second.status !== 'expanded') return
    expect(second.instances.map(({ scheduledLocalDateTime }) => scheduledLocalDateTime)).toEqual([
      '2026-08-06T09:00',
      '2026-08-07T09:00',
    ])
    expect(
      new Set(
        [...first.instances, ...second.instances].map(
          ({ scheduledLocalDateTime }) => scheduledLocalDateTime,
        ),
      ).size,
    ).toBe(4)
    expect(second.instances[0].plans[0].intent.timeZone).toBe('Asia/Shanghai')
  })

  it('rejects duplicate overrides, oversized windows, and historical precision loss', () => {
    const duplicate = expandSchedule(
      {
        additionalLocalDateTimes: ['2026-08-04T09:00', '2026-08-04T09:00'],
        rule: { frequency: 'daily' },
        startLocalDateTime: '2026-08-03T09:00',
        timeZone: 'UTC',
        window: {
          endDateExclusive: '2026-08-05',
          startDateInclusive: '2026-08-03',
        },
      },
      context,
    )
    expect(duplicate.status).toBe('error')
    if (duplicate.status === 'error') {
      expect(duplicate.error.code).toBe('DUPLICATE_SCHEDULE_DATE')
    }

    const oversized = expandSchedule(
      {
        rule: { frequency: 'daily' },
        startLocalDateTime: '2026-01-01T09:00',
        timeZone: 'UTC',
        window: {
          endDateExclusive: '2037-01-01',
          startDateInclusive: '2026-01-01',
        },
      },
      context,
    )
    expect(oversized.status).toBe('error')
    if (oversized.status === 'error') {
      expect(oversized.error.code).toBe('RANGE_TOO_LARGE')
    }

    const historical = expandSchedule(
      {
        rule: { frequency: 'daily' },
        startLocalDateTime: '1971-01-01T12:00',
        timeZone: 'Africa/Monrovia',
        window: {
          endDateExclusive: '1971-01-02',
          startDateInclusive: '1971-01-01',
        },
      },
      context,
    )
    expect(historical.status).toBe('error')
    if (historical.status === 'error') {
      expect(historical.error.code).toBe('UNSUPPORTED_PRECISION')
    }
  })

  it('uses the declared cursor error for a malformed continuation value', () => {
    const result = expandSchedule(
      {
        cursor: 'not-a-cursor',
        rule: { frequency: 'daily' },
        startLocalDateTime: '2026-08-03T09:00',
        timeZone: 'UTC',
        window: {
          endDateExclusive: '2026-08-05',
          startDateInclusive: '2026-08-03',
        },
      },
      context,
    )

    expect(result).toMatchObject({
      error: {
        code: 'INVALID_CURSOR',
        field: 'cursor',
        input: 'not-a-cursor',
      },
      status: 'error',
    })
  })

  it('fast-forwards a distant DTSTART without changing recurrence alignment', () => {
    const daily = expandSchedule(
      {
        rule: { frequency: 'daily', interval: 3 },
        startLocalDateTime: '1901-01-01T09:00',
        timeZone: 'UTC',
        window: {
          endDateExclusive: '2026-09-10',
          startDateInclusive: '2026-09-01',
        },
      },
      context,
    )
    const weekly = expandSchedule(
      {
        rule: { frequency: 'weekly', interval: 3, weekdays: ['MO'] },
        startLocalDateTime: '1901-01-01T09:00',
        timeZone: 'UTC',
        window: {
          endDateExclusive: '2026-10-01',
          startDateInclusive: '2026-09-01',
        },
      },
      context,
    )
    const monthly = expandSchedule(
      {
        rule: { frequency: 'monthly', interval: 3 },
        startLocalDateTime: '1901-01-01T09:00',
        timeZone: 'UTC',
        window: {
          endDateExclusive: '2026-12-01',
          startDateInclusive: '2026-09-01',
        },
      },
      context,
    )

    expect(daily.status).toBe('expanded')
    expect(weekly.status).toBe('expanded')
    expect(monthly.status).toBe('expanded')
    if (
      daily.status === 'expanded'
      && weekly.status === 'expanded'
      && monthly.status === 'expanded'
    ) {
      expect(daily.instances.map(({ scheduledLocalDateTime }) => scheduledLocalDateTime)).toEqual([
        '2026-09-02T09:00',
        '2026-09-05T09:00',
        '2026-09-08T09:00',
      ])
      expect(weekly.instances.map(({ scheduledLocalDateTime }) => scheduledLocalDateTime)).toEqual([
        '2026-09-07T09:00',
        '2026-09-28T09:00',
      ])
      expect(monthly.instances.map(({ scheduledLocalDateTime }) => scheduledLocalDateTime)).toEqual([
        '2026-10-01T09:00',
      ])
    }
  })
})
