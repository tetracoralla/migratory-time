import type { Temporal } from '@js-temporal/polyfill'
import { TIME_ZONES } from '../data/timeZones'
import { getTemporal } from './temporal'

const NANOSECONDS_PER_MINUTE = 60_000_000_000

const ZONE_ID_BY_SHARE_CODE = new Map(
  TIME_ZONES.map((zone) => [zone.shareCode, zone.id]),
)

export type SharedLaunchState =
  | { status: 'none' }
  | { status: 'invalid' }
  | {
      status: 'valid'
      instant: Temporal.Instant
      zoneIds: string[]
    }

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function hasMinutePrecisionAcrossConfiguredZones(instant: Temporal.Instant) {
  return TIME_ZONES.every(
    (zone) =>
      instant.toZonedDateTimeISO(zone.id).offsetNanoseconds %
        NANOSECONDS_PER_MINUTE ===
      0,
  )
}

function encodeInstant(instant: Temporal.Instant) {
  const utc = instant.toZonedDateTimeISO('UTC')
  if (!hasMinutePrecisionAcrossConfiguredZones(instant)) {
    throw new RangeError('Shared time is outside the supported minute-precision range')
  }
  return `${utc.year}${pad(utc.month)}${pad(utc.day)}T${pad(utc.hour)}${pad(utc.minute)}Z`
}

function decodeInstant(value: string) {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})Z$/.exec(value)
  if (!match) return null

  try {
    const instant = getTemporal().Instant.from(
      `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00Z`,
    )
    return hasMinutePrecisionAcrossConfiguredZones(instant) ? instant : null
  } catch {
    return null
  }
}

function encodeZoneIds(zoneIds: string[]) {
  const selected = new Set(zoneIds)
  const selectedZones = TIME_ZONES.filter((zone) => selected.has(zone.id))

  if (selectedZones.length !== selected.size) {
    throw new Error('Every shared region must exist in the time-zone config')
  }

  return selectedZones.map((zone) => zone.shareCode).join(',')
}

function decodeZoneIds(value: string) {
  const codes = value.split(',')
  if (!codes.length || codes.some((code) => !ZONE_ID_BY_SHARE_CODE.has(code))) {
    return null
  }

  const requested = new Set(codes.map((code) => ZONE_ID_BY_SHARE_CODE.get(code)))
  const zoneIds = TIME_ZONES.map((zone) => zone.id).filter((zoneId) =>
    requested.has(zoneId),
  )

  return zoneIds.length ? zoneIds : null
}

export function parseSharedLaunchState(search: string): SharedLaunchState {
  const params = new URLSearchParams(search)
  const encodedInstant = params.get('t')
  const encodedZoneIds = params.get('z')

  if (encodedInstant === null && encodedZoneIds === null) {
    return { status: 'none' }
  }

  if (encodedInstant === null || encodedZoneIds === null) {
    return { status: 'invalid' }
  }

  const instant = decodeInstant(encodedInstant)
  const zoneIds = decodeZoneIds(encodedZoneIds)
  if (!instant || !zoneIds) return { status: 'invalid' }

  return { status: 'valid', instant, zoneIds }
}

export function makeShareUrl(
  currentUrl: string,
  instant: Temporal.Instant,
  zoneIds: string[],
) {
  const encodedZoneIds = encodeZoneIds(zoneIds)
  if (!encodedZoneIds) throw new Error('At least one region is required')

  const url = new URL(currentUrl)
  url.hash = ''
  url.search = `?t=${encodeInstant(instant)}&z=${encodedZoneIds}`
  return url.toString()
}
