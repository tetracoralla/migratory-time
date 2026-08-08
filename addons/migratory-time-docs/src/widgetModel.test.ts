import { describe, expect, it } from 'vitest'
import {
  createDefaultWidgetRecord,
  normalizeWidgetRecord,
  toggleWidgetZone,
} from './widgetModel'

describe('Feishu Docs widget record', () => {
  it('normalizes persisted data and removes unknown regions', () => {
    const result = normalizeWidgetRecord({
      instant: '2026-08-05T04:13:00Z',
      stageLabel: '发布',
      version: 0,
      zoneIds: ['America/Los_Angeles', 'Mars/Olympus'],
    })

    expect(result).toEqual({
      instant: '2026-08-05T04:13:00Z',
      stageLabel: '发布',
      version: 1,
      zoneIds: ['America/Los_Angeles'],
    })
  })

  it('requires an offset-bearing Temporal Instant and stores its canonical value', () => {
    const now = new Date('2026-08-05T04:13:00.000Z')

    expect(
      normalizeWidgetRecord({ instant: '2026-08-08' }, now).instant,
    ).toBe('2026-08-05T04:13:00.000Z')
    expect(
      normalizeWidgetRecord({ instant: '2026-08-08T12:30:00+08:00' }, now)
        .instant,
    ).toBe('2026-08-08T04:30:00Z')
  })

  it('never lets the region selection become empty', () => {
    expect(toggleWidgetZone(['Europe/London'], 'Europe/London')).toEqual([
      'Europe/London',
    ])
  })

  it('creates a complete default record', () => {
    expect(
      createDefaultWidgetRecord(new Date('2026-08-05T04:13:00.000Z')),
    ).toMatchObject({
      instant: '2026-08-05T04:13:00.000Z',
      version: 1,
      zoneIds: expect.arrayContaining(['Asia/Shanghai', 'Europe/Berlin']),
    })
  })
})
