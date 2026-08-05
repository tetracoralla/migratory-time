import { describe, expect, it, vi } from 'vitest'
import { resolveTemporal, type TemporalNamespace } from './temporal'

describe('Temporal runtime selection', () => {
  it('uses a complete native implementation without loading the fallback', async () => {
    const nativeTemporal = {
      Now: { instant: vi.fn() },
      ZonedDateTime: { from: vi.fn() },
    } as unknown as TemporalNamespace
    const loadPolyfill = vi.fn()

    await expect(resolveTemporal(nativeTemporal, loadPolyfill)).resolves.toBe(
      nativeTemporal,
    )
    expect(loadPolyfill).not.toHaveBeenCalled()
  })

  it('dynamically loads the fallback when native Temporal is unavailable', async () => {
    const fallback = {
      Now: { instant: vi.fn() },
      ZonedDateTime: { from: vi.fn() },
    } as unknown as TemporalNamespace
    const loadPolyfill = vi.fn().mockResolvedValue({ Temporal: fallback })

    await expect(resolveTemporal(undefined, loadPolyfill)).resolves.toBe(
      fallback,
    )
    expect(loadPolyfill).toHaveBeenCalledTimes(1)
  })
})
