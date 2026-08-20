import { describe, expect, it } from 'vitest'
import {
  getAllTimeZoneIds,
  getDefaultTimeZoneIds,
  getTimeZoneDefinition,
  resolveTimeZoneInput,
  searchTimeZoneDefinitions,
} from './timeZoneRegistry'

describe('global time-zone registry', () => {
  it('keeps legacy defaults while exposing a global canonical registry', () => {
    expect(getDefaultTimeZoneIds()).toEqual([
      'Asia/Shanghai',
      'America/New_York',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Berlin',
    ])
    expect(getAllTimeZoneIds().length).toBeGreaterThan(300)
    expect(getAllTimeZoneIds()).toContain('Asia/Kathmandu')
    expect(getAllTimeZoneIds()).toContain('Pacific/Chatham')
    expect(getAllTimeZoneIds()).toContain('Australia/Lord_Howe')
  })

  it('canonicalizes IANA links and stable product aliases', () => {
    expect(getTimeZoneDefinition('US/Pacific')?.id).toBe('America/Los_Angeles')
    expect(resolveTimeZoneInput('东京', 'zh')).toMatchObject({
      status: 'resolved',
      timeZone: { id: 'Asia/Tokyo' },
    })
    expect(resolveTimeZoneInput('Kathmandu', 'en')).toMatchObject({
      status: 'resolved',
      timeZone: { id: 'Asia/Kathmandu' },
    })
    expect(resolveTimeZoneInput('Chatham Islands', 'en')).toMatchObject({
      status: 'resolved',
      timeZone: { id: 'Pacific/Chatham' },
    })
  })

  it('resolves canonical IANA Etc fixed-offset zones', () => {
    expect(getAllTimeZoneIds()).toContain('Etc/GMT+12')
    expect(getAllTimeZoneIds()).toContain('Etc/GMT-14')
    expect(resolveTimeZoneInput('Etc/GMT-8', 'en')).toMatchObject({
      status: 'resolved',
      timeZone: { id: 'Etc/GMT-8' },
    })
    expect(getTimeZoneDefinition('Etc/GMT+5')).toMatchObject({
      countryName: '世界',
      shortLabel: 'UTC−5',
    })
    expect(getTimeZoneDefinition('Etc/GMT+5', 'en')?.countryName).toBe('World')
    expect(getTimeZoneDefinition('Etc/GMT-14')?.shortLabelEn).toBe('UTC+14')
    expect(getTimeZoneDefinition('Etc/GMT+0')?.id).toBe('UTC')
    expect(getTimeZoneDefinition('Etc/Zulu')?.id).toBe('UTC')
  })

  it('resolves ordinary fixed-offset notation without exposing IANA sign inversion', () => {
    expect(resolveTimeZoneInput('UTC-5', 'en')).toMatchObject({
      status: 'resolved',
      timeZone: { id: 'Etc/GMT+5' },
    })
    expect(resolveTimeZoneInput('GMT−5', 'en')).toMatchObject({
      status: 'resolved',
      timeZone: { id: 'Etc/GMT+5' },
    })
    expect(resolveTimeZoneInput('UTC+14', 'en')).toMatchObject({
      status: 'resolved',
      timeZone: { id: 'Etc/GMT-14' },
    })
    expect(searchTimeZoneDefinitions('GMT+8', 'en', 1)[0]?.id).toBe(
      'Etc/GMT-8',
    )
    expect(resolveTimeZoneInput('UTC 5', 'en')).toEqual({
      input: 'UTC 5',
      status: 'unknown',
    })
  })

  it('does not guess partial free text during direct resolution', () => {
    expect(resolveTimeZoneInput('somewhere near Paris', 'en')).toEqual({
      input: 'somewhere near Paris',
      status: 'unknown',
    })
    expect(searchTimeZoneDefinitions('Paris', 'en', 8)[0].id).toBe(
      'Europe/Paris',
    )
  })

  it('uses a deliberate common-world empty search instead of raw data order', () => {
    expect(searchTimeZoneDefinitions('', 'zh', 10).map((zone) => zone.id)).toEqual([
      'Asia/Shanghai',
      'America/New_York',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Berlin',
      'UTC',
      'Asia/Tokyo',
      'Asia/Kolkata',
      'Asia/Singapore',
      'Asia/Dubai',
    ])
    expect(getTimeZoneDefinition('UTC')).toMatchObject({
      countryName: '世界',
      label: '协调世界时',
      labelEn: 'UTC',
    })
    expect(searchTimeZoneDefinitions('Paris', 'en', 1)[0]).toMatchObject({
      countryName: 'France',
      id: 'Europe/Paris',
    })
  })

  it('gives global selections a concise place identity for the human UI', () => {
    expect(getTimeZoneDefinition('Europe/Paris', 'zh')).toMatchObject({
      label: '中欧时间',
      shortLabel: '巴黎',
      shortLabelEn: 'Paris',
    })
    expect(getTimeZoneDefinition('Asia/Kathmandu', 'zh')).toMatchObject({
      shortLabel: '加德满都',
      shortLabelEn: 'Kathmandu',
    })
    expect(getTimeZoneDefinition('Pacific/Chatham', 'zh')).toMatchObject({
      shortLabel: '查塔姆岛',
      shortLabelEn: 'Chatham',
    })
    expect(getTimeZoneDefinition('Europe/Andorra', 'zh')).toMatchObject({
      shortLabel: 'Andorra la Vella',
      shortLabelEn: 'Andorra la Vella',
    })
  })
})
