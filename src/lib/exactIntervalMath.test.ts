import { describe, expect, it } from 'vitest'
import { alignInstantAtOrAfter } from './exactIntervalMath'
import { getTemporal } from './temporal'

describe('exact interval math', () => {
  it('aligns instants before, on, and after the origin grid', () => {
    const temporal = getTemporal()
    const origin = temporal.Instant.from('2026-09-01T00:00:00Z')
    const step = 15n * 60_000_000_000n

    expect(
      alignInstantAtOrAfter(
        temporal.Instant.from('2026-08-31T23:52:00Z'),
        origin,
        step,
      ).toString(),
    ).toBe('2026-09-01T00:00:00Z')
    expect(alignInstantAtOrAfter(origin, origin, step)).toBe(origin)
    expect(
      alignInstantAtOrAfter(
        temporal.Instant.from('2026-09-01T00:01:00Z'),
        origin,
        step,
      ).toString(),
    ).toBe('2026-09-01T00:15:00Z')
    expect(() => alignInstantAtOrAfter(origin, origin, 0n)).toThrow(
      'stepNanoseconds must be positive.',
    )
  })
})
