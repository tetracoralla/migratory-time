import { TIME_ZONES } from '../../../src/data/timeZones'
import { getTemporal } from '../../../src/lib/temporal'

export const WIDGET_RECORD_VERSION = 1

export interface WidgetRecord {
  instant: string
  stageLabel: string
  version: number
  zoneIds: string[]
}

const zoneIdSet = new Set(TIME_ZONES.map((zone) => zone.id))

function normalizeInstant(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback

  try {
    return getTemporal().Instant.from(value).toString()
  } catch {
    return fallback
  }
}

export function createDefaultWidgetRecord(now = new Date()): WidgetRecord {
  return {
    instant: now.toISOString(),
    stageLabel: '',
    version: WIDGET_RECORD_VERSION,
    zoneIds: TIME_ZONES.map((zone) => zone.id),
  }
}

export function normalizeWidgetRecord(
  value: unknown,
  now = new Date(),
): WidgetRecord {
  const fallback = createDefaultWidgetRecord(now)
  if (!value || typeof value !== 'object') return fallback

  const candidate = value as Partial<WidgetRecord>
  const instant = normalizeInstant(candidate.instant, fallback.instant)
  const stageLabel =
    typeof candidate.stageLabel === 'string'
      ? candidate.stageLabel.slice(0, 40)
      : fallback.stageLabel
  const zoneIds = Array.isArray(candidate.zoneIds)
    ? TIME_ZONES.map((zone) => zone.id).filter((id) =>
        candidate.zoneIds?.includes(id),
      )
    : fallback.zoneIds

  return {
    instant,
    stageLabel,
    version: WIDGET_RECORD_VERSION,
    zoneIds: zoneIds.length ? zoneIds : fallback.zoneIds,
  }
}

export function toggleWidgetZone(zoneIds: string[], zoneId: string) {
  if (!zoneIdSet.has(zoneId)) return zoneIds
  const selected = new Set(zoneIds)
  if (selected.has(zoneId)) {
    if (selected.size === 1) return zoneIds
    selected.delete(zoneId)
  } else {
    selected.add(zoneId)
  }

  return TIME_ZONES.map((zone) => zone.id).filter((id) => selected.has(id))
}
