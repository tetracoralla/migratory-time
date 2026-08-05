import type { Temporal } from '@js-temporal/polyfill'

export interface TimeZoneDefinition {
  abbreviations: Record<string, string>
  id: string
  label: string
  labelEn: string
  shortLabel: string
  shortLabelEn: string
}

export type Locale = 'zh' | 'en'

export interface ConversionResult extends TimeZoneDefinition {
  dateLabel: string
  dateTimeLabel: string
  dateTimeValue: string
  timeLabel: string
  timeZoneAbbreviation: string
  utcOffsetLabel: string
}

export type WallTimeResolution =
  | {
      status: 'valid'
      instant: Temporal.Instant
    }
  | {
      status: 'ambiguous'
      earlier: Temporal.Instant
      later: Temporal.Instant
    }
  | {
      status: 'nonexistent'
    }
