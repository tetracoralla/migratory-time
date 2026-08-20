import { describe, expect, it } from 'vitest'
import { TIME_ZONES } from '../data/timeZones'
import { getTemporal } from './temporal'
import { getAllTimeZoneIds } from '../data/timeZoneRegistry'
import {
  makeShareUrl,
  parseSharedLaunchState,
} from './shareState'

const Temporal = getTemporal()

describe('shared clock state', () => {
  it('round-trips a fixed minute and selected regions through a compact URL', () => {
    const instant = Temporal.Instant.from('2026-08-17T07:00:42Z')
    const url = makeShareUrl(
      'https://tetracoralla.github.io/migratory-time/?old=value#section',
      instant,
      ['Asia/Shanghai', 'America/Los_Angeles'],
    )

    expect(url).toBe(
      'https://tetracoralla.github.io/migratory-time/?t=20260817T0700Z&z=cn,pt',
    )

    const parsed = parseSharedLaunchState(new URL(url).search)
    expect(parsed.status).toBe('valid')
    if (parsed.status !== 'valid') return

    expect(parsed.instant.toString()).toBe('2026-08-17T07:00:00Z')
    expect(parsed.zoneIds).toEqual([
      'Asia/Shanghai',
      'America/Los_Angeles',
    ])
  })

  it('distinguishes a normal visit from incomplete or invalid share data', () => {
    expect(parseSharedLaunchState('?utm_source=feishu')).toEqual({
      status: 'none',
    })
    expect(parseSharedLaunchState('?t=20260817T0700Z')).toEqual({
      status: 'invalid',
    })
    expect(
      parseSharedLaunchState('?t=20260230T0700Z&z=cn,unknown'),
    ).toEqual({ status: 'invalid' })
    expect(parseSharedLaunchState('?t=19001231T0700Z&z=cn')).toEqual({
      status: 'invalid',
    })
    expect(() =>
      makeShareUrl(
        'https://example.com/migratory-time/',
        Temporal.Instant.from('1900-12-31T07:00:00Z'),
        ['Asia/Shanghai'],
      ),
    ).toThrow(/minute-precision range/)
  })

  it('shares the earliest supported Shanghai wall time across the UTC year boundary', () => {
    const url = makeShareUrl(
      'https://example.com/migratory-time/',
      Temporal.ZonedDateTime.from({
        year: 1901,
        month: 1,
        day: 1,
        hour: 0,
        minute: 0,
        timeZone: 'Asia/Shanghai',
      }).toInstant(),
      ['Asia/Shanghai', 'America/Los_Angeles'],
    )

    expect(new URL(url).searchParams.get('t')).toBe('19001231T1600Z')
    expect(parseSharedLaunchState(new URL(url).search).status).toBe('valid')
  })

  it('round-trips every region from the single time-zone configuration', () => {
    const shareCodes = TIME_ZONES.map((zone) => zone.shareCode)
    expect(shareCodes.every((code) => /^[a-z0-9]+$/.test(code))).toBe(true)
    expect(new Set(shareCodes).size).toBe(TIME_ZONES.length)

    for (const zone of TIME_ZONES) {
      const url = makeShareUrl(
        'https://example.com/migratory-time/',
        Temporal.Instant.from('2026-08-17T07:00:00Z'),
        [zone.id],
      )
      expect(new URL(url).searchParams.get('z')).toBe(zone.shareCode)

      const parsed = parseSharedLaunchState(new URL(url).search)
      expect(parsed.status).toBe('valid')
      if (parsed.status === 'valid') {
        expect(parsed.zoneIds).toEqual([zone.id])
      }
    }
  })

  it('rejects share links carrying more than the supported region count', () => {
    // Zone ids with "+" require percent-encoding in a query string, so the
    // hand-built link below sticks to ids that survive unencoded.
    const ids = getAllTimeZoneIds()
      .filter((id) => !id.includes('+'))
      .slice(0, 21)
    expect(
      parseSharedLaunchState(`?t=20260817T0700Z&z=${ids.join(',')}`).status,
    ).toBe('invalid')
    expect(
      parseSharedLaunchState(
        `?t=20260817T0700Z&z=${ids.slice(0, 20).join(',')}`,
      ).status,
    ).toBe('valid')
  })

  it('round-trips ordered global IANA ids while accepting legacy short codes', () => {
    const url = makeShareUrl(
      'https://example.com/migratory-time/',
      Temporal.Instant.from('2026-08-17T07:00:00Z'),
      ['Asia/Kathmandu', 'Pacific/Chatham', 'Europe/Paris'],
    )

    expect(url).toContain(
      'z=Asia%2FKathmandu,Pacific%2FChatham,Europe%2FParis',
    )
    const parsed = parseSharedLaunchState(new URL(url).search)
    expect(parsed.status).toBe('valid')
    if (parsed.status === 'valid') {
      expect(parsed.zoneIds).toEqual([
        'Asia/Kathmandu',
        'Pacific/Chatham',
        'Europe/Paris',
      ])
    }
    expect(parseSharedLaunchState('?t=20260817T0700Z&z=cn,pt')).toMatchObject({
      status: 'valid',
      zoneIds: ['Asia/Shanghai', 'America/Los_Angeles'],
    })
  })
})
