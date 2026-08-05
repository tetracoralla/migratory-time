import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeClipboardText } from './clipboard'

describe('clipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('surfaces clipboard permission failures to the caller', async () => {
    const permissionError = new Error('permission denied')
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(permissionError),
      },
    })

    await expect(writeClipboardText('test')).rejects.toBe(permissionError)
  })
})
