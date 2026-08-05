import { TIME_ZONES } from '../data/timeZones'
import type { Locale } from '../types'

export const PREFERENCES_STORAGE_KEY = 'migratory-time-preferences-v1'

export interface Preferences {
  locale: Locale
  zoneIds: string[]
}

export const DEFAULT_PREFERENCES: Preferences = {
  locale: 'zh',
  zoneIds: TIME_ZONES.map((zone) => zone.id),
}

function normalizeZoneIds(value: unknown) {
  if (!Array.isArray(value)) return DEFAULT_PREFERENCES.zoneIds

  const allowed = new Set(TIME_ZONES.map((zone) => zone.id))
  const requested = new Set(
    value.filter((zoneId): zoneId is string =>
      typeof zoneId === 'string' && allowed.has(zoneId),
    ),
  )
  const zoneIds = TIME_ZONES.map((zone) => zone.id).filter((zoneId) =>
    requested.has(zoneId),
  )

  return zoneIds.length ? zoneIds : DEFAULT_PREFERENCES.zoneIds
}

export function loadPreferences(storage?: Pick<Storage, 'getItem'>): Preferences {
  if (!storage) return DEFAULT_PREFERENCES

  try {
    const stored = JSON.parse(storage.getItem(PREFERENCES_STORAGE_KEY) ?? '{}')
    return {
      locale: stored.locale === 'en' ? 'en' : 'zh',
      zoneIds: normalizeZoneIds(stored.zoneIds),
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function savePreferences(
  storage: Pick<Storage, 'setItem'> | undefined,
  preferences: Preferences,
) {
  if (!storage) return

  try {
    storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // Preferences remain usable for this session when storage is unavailable.
  }
}
