import type { Temporal } from '@js-temporal/polyfill'
import {
  getTimeZoneDefinition,
  MAX_SELECTED_TIME_ZONES,
} from '../data/timeZoneRegistry'
import { TIME_ZONES } from '../data/timeZones'
import { getTemporal } from './temporal'
import { hasMinutePrecisionAcrossTimeZones } from './timeConversion'

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

function encodeInstant(instant: Temporal.Instant, zoneIds: string[]) {
  const utc = instant.toZonedDateTimeISO('UTC')
  if (!hasMinutePrecisionAcrossTimeZones(instant, zoneIds)) {
    throw new RangeError('Shared time is outside the supported minute-precision range')
  }
  return `${utc.year}${pad(utc.month)}${pad(utc.day)}T${pad(utc.hour)}${pad(utc.minute)}Z`
}

function decodeInstant(value: string, zoneIds: string[]) {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})Z$/.exec(value)
  if (!match) return null

  try {
    const instant = getTemporal().Instant.from(
      `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00Z`,
    )
    return hasMinutePrecisionAcrossTimeZones(instant, zoneIds) ? instant : null
  } catch {
    return null
  }
}

function encodeZoneIds(zoneIds: string[]) {
  const encoded: string[] = []
  for (const zoneId of zoneIds) {
    const zone = getTimeZoneDefinition(zoneId)
    if (!zone || encoded.includes(zone.id)) {
      throw new Error('Every shared region must be a unique supported IANA time zone')
    }
    encoded.push(zone.shareCode)
  }
  return encoded.join(',')
}

function decodeZoneIds(value: string) {
  const codes = value.split(',')
  if (!codes.length || codes.length > MAX_SELECTED_TIME_ZONES) return null
  const zoneIds: string[] = []
  for (const code of codes) {
    const legacyId = ZONE_ID_BY_SHARE_CODE.get(code)
    const zone = getTimeZoneDefinition(legacyId ?? code)
    if (!zone || zoneIds.includes(zone.id)) return null
    zoneIds.push(zone.id)
  }
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

  const zoneIds = decodeZoneIds(encodedZoneIds)
  const instant = zoneIds ? decodeInstant(encodedInstant, zoneIds) : null
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
  const params = new URLSearchParams()
  params.set('t', encodeInstant(instant, zoneIds))
  params.set('z', encodedZoneIds)
  // Preserve the v1 comma-separated link shape while still escaping IANA ids.
  url.search = params.toString().replaceAll('%2C', ',')
  return url.toString()
}
