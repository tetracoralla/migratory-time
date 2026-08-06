import { describe, expect, it } from 'vitest'
import { TIME_ZONES } from '../data/timeZones'
import { getTemporal } from './temporal'
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
})
