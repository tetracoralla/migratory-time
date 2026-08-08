import type { Temporal } from '@js-temporal/polyfill'
import { TIME_ZONES } from '../data/timeZones'
import type { ConversionResult, Locale } from '../types'
import {
  convertInstant,
  getNowInstant,
  makeCopyText,
  resolveWallTime,
} from './timeConversion'
import { makeShareUrl } from './shareState'

export const PUBLIC_APP_URL =
  'https://tetracoralla.github.io/migratory-time/'

export type TimeDisambiguation = 'reject' | 'earlier' | 'later'

export interface ConvertTimeInput {
  disambiguation?: TimeDisambiguation
  localDateTime: string
  locale?: Locale
  sourceTimeZone: string
  targetTimeZones?: string[]
}

export interface CurrentTimesInput {
  locale?: Locale
  targetTimeZones?: string[]
}

export interface AgentZoneResult {
  abbreviation: string
  dateTime: string
  label: string
  timeZone: string
  utcOffset: string
}

export interface AgentConvertedTime {
  copyText: string
  instant: string
  results: AgentZoneResult[]
  shareUrl: string
}

export interface ConvertedTimeResult extends AgentConvertedTime {
  source: {
    localDateTime: string
    timeZone: string
  }
  status: 'converted'
}

export interface CurrentTimesResult extends AgentConvertedTime {
  status: 'converted'
}

export interface AmbiguousTimeResult {
  candidates: Array<
    AgentConvertedTime & {
      choice: 'earlier' | 'later'
    }
  >
  source: {
    localDateTime: string
    timeZone: string
  }
  status: 'ambiguous'
}

export interface NonexistentTimeResult {
  reason: string
  source: {
    localDateTime: string
    timeZone: string
  }
  status: 'nonexistent'
}

export type ConvertTimeResult =
  | ConvertedTimeResult
  | AmbiguousTimeResult
  | NonexistentTimeResult

const CONFIG_BY_ID = new Map(TIME_ZONES.map((zone) => [zone.id, zone]))
const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/

const EXTRA_AGENT_ALIASES: Partial<Record<string, readonly string[]>> = {
  'Asia/Shanghai': ['Beijing', 'China time', '中国', '中国时间'],
  'America/New_York': [
    'Eastern Time',
    'ET',
    'New York',
    '纽约',
    '美国东部',
  ],
  'America/Los_Angeles': [
    'Pacific Time',
    'PT',
    'Los Angeles',
    '洛杉矶',
    '美国西部',
  ],
  'Europe/London': ['London', 'British time', '伦敦'],
  'Europe/Berlin': [
    'Central European Time',
    'Berlin',
    '欧洲中部',
    '欧洲中部时间',
    '柏林',
  ],
}

function aliasesForZone(zone: (typeof TIME_ZONES)[number]) {
  return [
    zone.id,
    zone.shareCode,
    zone.label,
    zone.labelEn,
    zone.shortLabel,
    zone.shortLabelEn,
    ...(EXTRA_AGENT_ALIASES[zone.id] ?? []),
  ]
}

export const TIME_ZONE_INPUT_VALUES = [
  ...new Set(TIME_ZONES.flatMap(aliasesForZone)),
] as [string, ...string[]]
export const SUPPORTED_TIME_ZONE_COUNT = TIME_ZONES.length

const CONFIG_BY_AGENT_INPUT = new Map<string, (typeof TIME_ZONES)[number]>()
for (const zone of TIME_ZONES) {
  for (const alias of aliasesForZone(zone)) {
    const key = alias.trim().toLocaleLowerCase('en-US')
    const existing = CONFIG_BY_AGENT_INPUT.get(key)
    if (existing && existing.id !== zone.id) {
      throw new Error(`Time-zone alias ${alias} is configured more than once`)
    }
    CONFIG_BY_AGENT_INPUT.set(key, zone)
  }
}

function supportedTimeZonesText() {
  return TIME_ZONES.map((zone) => zone.id).join(', ')
}

function normalizeConfiguredTimeZone(timeZone: string, field: string) {
  const configured = CONFIG_BY_AGENT_INPUT.get(
    timeZone.trim().toLocaleLowerCase('en-US'),
  )
  if (!configured) {
    throw new RangeError(
      `${field} must name a configured Migratory Time region or IANA time zone: ${supportedTimeZonesText()}`,
    )
  }

  return configured.id
}

function normalizeTargetTimeZones(targetTimeZones?: string[]) {
  const requested = targetTimeZones ?? TIME_ZONES.map((zone) => zone.id)

  if (requested.length === 0) {
    throw new RangeError('targetTimeZones must contain at least one time zone')
  }

  const normalized = requested.map((timeZone) =>
    normalizeConfiguredTimeZone(timeZone, 'targetTimeZones'),
  )

  if (new Set(normalized).size !== normalized.length) {
    throw new RangeError('targetTimeZones must not contain duplicates')
  }

  return normalized
}

function parseLocalDateTime(localDateTime: string) {
  const match = LOCAL_DATE_TIME_PATTERN.exec(localDateTime)
  if (!match) {
    throw new RangeError('localDateTime must use the exact format YYYY-MM-DD HH:mm')
  }

  return {
    date: `${match[1]}-${match[2]}-${match[3]}`,
    time: `${match[4]}:${match[5]}`,
  }
}

function selectResults(
  allResults: ConversionResult[],
  targetTimeZones: string[],
  locale: Locale,
) {
  const resultsById = new Map(allResults.map((result) => [result.id, result]))

  return targetTimeZones.map((timeZone) => {
    const result = resultsById.get(timeZone)
    if (!result) {
      throw new Error(`Missing conversion result for configured time zone ${timeZone}`)
    }

    return {
      abbreviation: result.timeZoneAbbreviation,
      dateTime: result.dateTimeValue.replace('T', ' '),
      label: locale === 'zh' ? result.label : result.labelEn,
      timeZone: result.id,
      utcOffset: result.utcOffsetLabel,
    }
  })
}

function makeConvertedTime(
  instant: Temporal.Instant,
  targetTimeZones: string[],
  locale: Locale,
): AgentConvertedTime {
  const allResults = convertInstant(instant, locale)
  const resultsById = new Map(allResults.map((result) => [result.id, result]))
  const copyResults = targetTimeZones.map((timeZone) => {
    const result = resultsById.get(timeZone)
    if (!result) throw new Error(`Missing copy result for ${timeZone}`)
    return result
  })

  return {
    copyText: makeCopyText(copyResults),
    instant: instant.toString(),
    results: selectResults(allResults, targetTimeZones, locale),
    shareUrl: makeShareUrl(PUBLIC_APP_URL, instant, targetTimeZones),
  }
}

export function convertTime(input: ConvertTimeInput): ConvertTimeResult {
  const locale = input.locale ?? 'en'
  const disambiguation = input.disambiguation ?? 'reject'
  const targetTimeZones = normalizeTargetTimeZones(input.targetTimeZones)
  const parsed = parseLocalDateTime(input.localDateTime)
  const sourceTimeZone = normalizeConfiguredTimeZone(
    input.sourceTimeZone,
    'sourceTimeZone',
  )

  const source = {
    localDateTime: input.localDateTime,
    timeZone: sourceTimeZone,
  }
  const resolution = resolveWallTime(
    parsed.date,
    parsed.time,
    sourceTimeZone,
  )

  if (resolution.status === 'nonexistent') {
    return {
      reason:
        'This local date and time does not exist, either because the calendar value is invalid or because a daylight-saving transition skipped it.',
      source,
      status: 'nonexistent',
    }
  }

  if (resolution.status === 'ambiguous') {
    if (disambiguation === 'reject') {
      return {
        candidates: [
          {
            choice: 'earlier',
            ...makeConvertedTime(resolution.earlier, targetTimeZones, locale),
          },
          {
            choice: 'later',
            ...makeConvertedTime(resolution.later, targetTimeZones, locale),
          },
        ],
        source,
        status: 'ambiguous',
      }
    }

    return {
      ...makeConvertedTime(
        disambiguation === 'earlier'
          ? resolution.earlier
          : resolution.later,
        targetTimeZones,
        locale,
      ),
      source,
      status: 'converted',
    }
  }

  return {
    ...makeConvertedTime(resolution.instant, targetTimeZones, locale),
    source,
    status: 'converted',
  }
}

export function currentTimes(
  input: CurrentTimesInput = {},
  now: Temporal.Instant = getNowInstant(),
): CurrentTimesResult {
  const locale = input.locale ?? 'en'
  const targetTimeZones = normalizeTargetTimeZones(input.targetTimeZones)

  return {
    ...makeConvertedTime(now, targetTimeZones, locale),
    status: 'converted',
  }
}

export function listTimeZones() {
  return {
    timeZones: TIME_ZONES.map((zone) => ({
      abbreviations: [...new Set(Object.values(zone.abbreviations))],
      label: zone.label,
      labelEn: zone.labelEn,
      shareCode: zone.shareCode,
      timeZone: zone.id,
      aliases: aliasesForZone(zone).filter((alias) => alias !== zone.id),
    })),
  }
}
