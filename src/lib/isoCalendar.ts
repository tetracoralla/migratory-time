import type { Temporal } from '@js-temporal/polyfill'
import { MIN_SUPPORTED_YEAR } from './timeConversion'
import { getTemporal } from './temporal'

export type IsoLocalMinuteSeparator = ' ' | 'T'

export type IsoLocalMinuteParseResult =
  | {
      date: string
      dateTime: Temporal.PlainDateTime
      status: 'valid'
      time: string
    }
  | {
      status: 'invalid'
    }
  | {
      status: 'unsupported_year'
    }

export type IsoDateParseResult =
  | {
      date: Temporal.PlainDate
      status: 'valid'
    }
  | {
      status: 'invalid'
    }
  | {
      status: 'unsupported_year'
    }

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function formatIsoDate(date: Temporal.PlainDate) {
  return `${String(date.year).padStart(4, '0')}-${pad(date.month)}-${pad(date.day)}`
}

export function formatIsoLocalMinute(dateTime: Temporal.PlainDateTime) {
  return `${formatIsoDate(dateTime.toPlainDate())}T${pad(dateTime.hour)}:${pad(dateTime.minute)}`
}

export function parseIsoDate(value: string): IsoDateParseResult {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return { status: 'invalid' }
  if (Number(match[1]) < MIN_SUPPORTED_YEAR) {
    return { status: 'unsupported_year' }
  }
  try {
    return { date: getTemporal().PlainDate.from(value), status: 'valid' }
  } catch {
    return { status: 'invalid' }
  }
}

export function parseIsoLocalMinute(
  value: string,
  separator: IsoLocalMinuteSeparator,
): IsoLocalMinuteParseResult {
  const escapedSeparator = separator === 'T' ? 'T' : ' '
  const pattern = new RegExp(
    `^(\\d{4})-(\\d{2})-(\\d{2})${escapedSeparator}(\\d{2}):(\\d{2})$`,
  )
  const match = pattern.exec(value)
  if (!match) return { status: 'invalid' }
  if (Number(match[1]) < MIN_SUPPORTED_YEAR) {
    return { status: 'unsupported_year' }
  }
  try {
    const canonical = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`
    const dateTime = getTemporal().PlainDateTime.from(canonical)
    return {
      date: `${match[1]}-${match[2]}-${match[3]}`,
      dateTime,
      status: 'valid',
      time: `${match[4]}:${match[5]}`,
    }
  } catch {
    return { status: 'invalid' }
  }
}
