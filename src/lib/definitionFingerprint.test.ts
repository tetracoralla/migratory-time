import { describe, expect, it } from 'vitest'
import { fingerprintDefinition } from './definitionFingerprint'

function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .reverse()
        .map(([key, child]) => [key, reverseKeys(child)]),
    )
  }
  return value
}

describe('definition fingerprint', () => {
  it('is invariant under object key reordering at every depth', () => {
    const value = {
      inner: { a: 1, b: [2, 3] },
      list: [{ x: 'x', y: 'y' }],
      z: 'last',
    }
    expect(fingerprintDefinition(reverseKeys(value) as object))
      .toBe(fingerprintDefinition(value))
  })
})
