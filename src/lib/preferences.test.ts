import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  PREFERENCES_STORAGE_KEY,
  savePreferences,
} from './preferences'

describe('viewer preferences', () => {
  it('keeps the user-selected region order and rejects unknown values', () => {
    const storage = {
      getItem: vi.fn().mockReturnValue(
        JSON.stringify({
          locale: 'en',
          zoneIds: ['Europe/London', 'unknown', 'Asia/Shanghai'],
        }),
      ),
    }

    expect(loadPreferences(storage)).toEqual({
      locale: 'en',
      zoneIds: ['Europe/London', 'Asia/Shanghai'],
    })
  })

  it('falls back to a useful visible list when stored data is broken or empty', () => {
    expect(loadPreferences({ getItem: () => '{' })).toEqual(DEFAULT_PREFERENCES)
    expect(
      loadPreferences({
        getItem: () => JSON.stringify({ locale: 'zh', zoneIds: [] }),
      }),
    ).toEqual(DEFAULT_PREFERENCES)
  })

  it('stores only the compact preference object', () => {
    const storage = { setItem: vi.fn() }
    savePreferences(storage, {
      locale: 'en',
      zoneIds: ['America/Los_Angeles'],
    })

    expect(storage.setItem).toHaveBeenCalledWith(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        locale: 'en',
        zoneIds: ['America/Los_Angeles'],
      }),
    )
  })
})
