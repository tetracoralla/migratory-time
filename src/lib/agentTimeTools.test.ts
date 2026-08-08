import { describe, expect, it } from 'vitest'
import { TIME_ZONES } from '../data/timeZones'
import { getTemporal } from './temporal'
import {
  convertTime,
  currentTimes,
  listTimeZones,
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
    expect(result.copyText).toBe(
      'PDT | 2026-08-03 01:30\nBST | 2026-08-03 09:30',
    )
    expect(result.shareUrl).toContain('?t=20260803T0830Z&z=pt,uk')
  })

  it('returns both candidates for a repeated local time instead of guessing', () => {
    const result = convertTime({
      localDateTime: '2026-11-01 01:30',
      sourceTimeZone: 'America/New_York',
      targetTimeZones: ['America/New_York'],
    })

    expect(result.status).toBe('ambiguous')
    if (result.status !== 'ambiguous') return

    expect(result.candidates.map((candidate) => candidate.choice)).toEqual([
      'earlier',
      'later',
    ])
    expect(
      result.candidates.map(
        (candidate) => candidate.results[0].abbreviation,
      ),
    ).toEqual(['EDT', 'EST'])
    expect(
      getTemporal().Instant.from(result.candidates[1].instant)
        .epochMilliseconds -
        getTemporal().Instant.from(result.candidates[0].instant)
          .epochMilliseconds,
    ).toBe(60 * 60 * 1000)
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

  it('surfaces skipped and invalid local times', () => {
    expect(
      convertTime({
        localDateTime: '2026-03-08 02:30',
        sourceTimeZone: 'America/New_York',
      }).status,
    ).toBe('nonexistent')
    expect(
      convertTime({
        localDateTime: '2026-02-30 12:00',
        sourceTimeZone: 'Asia/Shanghai',
      }).status,
    ).toBe('nonexistent')
  })

  it('rejects malformed input, unknown zones, duplicates, and empty targets', () => {
    expect(() =>
      convertTime({
        localDateTime: '2026/08/03 16:30',
        sourceTimeZone: 'Asia/Shanghai',
      }),
    ).toThrow(/YYYY-MM-DD HH:mm/)
    expect(() =>
      convertTime({
        localDateTime: '2026-08-03 16:30',
        sourceTimeZone: 'EST',
      }),
    ).toThrow(/configured Migratory Time region or IANA time zone/)
    expect(() =>
      convertTime({
        localDateTime: '2026-08-03 16:30',
        sourceTimeZone: 'Asia/Shanghai',
        targetTimeZones: ['Europe/London', 'Europe/London'],
      }),
    ).toThrow(/duplicates/)
    expect(() =>
      convertTime({
        localDateTime: '2026-08-03 16:30',
        sourceTimeZone: 'Asia/Shanghai',
        targetTimeZones: [],
      }),
    ).toThrow(/at least one/)
  })

  it('returns a deterministic current-time snapshot for callers', () => {
    const result = currentTimes(
      {
        locale: 'zh',
        targetTimeZones: ['Asia/Shanghai', 'America/New_York'],
      },
      getTemporal().Instant.from('2026-08-03T08:30:00Z'),
    )

    expect(result.results.map((zone) => zone.dateTime)).toEqual([
      '2026-08-03 16:30',
      '2026-08-03 04:30',
    ])
    expect(result.results.map((zone) => zone.label)).toEqual([
      '北京时间',
      '美东时间',
    ])
  })

  it('accepts ordinary Chinese and English region aliases without discovery', () => {
    const current = currentTimes(
      {
        locale: 'zh',
        targetTimeZones: ['北京时间', '欧洲中部'],
      },
      getTemporal().Instant.from('2026-08-03T08:30:00Z'),
    )
    const converted = convertTime({
      localDateTime: '2026-08-03 09:00',
      sourceTimeZone: 'US Pacific',
      targetTimeZones: ['北京', 'UK'],
    })

    expect(current.results.map((zone) => zone.timeZone)).toEqual([
      'Asia/Shanghai',
      'Europe/Berlin',
    ])
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    expect(converted.source.timeZone).toBe('America/Los_Angeles')
    expect(converted.results.map((zone) => zone.timeZone)).toEqual([
      'Asia/Shanghai',
      'Europe/London',
    ])
  })

  it('rejects duplicate regions even when different aliases resolve to the same zone', () => {
    expect(() =>
      currentTimes({ targetTimeZones: ['ce', '欧洲中部'] }),
    ).toThrow(/duplicates/)
  })

  it('lists every region from the product configuration source', () => {
    expect(listTimeZones().timeZones.map((zone) => zone.timeZone)).toEqual(
      TIME_ZONES.map((zone) => zone.id),
    )
    expect(listTimeZones().timeZones[4].aliases).toContain('欧洲中部')
  })
})
