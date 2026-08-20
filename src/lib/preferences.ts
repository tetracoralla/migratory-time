import {
  getDefaultTimeZoneIds,
  getTimeZoneDefinition,
  MAX_SELECTED_TIME_ZONES,
} from '../data/timeZoneRegistry'
import type { Locale } from '../types'

export const PREFERENCES_STORAGE_KEY = 'migratory-time-preferences-v1'

export interface Preferences {
  locale: Locale
  zoneIds: string[]
}

export const DEFAULT_PREFERENCES: Preferences = {
  locale: 'zh',
  zoneIds: getDefaultTimeZoneIds(),
}

function normalizeZoneIds(value: unknown) {
  if (!Array.isArray(value)) return DEFAULT_PREFERENCES.zoneIds

  const zoneIds: string[] = []
  for (const valueItem of value) {
    if (typeof valueItem !== 'string') continue
    const definition = getTimeZoneDefinition(valueItem)
    if (!definition || zoneIds.includes(definition.id)) continue
    zoneIds.push(definition.id)
    if (zoneIds.length === MAX_SELECTED_TIME_ZONES) break
  }

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
