import type { Temporal } from '@js-temporal/polyfill'
import {
  getAllTimeZoneIds,
  getDefaultTimeZoneIds,
  getTimeZoneDefinition,
  MAX_SELECTED_TIME_ZONES,
  MAX_TIME_ZONE_SEARCH_LIMIT,
  resolveTimeZoneInput,
  searchTimeZoneDefinitions,
  type TimeZoneCandidate,
} from '../data/timeZoneRegistry'
import type { ConversionResult, Locale } from '../types'
import {
  convertInstant,
  getNowInstant,
  hasMinutePrecisionAcrossTimeZones,
  makeCopyText,
  MIN_SUPPORTED_YEAR,
  resolveWallTime,
} from './timeConversion'
import { makeShareUrl } from './shareState'

export const PUBLIC_APP_URL =
  'https://tetracoralla.github.io/migratory-time/'
export const SUPPORTED_TIME_ZONE_COUNT = getAllTimeZoneIds().length
export const MAX_LIST_TIME_ZONES_LIMIT = 50

export type TimeDisambiguation = 'reject' | 'earlier' | 'later'
export type AgentErrorCode =
  | 'AMBIGUOUS_TIME_ZONE'
  | 'DUPLICATE_TIME_ZONE'
  | 'EMPTY_QUERY'
  | 'EMPTY_TARGETS'
  | 'INTERNAL_ERROR'
  | 'INVALID_CURSOR'
  | 'INVALID_FORMAT'
  | 'TOO_MANY_TARGETS'
  | 'UNKNOWN_TIME_ZONE'
  | 'UNSUPPORTED_PRECISION'
  | 'UNSUPPORTED_YEAR'

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

export interface SearchTimeZonesInput {
  limit?: number
  locale?: Locale
  query: string
}

export interface ListTimeZonesInput {
  cursor?: string
  limit?: number
  locale?: Locale
}

export interface AgentError {
  candidates?: TimeZoneCandidate[]
  code: AgentErrorCode
  field?: string
  input?: string
  message: string
  retryable: boolean
}

export interface AgentErrorResult {
  error: AgentError
  status: 'error'
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

export interface AgentSourceOccurrence {
  abbreviation: string
  timeZone: string
  utcOffset: string
}

export interface ConvertedTimeResult extends AgentConvertedTime {
  source: { localDateTime: string; timeZone: string }
  status: 'converted'
}

export interface CurrentTimesResult extends AgentConvertedTime {
  status: 'converted'
}

export interface AmbiguousTimeResult {
  candidates: Array<
    AgentConvertedTime & {
      choice: 'earlier' | 'later'
      sourceOccurrence: AgentSourceOccurrence
    }
  >
  source: { localDateTime: string; timeZone: string }
  status: 'ambiguous'
}

export interface NonexistentTimeResult {
  reason: string
  source: { localDateTime: string; timeZone: string }
  status: 'nonexistent'
}

export type ConvertTimeResult =
  | ConvertedTimeResult
  | AmbiguousTimeResult
  | NonexistentTimeResult
  | AgentErrorResult
export type CurrentTimesResultUnion = CurrentTimesResult | AgentErrorResult

export interface TimeZoneSearchResult {
  items: Array<
    TimeZoneCandidate & { abbreviation: string; utcOffset: string }
  >
  query: string
  status: 'found'
}

export interface TimeZoneListResult {
  items: TimeZoneCandidate[]
  nextCursor: string | null
  status: 'listed'
  total: number
}

export type SearchTimeZonesResult = TimeZoneSearchResult | AgentErrorResult
export type ListTimeZonesResult = TimeZoneListResult | AgentErrorResult

class AgentInputError extends Error {
  readonly detail: AgentError

  constructor(detail: Omit<AgentError, 'retryable'> & { retryable?: boolean }) {
    super(detail.message)
    this.detail = { ...detail, retryable: detail.retryable ?? true }
  }
}

const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/

function errorResult(error: unknown): AgentErrorResult {
  if (error instanceof AgentInputError) {
    return { error: error.detail, status: 'error' }
  }
  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unexpected internal error',
      retryable: false,
    },
    status: 'error',
  }
}

function normalizeConfiguredTimeZone(
  timeZone: string,
  field: string,
  locale: Locale,
) {
  const resolution = resolveTimeZoneInput(timeZone, locale)
  if (resolution.status === 'resolved') return resolution.timeZone.id
  if (resolution.status === 'ambiguous') {
    throw new AgentInputError({
      candidates: resolution.candidates,
      code: 'AMBIGUOUS_TIME_ZONE',
      field,
      input: timeZone,
      message: `${field} matches more than one time zone; use one candidate IANA id.`,
    })
  }
  throw new AgentInputError({
    code: 'UNKNOWN_TIME_ZONE',
    field,
    input: timeZone,
    message: `${field} is not a known IANA time zone or unambiguous region name.`,
  })
}

function normalizeTargetTimeZones(
  targetTimeZones: string[] | undefined,
  locale: Locale,
) {
  const requested = targetTimeZones ?? getDefaultTimeZoneIds()
  if (requested.length === 0) {
    throw new AgentInputError({
      code: 'EMPTY_TARGETS',
      field: 'targetTimeZones',
      message: 'targetTimeZones must contain at least one time zone.',
    })
  }
  if (requested.length > MAX_SELECTED_TIME_ZONES) {
    throw new AgentInputError({
      code: 'TOO_MANY_TARGETS',
      field: 'targetTimeZones',
      message: `targetTimeZones supports at most ${MAX_SELECTED_TIME_ZONES} items per call.`,
    })
  }
  const normalized = requested.map((timeZone) =>
    normalizeConfiguredTimeZone(timeZone, 'targetTimeZones', locale),
  )
  if (new Set(normalized).size !== normalized.length) {
    throw new AgentInputError({
      code: 'DUPLICATE_TIME_ZONE',
      field: 'targetTimeZones',
      message: 'targetTimeZones must not contain duplicate canonical time zones.',
    })
  }
  return normalized
}

function parseLocalDateTime(localDateTime: string) {
  const match = LOCAL_DATE_TIME_PATTERN.exec(localDateTime)
  if (!match) {
    throw new AgentInputError({
      code: 'INVALID_FORMAT',
      field: 'localDateTime',
      input: localDateTime,
      message: 'localDateTime must use the exact format YYYY-MM-DD HH:mm.',
    })
  }
  if (Number(match[1]) < MIN_SUPPORTED_YEAR) {
    throw new AgentInputError({
      code: 'UNSUPPORTED_YEAR',
      field: 'localDateTime',
      input: localDateTime,
      message: `localDateTime must be in year ${MIN_SUPPORTED_YEAR} or later.`,
    })
  }
  return {
    date: `${match[1]}-${match[2]}-${match[3]}`,
    time: `${match[4]}:${match[5]}`,
  }
}

function selectResults(allResults: ConversionResult[], locale: Locale) {
  return allResults.map((result) => ({
    abbreviation: result.timeZoneAbbreviation,
    dateTime: result.dateTimeValue.replace('T', ' '),
    label: locale === 'zh' ? result.label : result.labelEn,
    timeZone: result.id,
    utcOffset: result.utcOffsetLabel,
  }))
}

function assertMinutePrecision(instant: Temporal.Instant, zoneIds: string[]) {
  if (!hasMinutePrecisionAcrossTimeZones(instant, zoneIds)) {
    throw new AgentInputError({
      code: 'UNSUPPORTED_PRECISION',
      message:
        'At this historical instant, at least one requested time zone has a sub-minute UTC offset. Migratory Time does not round or guess that value.',
      retryable: false,
    })
  }
}

function makeConvertedTime(
  instant: Temporal.Instant,
  targetTimeZones: string[],
  locale: Locale,
): AgentConvertedTime {
  assertMinutePrecision(instant, targetTimeZones)
  const results = convertInstant(instant, locale, targetTimeZones)
  return {
    copyText: makeCopyText(results),
    instant: instant.toString(),
    results: selectResults(results, locale),
    shareUrl: makeShareUrl(PUBLIC_APP_URL, instant, targetTimeZones),
  }
}

function makeSourceOccurrence(
  instant: Temporal.Instant,
  sourceTimeZone: string,
  locale: Locale,
): AgentSourceOccurrence {
  const sourceResult = convertInstant(instant, locale, [sourceTimeZone])[0]
  return {
    abbreviation: sourceResult.timeZoneAbbreviation,
    timeZone: sourceResult.id,
    utcOffset: sourceResult.utcOffsetLabel,
  }
}

function convertTimeUnsafe(input: ConvertTimeInput): Exclude<ConvertTimeResult, AgentErrorResult> {
  const locale = input.locale ?? 'en'
  const disambiguation = input.disambiguation ?? 'reject'
  const targetTimeZones = normalizeTargetTimeZones(input.targetTimeZones, locale)
  const parsed = parseLocalDateTime(input.localDateTime)
  const sourceTimeZone = normalizeConfiguredTimeZone(
    input.sourceTimeZone,
    'sourceTimeZone',
    locale,
  )
  const source = { localDateTime: input.localDateTime, timeZone: sourceTimeZone }
  const resolution = resolveWallTime(parsed.date, parsed.time, sourceTimeZone)

  if (resolution.status === 'nonexistent') {
    return {
      reason:
        'This local date and time does not exist, either because the calendar value is invalid or because a daylight-saving transition skipped it.',
      source,
      status: 'nonexistent',
    }
  }
  if (resolution.status === 'unsupported') {
    throw new AgentInputError({
      code: 'UNSUPPORTED_YEAR',
      field: 'localDateTime',
      input: input.localDateTime,
      message: `localDateTime must be in year ${MIN_SUPPORTED_YEAR} or later.`,
    })
  }

  const precisionZones = [...new Set([sourceTimeZone, ...targetTimeZones])]
  if (resolution.status === 'ambiguous') {
    assertMinutePrecision(resolution.earlier, precisionZones)
    assertMinutePrecision(resolution.later, precisionZones)
    if (disambiguation === 'reject') {
      return {
        candidates: [
          {
            choice: 'earlier',
            ...makeConvertedTime(resolution.earlier, targetTimeZones, locale),
            sourceOccurrence: makeSourceOccurrence(
              resolution.earlier,
              sourceTimeZone,
              locale,
            ),
          },
          {
            choice: 'later',
            ...makeConvertedTime(resolution.later, targetTimeZones, locale),
            sourceOccurrence: makeSourceOccurrence(
              resolution.later,
              sourceTimeZone,
              locale,
            ),
          },
        ],
        source,
        status: 'ambiguous',
      }
    }
    return {
      ...makeConvertedTime(
        disambiguation === 'earlier' ? resolution.earlier : resolution.later,
        targetTimeZones,
        locale,
      ),
      source,
      status: 'converted',
    }
  }

  assertMinutePrecision(resolution.instant, precisionZones)
  return {
    ...makeConvertedTime(resolution.instant, targetTimeZones, locale),
    source,
    status: 'converted',
  }
}

export function convertTime(input: ConvertTimeInput): ConvertTimeResult {
  try {
    return convertTimeUnsafe(input)
  } catch (error) {
    return errorResult(error)
  }
}

export function currentTimes(
  input: CurrentTimesInput = {},
  now: Temporal.Instant = getNowInstant(),
): CurrentTimesResultUnion {
  try {
    const locale = input.locale ?? 'en'
    const targetTimeZones = normalizeTargetTimeZones(input.targetTimeZones, locale)
    return {
      ...makeConvertedTime(now, targetTimeZones, locale),
      status: 'converted',
    }
  } catch (error) {
    return errorResult(error)
  }
}

export function searchTimeZones(
  input: SearchTimeZonesInput,
  now: Temporal.Instant = getNowInstant(),
): SearchTimeZonesResult {
  try {
    const query = input.query.trim()
    if (!query) {
      throw new AgentInputError({
        code: 'EMPTY_QUERY',
        field: 'query',
        message: 'query must contain a city, country, region, or IANA time-zone id.',
      })
    }
    const locale = input.locale ?? 'en'
    const limit = Math.min(
      Math.max(Math.trunc(input.limit ?? MAX_TIME_ZONE_SEARCH_LIMIT), 1),
      MAX_TIME_ZONE_SEARCH_LIMIT,
    )
    const candidates = searchTimeZoneDefinitions(query, locale, limit)
    const conversions = convertInstant(
      now,
      locale,
      candidates.map((candidate) => candidate.id),
    )
    const byId = new Map(conversions.map((result) => [result.id, result]))
    return {
      items: candidates.map((candidate) => {
        const conversion = byId.get(candidate.id)
        if (!conversion) throw new Error(`Missing search preview for ${candidate.id}`)
        return {
          ...candidate,
          abbreviation: conversion.timeZoneAbbreviation,
          utcOffset: conversion.utcOffsetLabel,
        }
      }),
      query,
      status: 'found',
    }
  } catch (error) {
    return errorResult(error)
  }
}

export function listTimeZones(input: ListTimeZonesInput = {}): ListTimeZonesResult {
  try {
    const ids = getAllTimeZoneIds()
    const limit = Math.min(
      Math.max(Math.trunc(input.limit ?? MAX_LIST_TIME_ZONES_LIMIT), 1),
      MAX_LIST_TIME_ZONES_LIMIT,
    )
    if (input.cursor !== undefined && !/^\d+$/.test(input.cursor)) {
      throw new AgentInputError({
        code: 'INVALID_CURSOR',
        field: 'cursor',
        input: input.cursor,
        message: 'cursor must be a valid cursor returned by list_time_zones.',
      })
    }
    const start = input.cursor === undefined ? 0 : Number(input.cursor)
    if (!Number.isSafeInteger(start) || start < 0 || start > ids.length) {
      throw new AgentInputError({
        code: 'INVALID_CURSOR',
        field: 'cursor',
        input: input.cursor,
        message: 'cursor must be a valid cursor returned by list_time_zones.',
      })
    }
    const locale = input.locale ?? 'en'
    const allItems = ids.map((id) => {
      const zone = getTimeZoneDefinition(id, locale)
      if (!zone) throw new Error(`Missing registry entry for ${id}`)
      return {
        countryCode: zone.countryCode ?? '',
        countryName: zone.countryName ?? '',
        id: zone.id,
        label: zone.label,
        labelEn: zone.labelEn,
        mainCities: zone.mainCities ?? [],
      }
    })
    // Pages are ordered by IANA id, not localized labels, so a cursor stays
    // valid even when the requested locale changes between pages.
    allItems.sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    )
    const end = Math.min(start + limit, allItems.length)
    const items = allItems.slice(start, end)
    return {
      items,
      nextCursor: end < allItems.length ? String(end) : null,
      status: 'listed',
      total: allItems.length,
    }
  } catch (error) {
    return errorResult(error)
  }
}
