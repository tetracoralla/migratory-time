import type { TimeZoneDefinition } from '../types'

// 新地区只需在这里补充一个 IANA 时区；换算、详情与复制会自动沿用。
export const TIME_ZONES: TimeZoneDefinition[] = [
  {
    abbreviations: { '+08:00': 'CST' },
    id: 'Asia/Shanghai',
    label: '北京时间',
    labelEn: 'China',
    shortLabel: '北京',
    shortLabelEn: 'China',
  },
  {
    abbreviations: { '-05:00': 'EST', '-04:00': 'EDT' },
    id: 'America/New_York',
    label: '美东时间',
    labelEn: 'US Eastern',
    shortLabel: '美东',
    shortLabelEn: 'US Eastern',
  },
  {
    abbreviations: { '-08:00': 'PST', '-07:00': 'PDT' },
    id: 'America/Los_Angeles',
    label: '美西时间',
    labelEn: 'US Pacific',
    shortLabel: '美西',
    shortLabelEn: 'US Pacific',
  },
  {
    abbreviations: { '+00:00': 'GMT', '+01:00': 'BST' },
    id: 'Europe/London',
    label: '英国时间',
    labelEn: 'United Kingdom',
    shortLabel: '英国',
    shortLabelEn: 'UK',
  },
  {
    abbreviations: { '+01:00': 'CET', '+02:00': 'CEST' },
    id: 'Europe/Berlin',
    label: '中欧时间',
    labelEn: 'Central Europe',
    shortLabel: '中欧',
    shortLabelEn: 'Central Europe',
  },
]

export const BEIJING_TIME_ZONE = 'Asia/Shanghai'
