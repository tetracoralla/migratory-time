import { describe, expect, it } from 'vitest'
import { MAX_SELECTED_TIME_ZONES } from '../data/timeZoneRegistry'
import { getTemporal } from './temporal'
import {
  convertTime,
  currentTimes,
  listTimeZones,
  searchTimeZones,
  SUPPORTED_TIME_ZONE_COUNT,
} from './agentTimeTools'

describe('agent time tools', () => {
  it('converts a scheduled time and preserves requested target order', () => {
    const result = convertTime({
      localDateTime: '2026-08-03 16:30',
      sourceTimeZone: 'Asia/Shanghai',
      targetTimeZones: ['America/Los_Angeles', 'Europe/London'],
    })

    expect(result.status).toBe('converted')
    if (result.status !== 'converted') return
    expect(result.results).toEqual([
      {
        abbreviation: 'PDT',
        dateTime: '2026-08-03 01:30',
        label: 'US Pacific',
        timeZone: 'America/Los_Angeles',
        utcOffset: 'UTC−7',
      },
      {
        abbreviation: 'BST',
        dateTime: '2026-08-03 09:30',
        label: 'United Kingdom',
        timeZone: 'Europe/London',
        utcOffset: 'UTC+1',
      },
    ])
    expect(result.shareUrl).toContain('?t=20260803T0830Z&z=pt,uk')
  })

  it('covers quarter-hour and 30-minute daylight-saving regions worldwide', () => {
    const result = convertTime({
      localDateTime: '2026-08-03 16:30',
      sourceTimeZone: '北京',
      targetTimeZones: ['Kathmandu', 'Pacific/Chatham', 'Australia/Lord_Howe'],
    })

    expect(result.status).toBe('converted')
    if (result.status !== 'converted') return
    expect(result.results.map(({ timeZone, dateTime, utcOffset }) => ({
      timeZone,
      dateTime,
      utcOffset,
    }))).toEqual([
      {
        dateTime: '2026-08-03 14:15',
        timeZone: 'Asia/Kathmandu',
        utcOffset: 'UTC+5:45',
      },
      {
        dateTime: '2026-08-03 21:15',
        timeZone: 'Pacific/Chatham',
        utcOffset: 'UTC+12:45',
      },
      {
        dateTime: '2026-08-03 19:00',
        timeZone: 'Australia/Lord_Howe',
        utcOffset: 'UTC+10:30',
      },
    ])
    expect(result.shareUrl).toContain(
      'z=Asia%2FKathmandu,Pacific%2FChatham,Australia%2FLord_Howe',
    )
  })

  it('returns both candidates for repeated local times instead of guessing', () => {
    const result = convertTime({
      localDateTime: '2026-11-01 01:30',
      sourceTimeZone: 'America/New_York',
      targetTimeZones: ['Asia/Shanghai'],
    })

    expect(result.status).toBe('ambiguous')
    if (result.status !== 'ambiguous') return
    expect(result.candidates.map((candidate) => candidate.choice)).toEqual([
      'earlier',
      'later',
    ])
    expect(result.candidates.map((candidate) => candidate.sourceOccurrence)).toEqual([
      {
        abbreviation: 'EDT',
        timeZone: 'America/New_York',
        utcOffset: 'UTC−4',
      },
      {
        abbreviation: 'EST',
        timeZone: 'America/New_York',
        utcOffset: 'UTC−5',
      },
    ])
    expect(
      getTemporal().Instant.from(result.candidates[1].instant).epochMilliseconds -
        getTemporal().Instant.from(result.candidates[0].instant).epochMilliseconds,
    ).toBe(60 * 60 * 1000)
  })

  it('preserves Lord Howe half-hour repeat and gap semantics', () => {
    const repeated = convertTime({
      localDateTime: '2026-04-05 01:45',
      sourceTimeZone: 'Australia/Lord_Howe',
      targetTimeZones: ['Asia/Tokyo'],
    })
    const skipped = convertTime({
      localDateTime: '2026-10-04 02:15',
      sourceTimeZone: 'Australia/Lord_Howe',
      targetTimeZones: ['Asia/Tokyo'],
    })

    expect(repeated.status).toBe('ambiguous')
    if (repeated.status === 'ambiguous') {
      expect(
        getTemporal().Instant.from(repeated.candidates[1].instant).epochMilliseconds -
          getTemporal().Instant.from(repeated.candidates[0].instant).epochMilliseconds,
      ).toBe(30 * 60 * 1000)
    }
    expect(skipped.status).toBe('nonexistent')
  })

  it('uses an explicit earlier or later choice for a repeated time', () => {
    const earlier = convertTime({
      disambiguation: 'earlier',
      localDateTime: '2026-11-01 01:30',
      sourceTimeZone: 'America/New_York',
      targetTimeZones: ['America/New_York'],
    })
    const later = convertTime({
      disambiguation: 'later',
      localDateTime: '2026-11-01 01:30',
      sourceTimeZone: 'America/New_York',
      targetTimeZones: ['America/New_York'],
    })

    expect(earlier.status).toBe('converted')
    expect(later.status).toBe('converted')
    if (earlier.status !== 'converted' || later.status !== 'converted') return
    expect(earlier.results[0].abbreviation).toBe('EDT')
    expect(later.results[0].abbreviation).toBe('EST')
  })

  it('returns strict structured errors for invalid functional input', () => {
    const cases = [
      [
        convertTime({
          localDateTime: '2026/08/03 16:30',
          sourceTimeZone: 'Asia/Shanghai',
        }),
        'INVALID_FORMAT',
      ],
      [
        convertTime({
          localDateTime: '1900-12-31 12:00',
          sourceTimeZone: 'Asia/Shanghai',
        }),
        'UNSUPPORTED_YEAR',
      ],
      [
        convertTime({
          localDateTime: '2026-08-03 16:30',
          sourceTimeZone: 'not/a-zone',
        }),
        'UNKNOWN_TIME_ZONE',
      ],
      [
        currentTimes({ targetTimeZones: ['Europe/London', 'UK'] }),
        'DUPLICATE_TIME_ZONE',
      ],
      [currentTimes({ targetTimeZones: [] }), 'EMPTY_TARGETS'],
      [
        currentTimes({
          targetTimeZones: Array.from(
            { length: MAX_SELECTED_TIME_ZONES + 1 },
            (_, index) => `Etc/GMT${index}`,
          ),
        }),
        'TOO_MANY_TARGETS',
      ],
    ] as const

    for (const [result, code] of cases) {
      expect(result.status).toBe('error')
      if (result.status === 'error') {
        expect(result.error.code).toBe(code)
        expect(result.error.retryable).toBeTypeOf('boolean')
      }
    }
  })

  it('returns bounded candidates for a genuinely ambiguous place name', () => {
    const result = currentTimes({ targetTimeZones: ['United States'] })

    expect(result.status).toBe('error')
    if (result.status !== 'error') return
    expect(result.error.code).toBe('AMBIGUOUS_TIME_ZONE')
    expect(result.error.input).toBe('United States')
    expect(result.error.candidates?.length).toBeGreaterThan(1)
    expect(result.error.candidates?.length).toBeLessThanOrEqual(10)
  })

  it('refuses historical sub-minute offsets rather than rounding', () => {
    const result = convertTime({
      localDateTime: '1971-01-01 12:00',
      sourceTimeZone: 'Africa/Monrovia',
      targetTimeZones: ['UTC'],
    })

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.error.code).toBe('UNSUPPORTED_PRECISION')
      expect(result.error.retryable).toBe(false)
    }
  })

  it('returns deterministic current snapshots and accepts ordinary aliases', () => {
    const result = currentTimes(
      {
        locale: 'zh',
        targetTimeZones: ['北京时间', '欧洲中部', '东京', 'Nepal'],
      },
      getTemporal().Instant.from('2026-08-03T08:30:00Z'),
    )

    expect(result.status).toBe('converted')
    if (result.status !== 'converted') return
    expect(result.results.map((zone) => zone.timeZone)).toEqual([
      'Asia/Shanghai',
      'Europe/Berlin',
      'Asia/Tokyo',
      'Asia/Kathmandu',
    ])
    expect(result.results.map((zone) => zone.dateTime)).toEqual([
      '2026-08-03 16:30',
      '2026-08-03 10:30',
      '2026-08-03 17:30',
      '2026-08-03 14:15',
    ])
  })

  it('searches globally with a bounded result and current offset preview', () => {
    const result = searchTimeZones(
      { locale: 'en', query: 'Paris', limit: 10 },
      getTemporal().Instant.from('2026-08-03T08:30:00Z'),
    )

    expect(result.status).toBe('found')
    if (result.status !== 'found') return
    expect(result.items.length).toBeLessThanOrEqual(10)
    expect(result.items[0]).toMatchObject({
      id: 'Europe/Paris',
      utcOffset: 'UTC+2',
    })
  })

  it('pages the full registry without an unbounded response', () => {
    const first = listTimeZones({ limit: 50 })
    expect(first.status).toBe('listed')
    if (first.status !== 'listed') return
    expect(first.total).toBe(SUPPORTED_TIME_ZONE_COUNT)
    expect(first.items).toHaveLength(50)
    expect(first.nextCursor).toBe('50')

    const second = listTimeZones({ cursor: first.nextCursor ?? undefined, limit: 500 })
    expect(second.status).toBe('listed')
    if (second.status !== 'listed') return
    expect(second.items).toHaveLength(50)
    expect(new Set([...first.items, ...second.items].map((zone) => zone.id)).size).toBe(
      100,
    )

    const badCursor = listTimeZones({ cursor: '' })
    expect(badCursor.status).toBe('error')
    if (badCursor.status === 'error') {
      expect(badCursor.error.code).toBe('INVALID_CURSOR')
    }
  })

  it('keeps pagination complete and duplicate-free across locale changes', () => {
    const seen: string[] = []
    let cursor: string | undefined
    let locale: 'en' | 'zh' = 'en'
    for (let page = 0; page < 30; page += 1) {
      const result = listTimeZones({ cursor, limit: 50, locale })
      expect(result.status).toBe('listed')
      if (result.status !== 'listed') return
      seen.push(...result.items.map((zone) => zone.id))
      if (!result.nextCursor) break
      cursor = result.nextCursor
      locale = locale === 'en' ? 'zh' : 'en'
    }
    expect(seen.length).toBe(SUPPORTED_TIME_ZONE_COUNT)
    expect(new Set(seen).size).toBe(seen.length)
    expect(seen).toEqual([...seen].sort())
  })

  it('converts canonical IANA Etc fixed-offset zones without sign inversion', () => {
    const result = convertTime({
      localDateTime: '2026-08-20 12:00',
      sourceTimeZone: 'UTC',
      targetTimeZones: ['Etc/GMT+5', 'Etc/GMT-14'],
    })

    expect(result.status).toBe('converted')
    if (result.status !== 'converted') return
    const offsets = Object.fromEntries(
      result.results.map((zone) => [zone.timeZone, zone.utcOffset]),
    )
    expect(offsets['Etc/GMT+5']).toBe('UTC−5')
    expect(offsets['Etc/GMT-14']).toBe('UTC+14')
  })

  it('accepts ordinary UTC offset aliases for fixed-offset conversion', () => {
    const result = currentTimes(
      { targetTimeZones: ['UTC-5', 'GMT+8'] },
      getTemporal().Instant.from('2026-08-20T12:00:00Z'),
    )

    expect(result.status).toBe('converted')
    if (result.status !== 'converted') return
    expect(result.results.map(({ timeZone, dateTime, utcOffset }) => ({
      timeZone,
      dateTime,
      utcOffset,
    }))).toEqual([
      {
        dateTime: '2026-08-20 07:00',
        timeZone: 'Etc/GMT+5',
        utcOffset: 'UTC−5',
      },
      {
        dateTime: '2026-08-20 20:00',
        timeZone: 'Etc/GMT-8',
        utcOffset: 'UTC+8',
      },
    ])
  })
})
