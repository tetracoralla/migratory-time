import { describe, expect, it } from 'vitest'
import {
  convertInstant,
  formatEditableDateTimeInput,
  makeCopyText,
  parseEditableDateTime,
  resolveWallTime,
} from './timeConversion'
import { getTemporal } from './temporal'

describe('time zone conversion', () => {
  it('converts the primary Beijing workflow across summer time zones', () => {
    const resolution = resolveWallTime(
      '2026-08-03',
      '16:30',
      'Asia/Shanghai',
    )

    expect(resolution.status).toBe('valid')
    if (resolution.status !== 'valid') return

    const results = convertInstant(resolution.instant)
    expect(results.map((result) => result.timeLabel)).toEqual([
      '16:30',
      '04:30',
      '01:30',
      '09:30',
      '10:30',
    ])
    expect(results.map((result) => result.utcOffsetLabel)).toEqual([
      'UTC+8',
      'UTC−4',
      'UTC−7',
      'UTC+1',
      'UTC+2',
    ])
  })

  it('uses each region rule during the US-Europe transition gap', () => {
    const resolution = resolveWallTime(
      '2026-03-15',
      '20:00',
      'Asia/Shanghai',
    )

    expect(resolution.status).toBe('valid')
    if (resolution.status !== 'valid') return

    const results = convertInstant(resolution.instant)
    expect(results.map((result) => result.timeLabel)).toEqual([
      '20:00',
      '08:00',
      '05:00',
      '12:00',
      '13:00',
    ])
  })

  it('surfaces a repeated local time instead of silently guessing', () => {
    const resolution = resolveWallTime(
      '2026-11-01',
      '01:30',
      'America/New_York',
    )

    expect(resolution.status).toBe('ambiguous')
    if (resolution.status !== 'ambiguous') return

    expect(resolution.later.epochMilliseconds - resolution.earlier.epochMilliseconds).toBe(
      60 * 60 * 1000,
    )
  })

  it('rejects a local time skipped by a clock change', () => {
    expect(
      resolveWallTime('2026-03-08', '02:30', 'America/New_York').status,
    ).toBe('nonexistent')
  })

  it('rejects a calendar date that does not exist', () => {
    expect(
      resolveWallTime('2026-02-30', '12:00', 'Asia/Shanghai').status,
    ).toBe('nonexistent')
  })

  it('refuses pre-1901 wall times that need sub-minute historical offsets', () => {
    expect(
      resolveWallTime('1900-12-31', '12:00', 'Asia/Shanghai').status,
    ).toBe('unsupported')
    expect(
      resolveWallTime('1901-01-01', '12:00', 'Asia/Shanghai').status,
    ).toBe('valid')
  })

  it('formats historical second-level IANA offsets without decimal corruption', () => {
    const results = convertInstant(
      // Direct conversion remains defensive even though interactive wall-time input starts at 1901.
      getTemporal().Instant.from('1800-01-01T12:00:00Z'),
    )

    expect(results[0].utcOffsetLabel).toBe('UTC+8:05:43')
    expect(results[1].utcOffsetLabel).toBe('UTC−4:56:02')
  })

  it('builds a compact copy block with professional summer abbreviations', () => {
    const resolution = resolveWallTime(
      '2026-08-03',
      '16:30',
      'Asia/Shanghai',
    )
    if (resolution.status !== 'valid') throw new Error('expected valid time')

    const text = makeCopyText(convertInstant(resolution.instant))

    expect(text).toBe(
      [
        'CST | 2026-08-03 16:30',
        'EDT | 2026-08-03 04:30',
        'PDT | 2026-08-03 01:30',
        'BST | 2026-08-03 09:30',
        'CEST | 2026-08-03 10:30',
      ].join('\n'),
    )
  })

  it('switches copy abbreviations with winter time-zone rules', () => {
    const resolution = resolveWallTime(
      '2026-01-15',
      '16:30',
      'Asia/Shanghai',
    )
    if (resolution.status !== 'valid') throw new Error('expected valid time')

    expect(
      convertInstant(resolution.instant).map(
        (result) => result.timeZoneAbbreviation,
      ),
    ).toEqual(['CST', 'EST', 'PST', 'GMT', 'CET'])
  })

  it('formats twelve typed digits as one editable date-time value', () => {
    expect(formatEditableDateTimeInput('202608031630')).toBe(
      '2026-08-03 16:30',
    )
    expect(formatEditableDateTimeInput('2026-08-03 04:30')).toBe(
      '2026-08-03 04:30',
    )
    expect(formatEditableDateTimeInput('2026080')).toBe('2026-08-0')
  })

  it('parses a completed inline value and rejects incomplete input', () => {
    expect(parseEditableDateTime('2026-08-03 04:30')).toEqual({
      date: '2026-08-03',
      time: '04:30',
    })
    expect(parseEditableDateTime('20260803')).toBeNull()
  })
})
