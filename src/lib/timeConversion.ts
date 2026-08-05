import type { Temporal } from '@js-temporal/polyfill'
import { TIME_ZONES } from '../data/timeZones'
import type { ConversionResult, Locale, WallTimeResolution } from '../types'
import { getTemporal } from './temporal'

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const WEEKDAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
const NANOSECONDS_PER_MINUTE = 60_000_000_000
export const EDITABLE_DATE_TIME_GUIDE = 'YYYY-MM-DD HH:mm'

function parseDateTime(date: string, time: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time)

  if (!dateMatch || !timeMatch) {
    throw new RangeError('日期或时间格式不正确')
  }

  return {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
  }
}

function hasSameWallTime(
  zonedDateTime: Temporal.ZonedDateTime,
  fields: ReturnType<typeof parseDateTime>,
) {
  return (
    zonedDateTime.year === fields.year &&
    zonedDateTime.month === fields.month &&
    zonedDateTime.day === fields.day &&
    zonedDateTime.hour === fields.hour &&
    zonedDateTime.minute === fields.minute
  )
}

export function resolveWallTime(
  date: string,
  time: string,
  timeZone: string,
): WallTimeResolution {
  try {
    const Temporal = getTemporal()
    const fields = { ...parseDateTime(date, time), timeZone }
    const earlier = Temporal.ZonedDateTime.from(fields, {
      disambiguation: 'earlier',
    })
    const later = Temporal.ZonedDateTime.from(fields, {
      disambiguation: 'later',
    })
    const earlierMatches = hasSameWallTime(earlier, fields)
    const laterMatches = hasSameWallTime(later, fields)

    if (!earlierMatches && !laterMatches) {
      return { status: 'nonexistent' }
    }

    if (
      earlierMatches &&
      laterMatches &&
      earlier.epochNanoseconds !== later.epochNanoseconds
    ) {
      return {
        status: 'ambiguous',
        earlier: earlier.toInstant(),
        later: later.toInstant(),
      }
    }

    return {
      status: 'valid',
      instant: (earlierMatches ? earlier : later).toInstant(),
    }
  } catch {
    return { status: 'nonexistent' }
  }
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function formatUtcOffset(offsetNanoseconds: number) {
  const minutes = offsetNanoseconds / NANOSECONDS_PER_MINUTE
  if (minutes === 0) return 'UTC'

  const direction = minutes > 0 ? '+' : '−'
  const absoluteMinutes = Math.abs(minutes)
  const hours = Math.floor(absoluteMinutes / 60)
  const remainingMinutes = absoluteMinutes % 60

  return `UTC${direction}${hours}${remainingMinutes ? `:${pad(remainingMinutes)}` : ''}`
}

export function convertInstant(
  instant: Temporal.Instant,
  locale: Locale = 'zh',
): ConversionResult[] {
  return TIME_ZONES.map((zone) => {
    const zoned = instant.toZonedDateTimeISO(zone.id)
    const dateLabel =
      locale === 'zh'
        ? `${pad(zoned.month)}月${pad(zoned.day)}日 ${WEEKDAYS[zoned.dayOfWeek - 1]}`
        : `${MONTHS_EN[zoned.month - 1]} ${pad(zoned.day)} · ${WEEKDAYS_EN[zoned.dayOfWeek - 1]}`
    const timeLabel = `${pad(zoned.hour)}:${pad(zoned.minute)}`

    return {
      ...zone,
      dateLabel,
      timeLabel,
      dateTimeLabel: `${dateLabel} ${timeLabel}`,
      dateTimeValue: `${zoned.year}-${pad(zoned.month)}-${pad(zoned.day)}T${timeLabel}`,
      timeZoneAbbreviation:
        zone.abbreviations[zoned.offset] ?? formatUtcOffset(zoned.offsetNanoseconds),
      utcOffsetLabel: formatUtcOffset(zoned.offsetNanoseconds),
    }
  })
}

export function getNowInstant() {
  const Temporal = getTemporal()
  return Temporal.Now.instant()
}

export function formatEditableDateTimeInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 12)
  let formatted = digits.slice(0, 4)

  if (digits.length >= 4) formatted += '-'
  if (digits.length > 4) formatted += digits.slice(4, 6)
  if (digits.length >= 6) formatted += '-'
  if (digits.length > 6) formatted += digits.slice(6, 8)
  if (digits.length >= 8) formatted += ' '
  if (digits.length > 8) formatted += digits.slice(8, 10)
  if (digits.length >= 10) formatted += ':'
  if (digits.length > 10) formatted += digits.slice(10, 12)

  return formatted
}

export function parseEditableDateTime(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 12) return null

  return {
    date: `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`,
    time: `${digits.slice(8, 10)}:${digits.slice(10, 12)}`,
  }
}

export function makeCopyText(results: ConversionResult[]) {
  const lines = results.map(
    (result) =>
      `${result.timeZoneAbbreviation} | ${result.dateTimeValue.replace('T', ' ')}`,
  )

  return lines.join('\n')
}
