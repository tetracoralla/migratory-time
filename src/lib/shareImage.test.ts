import { describe, expect, it, vi } from 'vitest'
import { convertInstant } from './timeConversion'
import { getTemporal } from './temporal'
import {
  canUseSystemShare,
  createShareCard,
  makeShareCardPreviewUrl,
  makeShareImageFilename,
  SHARE_CARD_WIDTH,
} from './shareImage'

const Temporal = getTemporal()

describe('share image', () => {
  const results = convertInstant(
    Temporal.Instant.from('2026-08-17T07:00:00Z'),
  ).filter((result) =>
    ['Asia/Shanghai', 'America/Los_Angeles'].includes(result.id),
  )

  it('builds a fixed-width mobile list card with source attribution', () => {
    const card = createShareCard(results, 'zh')

    expect(card.width).toBe(SHARE_CARD_WIDTH)
    expect(card.height).toBe(282)
    expect(card.svg).toContain('width="375"')
    expect(card.svg).toContain('北京时间')
    expect(card.svg).toContain('美西时间')
    expect(card.svg).toContain('2026-08-17 · 周一')
    expect(card.svg).toContain('Migratory Time · openAdam')
    expect(card.svg.match(/<circle /g)).toHaveLength(2)
    expect(makeShareCardPreviewUrl(card)).toMatch(
      /^data:image\/svg\+xml;charset=utf-8,/,
    )
  })

  it('uses abbreviations for an English share card', () => {
    const englishResults = convertInstant(
      Temporal.Instant.from('2026-08-17T07:00:00Z'),
      'en',
    ).filter((result) =>
      ['Asia/Shanghai', 'America/Los_Angeles'].includes(result.id),
    )
    const card = createShareCard(englishResults, 'en')

    expect(card.svg).toContain('CST')
    expect(card.svg).toContain('PDT')
    expect(card.svg).toContain('2026-08-17 · Mon')
    expect(card.svg).not.toContain('北京时间')
  })

  it('keeps otherwise identical calendar dates distinguishable by year', () => {
    const base = results[0]
    const card = createShareCard(
      [
        {
          ...base,
          dateLabel: '08月06日 周四',
          dateTimeValue: '2026-08-06T12:00',
        },
        {
          ...base,
          dateLabel: '08月06日 周四',
          dateTimeValue: '2037-08-06T12:00',
        },
      ],
      'zh',
    )

    expect(card.svg).toContain('2026-08-06 · 周四')
    expect(card.svg).toContain('2037-08-06 · 周四')
  })

  it('creates a stable PNG filename from the snapshot URL', () => {
    expect(
      makeShareImageFilename(
        'https://example.com/?t=20260817T0700Z&z=cn,pt',
      ),
    ).toBe('migratory-time-20260817T0700Z.png')
  })

  it('only exposes More when native system sharing exists', () => {
    expect(canUseSystemShare(undefined)).toBe(false)
    expect(
      canUseSystemShare({ share: vi.fn() as Navigator['share'] }),
    ).toBe(true)
  })
})
