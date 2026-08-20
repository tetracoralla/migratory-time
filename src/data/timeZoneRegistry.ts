import { rawTimeZones } from '@vvo/tzdb'
import type { Locale, TimeZoneDefinition } from '../types'
import { DEFAULT_TIME_ZONE_IDS, TIME_ZONES } from './timeZones'

export const MAX_SELECTED_TIME_ZONES = 20
export const DEFAULT_TIME_ZONE_SEARCH_LIMIT = 8
export const MAX_TIME_ZONE_SEARCH_LIMIT = 10

const FIXED_LABEL_DATE = new Date('2026-01-15T12:00:00Z')
const LEGACY_BY_ID = new Map(TIME_ZONES.map((zone) => [zone.id, zone]))
const EMPTY_SEARCH_TIME_ZONE_IDS = [
  ...DEFAULT_TIME_ZONE_IDS,
  'UTC',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Dubai',
] as const

const LOCALIZED_ALIASES: Record<string, readonly string[]> = {
  'Africa/Cairo': ['开罗', '埃及时间'],
  'Africa/Johannesburg': ['约翰内斯堡', '南非时间'],
  'America/Anchorage': ['安克雷奇', '阿拉斯加时间'],
  'America/Argentina/Buenos_Aires': ['布宜诺斯艾利斯', '阿根廷时间'],
  'America/Chicago': ['芝加哥', '美国中部时间'],
  'America/Denver': ['丹佛', '美国山区时间'],
  'America/Mexico_City': ['墨西哥城'],
  'America/Phoenix': ['凤凰城', '亚利桑那时间'],
  'America/Sao_Paulo': ['圣保罗', '巴西利亚时间'],
  'America/Toronto': ['多伦多', '加拿大东部时间'],
  'Asia/Dubai': ['迪拜', '阿联酋时间'],
  'Asia/Hong_Kong': ['香港', '香港时间'],
  'Asia/Jakarta': ['雅加达', '印度尼西亚西部时间'],
  'Asia/Jerusalem': ['耶路撒冷', '以色列时间'],
  'Asia/Kathmandu': ['加德满都', '尼泊尔时间'],
  'Asia/Kolkata': ['加尔各答', '印度时间', '孟买', '新德里'],
  'Asia/Manila': ['马尼拉', '菲律宾时间'],
  'Asia/Seoul': ['首尔', '韩国时间'],
  'Asia/Singapore': ['新加坡', '新加坡时间'],
  'Asia/Taipei': ['台北', '台湾时间'],
  'Asia/Tokyo': ['东京', '日本时间'],
  'Australia/Perth': ['珀斯', '澳大利亚西部时间'],
  'Australia/Sydney': ['悉尼', '澳大利亚东部时间'],
  'Europe/Amsterdam': ['阿姆斯特丹', '荷兰时间'],
  'Europe/Athens': ['雅典', '希腊时间'],
  'Europe/Istanbul': ['伊斯坦布尔', '土耳其时间'],
  'Europe/Madrid': ['马德里', '西班牙时间'],
  'Europe/Moscow': ['莫斯科', '莫斯科时间'],
  'Europe/Paris': ['巴黎', '法国时间'],
  'Europe/Rome': ['罗马', '意大利时间'],
  'Europe/Zurich': ['苏黎世', '瑞士时间'],
  'Pacific/Auckland': ['奥克兰', '新西兰时间'],
  'Pacific/Chatham': [
    'Chatham Island',
    'Chatham Islands',
    '查塔姆岛',
    '查塔姆群岛',
  ],
  'Pacific/Honolulu': ['檀香山', '夏威夷时间'],
}

interface RegistryEntry {
  aliases: string[]
  alternativeName: string
  countryCode: string
  countryName: string
  id: string
  mainCities: string[]
}

export interface TimeZoneCandidate {
  countryCode: string
  countryName: string
  id: string
  label: string
  labelEn: string
  mainCities: string[]
}

export type TimeZoneResolution =
  | { status: 'resolved'; timeZone: TimeZoneCandidate }
  | { status: 'ambiguous'; candidates: TimeZoneCandidate[]; input: string }
  | { status: 'unknown'; input: string }

// IANA's Etc/GMT±N zones use an inverted sign convention: Etc/GMT+N is UTC−N
// and Etc/GMT-N is UTC+N (tzdata "etcetera" file). @vvo/tzdb omits them, so
// they are synthesized here to keep the registry complete for canonical IANA ids.
const ETC_GMT_ZONE_HOURS = [
  ...Array.from({ length: 12 }, (_, index) => index + 1),
  ...Array.from({ length: 14 }, (_, index) => -(index + 1)),
]
const ETC_GMT_ZONES: RegistryEntry[] = ETC_GMT_ZONE_HOURS.map(
  (hours): RegistryEntry => {
    const trueOffsetSign = hours > 0 ? '-' : '+'
    const trueOffsetUnicodeSign = hours > 0 ? '−' : '+'
    const offsetHours = Math.abs(hours)
    return {
      aliases: [
        `UTC${trueOffsetSign}${offsetHours}`,
        `UTC${trueOffsetUnicodeSign}${offsetHours}`,
        `GMT${trueOffsetSign}${offsetHours}`,
        `GMT${trueOffsetUnicodeSign}${offsetHours}`,
      ],
      alternativeName: `UTC${trueOffsetUnicodeSign}${offsetHours}`,
      countryCode: '001',
      countryName: 'World',
      id: `Etc/GMT${hours > 0 ? '+' : '-'}${offsetHours}`,
      mainCities: [],
    }
  },
)

const ENTRIES: RegistryEntry[] = [
  {
    aliases: [
      'UTC',
      'Etc/UTC',
      'Etc/GMT',
      'Etc/GMT+0',
      'Etc/GMT0',
      'Etc/GMT-0',
      'Etc/Greenwich',
      'Etc/UCT',
      'Etc/Zulu',
      'GMT',
      'Universal',
      'Zulu',
    ],
    alternativeName: 'Coordinated Universal Time',
    countryCode: '001',
    countryName: 'World',
    id: 'UTC',
    mainCities: [],
  },
  ...ETC_GMT_ZONES,
  ...rawTimeZones.map((zone) => ({
    aliases: [...new Set([zone.name, ...zone.group])],
    alternativeName: zone.alternativeName,
    countryCode: zone.countryCode,
    countryName: zone.countryName,
    id: zone.name,
    mainCities: [...zone.mainCities],
  })),
]
const ENTRY_BY_ID = new Map(ENTRIES.map((entry) => [entry.id, entry]))
const CANONICAL_ID_BY_ALIAS = new Map<string, string>()
for (const entry of ENTRIES) {
  for (const alias of entry.aliases) CANONICAL_ID_BY_ALIAS.set(alias, entry.id)
}

const directAliases = new Map<string, string>()

export function normalizeTimeZoneSearchText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2212\u2013\u2014]/g, '-')
    .replace(/-(?=\d)/g, '\uE000')
    .replace(/[_/.-]+/g, ' ')
    .replaceAll('\uE000', '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US')
}

function addDirectAlias(alias: string, id: string) {
  const key = normalizeTimeZoneSearchText(alias)
  const existing = directAliases.get(key)
  if (existing && existing !== id) {
    throw new Error(`Direct time-zone alias ${alias} is configured more than once`)
  }
  directAliases.set(key, id)
}

for (const zone of TIME_ZONES) {
  for (const alias of [
    zone.id,
    zone.shareCode,
    zone.label,
    zone.labelEn,
    zone.shortLabel,
    zone.shortLabelEn,
  ]) {
    if (alias) addDirectAlias(alias, zone.id)
  }
}

const LEGACY_AGENT_ALIASES: Record<string, readonly string[]> = {
  'Asia/Shanghai': ['Beijing', 'China time', '中国', '中国时间'],
  'America/New_York': ['Eastern Time', 'ET', 'New York', '纽约', '美国东部'],
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

for (const [id, aliases] of Object.entries(LOCALIZED_ALIASES)) {
  for (const alias of aliases) addDirectAlias(alias, id)
}
for (const [id, aliases] of Object.entries(LEGACY_AGENT_ALIASES)) {
  for (const alias of aliases) addDirectAlias(alias, id)
}

const genericNameCache = new Map<string, string>()
const countryNameCache = new Map<string, string>()

function localeTag(locale: Locale) {
  return locale === 'zh' ? 'zh-CN' : 'en-US'
}

function localizedCountryName(entry: RegistryEntry, locale: Locale) {
  if (entry.countryCode === '001') return locale === 'zh' ? '世界' : 'World'
  const key = `${locale}:${entry.countryCode}`
  const cached = countryNameCache.get(key)
  if (cached) return cached
  const name =
    new Intl.DisplayNames([localeTag(locale)], { type: 'region' }).of(
      entry.countryCode,
    ) ?? entry.countryName
  countryNameCache.set(key, name)
  return name
}

function genericTimeZoneName(entry: RegistryEntry, locale: Locale) {
  if (entry.id === 'UTC') return locale === 'zh' ? '协调世界时' : 'UTC'
  const key = `${locale}:${entry.id}`
  const cached = genericNameCache.get(key)
  if (cached) return cached
  const name =
    new Intl.DateTimeFormat(localeTag(locale), {
      timeZone: entry.id,
      timeZoneName: 'longGeneric',
    })
      .formatToParts(FIXED_LABEL_DATE)
      .find((part) => part.type === 'timeZoneName')?.value ??
    (locale === 'zh' ? localizedCountryName(entry, locale) : entry.alternativeName)
  genericNameCache.set(key, name)
  return name
}

function candidateForEntry(
  entry: RegistryEntry,
  locale: Locale = 'zh',
): TimeZoneCandidate {
  const legacy = LEGACY_BY_ID.get(entry.id)
  return {
    countryCode: entry.countryCode,
    countryName: localizedCountryName(entry, locale),
    id: entry.id,
    label: legacy?.label ?? genericTimeZoneName(entry, 'zh'),
    labelEn: legacy?.labelEn ?? genericTimeZoneName(entry, 'en'),
    mainCities: [...entry.mainCities],
  }
}

function shortLocationLabel(
  entry: RegistryEntry,
  candidate: TimeZoneCandidate,
  locale: Locale,
) {
  if (entry.id === 'UTC') {
    return locale === 'zh' ? candidate.label : candidate.labelEn
  }

  if (entry.id.startsWith('Etc/GMT')) {
    // Short labels state the true offset; the IANA id fragment carries the
    // inverted sign and would read as the opposite offset to humans.
    const hours = Number(entry.id.slice('Etc/GMT'.length))
    return `UTC${hours > 0 ? '−' : '+'}${Math.abs(hours)}`
  }

  if (locale === 'zh') {
    const localizedCity = LOCALIZED_ALIASES[entry.id]?.find((alias) =>
      /\p{Script=Han}/u.test(alias),
    )
    if (localizedCity) return localizedCity
  }

  return (
    entry.mainCities[0] ??
    entry.id.split('/').at(-1)?.replaceAll('_', ' ') ??
    (locale === 'zh' ? candidate.label : candidate.labelEn)
  )
}

export function getTimeZoneDefinition(
  idOrAlias: string,
  locale: Locale = 'zh',
): TimeZoneDefinition | null {
  const canonicalId =
    (ENTRY_BY_ID.has(idOrAlias) ? idOrAlias : undefined) ??
    CANONICAL_ID_BY_ALIAS.get(idOrAlias) ??
    directAliases.get(normalizeTimeZoneSearchText(idOrAlias))
  if (!canonicalId) return null
  const entry = ENTRY_BY_ID.get(canonicalId)
  if (!entry) return null
  const candidate = candidateForEntry(entry, locale)
  const legacy = LEGACY_BY_ID.get(canonicalId)
  return {
    abbreviations: legacy?.abbreviations,
    countryCode: entry.countryCode,
    countryName: candidate.countryName,
    id: canonicalId,
    label: candidate.label,
    labelEn: candidate.labelEn,
    mainCities: candidate.mainCities,
    shareCode: legacy?.shareCode ?? canonicalId,
    shortLabel:
      legacy?.shortLabel ?? shortLocationLabel(entry, candidate, 'zh'),
    shortLabelEn:
      legacy?.shortLabelEn ?? shortLocationLabel(entry, candidate, 'en'),
  }
}

export function getAllTimeZoneIds() {
  return ENTRIES.map((entry) => entry.id)
}

export function getDefaultTimeZoneIds() {
  return [...DEFAULT_TIME_ZONE_IDS]
}

function searchTerms(entry: RegistryEntry, locale: Locale) {
  const legacy = LEGACY_BY_ID.get(entry.id)
  return [
    entry.id,
    ...entry.aliases,
    entry.alternativeName,
    entry.countryName,
    localizedCountryName(entry, locale),
    genericTimeZoneName(entry, locale),
    ...entry.mainCities,
    ...(LOCALIZED_ALIASES[entry.id] ?? []),
    ...(LEGACY_AGENT_ALIASES[entry.id] ?? []),
    legacy?.label,
    legacy?.labelEn,
    legacy?.shortLabel,
    legacy?.shortLabelEn,
  ].filter((value): value is string => Boolean(value))
}

// Normalizing every term of every entry on each keystroke or resolution is the
// registry's one hot path, so the normalized term list is computed once per
// entry and locale.
const normalizedTermsCache = new Map<string, readonly string[]>()

function normalizedSearchTerms(entry: RegistryEntry, locale: Locale) {
  const key = `${locale}:${entry.id}`
  const cached = normalizedTermsCache.get(key)
  if (cached) return cached
  const terms = searchTerms(entry, locale)
    .map((term) => normalizeTimeZoneSearchText(term))
    .filter(Boolean)
  normalizedTermsCache.set(key, terms)
  return terms
}

const exactMatchIndexCache = new Map<Locale, Map<string, RegistryEntry[]>>()

function exactMatchIndex(locale: Locale) {
  const cached = exactMatchIndexCache.get(locale)
  if (cached) return cached
  const index = new Map<string, RegistryEntry[]>()
  for (const entry of ENTRIES) {
    for (const term of normalizedSearchTerms(entry, locale)) {
      const matches = index.get(term)
      if (matches) {
        if (matches.at(-1) !== entry) matches.push(entry)
      } else {
        index.set(term, [entry])
      }
    }
  }
  exactMatchIndexCache.set(locale, index)
  return index
}

function scoreEntry(entry: RegistryEntry, normalizedQuery: string, locale: Locale) {
  let best = Number.POSITIVE_INFINITY
  for (const normalizedTerm of normalizedSearchTerms(entry, locale)) {
    if (normalizedTerm === normalizedQuery) best = Math.min(best, 0)
    else if (normalizedTerm.startsWith(normalizedQuery)) best = Math.min(best, 1)
    else if (normalizedTerm.split(' ').some((word) => word.startsWith(normalizedQuery))) {
      best = Math.min(best, 2)
    } else if (normalizedTerm.includes(normalizedQuery)) best = Math.min(best, 3)
  }
  return best
}

export function searchTimeZoneDefinitions(
  query: string,
  locale: Locale = 'en',
  limit = DEFAULT_TIME_ZONE_SEARCH_LIMIT,
) {
  const normalizedQuery = normalizeTimeZoneSearchText(query)
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), MAX_TIME_ZONE_SEARCH_LIMIT)
  if (!normalizedQuery) {
    return EMPTY_SEARCH_TIME_ZONE_IDS.slice(0, boundedLimit).map((id) => {
      const entry = ENTRY_BY_ID.get(id)
      if (!entry) throw new Error(`Missing empty-search time zone ${id}`)
      return candidateForEntry(entry, locale)
    })
  }
  const ranked = ENTRIES.map((entry, index) => ({
    entry,
    index,
    score: scoreEntry(entry, normalizedQuery, locale),
  }))
    .filter((item) => Number.isFinite(item.score))
    .sort((left, right) => {
      const leftDefault = DEFAULT_TIME_ZONE_IDS.indexOf(left.entry.id)
      const rightDefault = DEFAULT_TIME_ZONE_IDS.indexOf(right.entry.id)
      return (
        left.score - right.score ||
        (leftDefault === -1 ? 99 : leftDefault) -
          (rightDefault === -1 ? 99 : rightDefault) ||
        left.index - right.index
      )
    })
  return ranked
    .slice(0, boundedLimit)
    .map(({ entry }) => candidateForEntry(entry, locale))
}

export function resolveTimeZoneInput(
  input: string,
  locale: Locale = 'en',
): TimeZoneResolution {
  const trimmed = input.trim()
  const normalized = normalizeTimeZoneSearchText(trimmed)
  if (!normalized) return { status: 'unknown', input }

  const directId = directAliases.get(normalized)
  if (directId) {
    const definition = getTimeZoneDefinition(directId, locale)
    if (definition) {
      const entry = ENTRY_BY_ID.get(definition.id)
      if (entry) {
        return { status: 'resolved', timeZone: candidateForEntry(entry, locale) }
      }
    }
  }

  const exactCanonical = ENTRY_BY_ID.has(trimmed)
    ? trimmed
    : CANONICAL_ID_BY_ALIAS.get(trimmed)
  if (exactCanonical) {
    const entry = ENTRY_BY_ID.get(exactCanonical)
    if (entry) {
      return { status: 'resolved', timeZone: candidateForEntry(entry, locale) }
    }
  }

  const exactMatches = exactMatchIndex(locale).get(normalized) ?? []
  if (exactMatches.length === 1) {
    return {
      status: 'resolved',
      timeZone: candidateForEntry(exactMatches[0], locale),
    }
  }
  if (exactMatches.length > 1) {
    return {
      status: 'ambiguous',
      candidates: exactMatches
        .slice(0, MAX_TIME_ZONE_SEARCH_LIMIT)
        .map((entry) => candidateForEntry(entry, locale)),
      input,
    }
  }
  return { status: 'unknown', input }
}
