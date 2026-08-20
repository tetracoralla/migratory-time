import type { ConversionResult, Locale } from './types'
import { DEFAULT_TIME_ZONE_IDS } from './data/timeZones'

const DEFAULT_TIME_ZONE_ID_SET = new Set(DEFAULT_TIME_ZONE_IDS)

export const UI_TEXT = {
  zh: {
    ambiguity: '重复时刻',
    ambiguityEarlier: '第 1 次',
    ambiguityLater: '第 2 次',
    appLabel: '世界时钟',
    close: '关闭',
    copied: '已复制所示时间',
    copy: '复制所示时间',
    copyFailed: '复制失败，再试一次',
    copyRetry: '复制失败，重试复制所示时间',
    editDateTime: (label: string) => `编辑${label}的日期和时间`,
    editZone: (label: string) => `编辑${label}`,
    copyImage: '复制图片',
    copyLink: '复制链接',
    downloadImage: '下载图片',
    imageCopied: '图片已复制',
    imageCopyFailed: '无法复制图片，请下载图片',
    imageDownloaded: '图片已下载',
    imageDownloadFailed: '图片下载失败，再试一次',
    invalidDateTime: '日期或时间无效',
    invalidIncomplete: '请完整输入日期和时间',
    invalidShareLink: '分享链接无效，已显示当前时间',
    unsupportedDateTime: '仅支持 1901 年及之后的日期',
    unsupportedPrecision: '该历史时刻含秒级时区偏移，无法按分钟精确显示',
    linkCopied: '链接已复制',
    linkCopyFailed: '链接复制失败，再试一次',
    liveMode: '当前为实时模式',
    more: '更多',
    noRegions: '没有匹配的地区',
    regions: '显示地区',
    regionsLimit: '最多选择 20 个地区',
    regionsMinimum: '至少保留 1 个地区',
    reset: '恢复到现在',
    resetDone: '已恢复到现在',
    resultsLabel: '各地区对应时间',
    searchRegions: '搜索地区',
    searchRegionsPlaceholder: '城市、国家或 IANA 时区',
    selectedRegions: (count: number, limit: number) => `已选 ${count}/${limit}`,
    switchLanguage: 'Switch to English',
    share: '分享当前时间',
    shareDialogTitle: '分享',
    shareFailed: '分享失败，再试一次',
    shareImagePreview: '时间列表分享图片预览',
    shareLink: '分享链接',
    shareRetry: '分享失败，重试打开分享',
    systemShareDone: '已打开更多分享方式',
    systemShareFailed: '无法打开更多分享方式',
  },
  en: {
    ambiguity: 'Repeated local time',
    ambiguityEarlier: 'First',
    ambiguityLater: 'Second',
    appLabel: 'World clock',
    close: 'Close',
    copied: 'Shown times copied',
    copy: 'Copy shown times',
    copyFailed: 'Copy failed. Try again.',
    copyRetry: 'Copy failed. Retry copying shown times',
    editDateTime: (label: string) => `Edit date and time for ${label}`,
    editZone: (label: string) => `Edit ${label}`,
    copyImage: 'Copy image',
    copyLink: 'Copy link',
    downloadImage: 'Download image',
    imageCopied: 'Image copied',
    imageCopyFailed: 'Could not copy image. Download it instead.',
    imageDownloaded: 'Image downloaded',
    imageDownloadFailed: 'Image download failed. Try again.',
    invalidDateTime: 'Invalid date or local time',
    invalidIncomplete: 'Enter the complete date and time',
    invalidShareLink: 'Invalid share link. Showing the current time.',
    unsupportedDateTime: 'Dates from 1901 onward are supported',
    unsupportedPrecision: 'This historical time has a sub-minute offset and cannot be shown exactly',
    linkCopied: 'Link copied',
    linkCopyFailed: 'Could not copy link. Try again.',
    liveMode: 'Showing the current time',
    more: 'More',
    noRegions: 'No matching regions',
    regions: 'Regions',
    regionsLimit: 'Choose up to 20 regions',
    regionsMinimum: 'Keep at least one region',
    reset: 'Reset to now',
    resetDone: 'Reset to now',
    resultsLabel: 'Corresponding times by region',
    searchRegions: 'Search regions',
    searchRegionsPlaceholder: 'City, country, or IANA time zone',
    selectedRegions: (count: number, limit: number) => `${count}/${limit} selected`,
    switchLanguage: '切换到中文',
    share: 'Share current time',
    shareDialogTitle: 'Share',
    shareFailed: 'Sharing failed. Try again.',
    shareImagePreview: 'Preview of the shared time list image',
    shareLink: 'Share link',
    shareRetry: 'Sharing failed. Retry opening share',
    systemShareDone: 'More sharing options opened',
    systemShareFailed: 'Could not open more sharing options',
  },
} as const

export function getRegionLabel(result: ConversionResult, locale: Locale) {
  if (locale === 'en') return result.shortLabelEn
  return DEFAULT_TIME_ZONE_ID_SET.has(result.id)
    ? result.label
    : result.shortLabel
}

export function getRegionPickerLabel(
  result: ConversionResult,
  locale: Locale,
) {
  if (!DEFAULT_TIME_ZONE_ID_SET.has(result.id)) {
    return locale === 'zh' ? result.shortLabel : result.shortLabelEn
  }
  return locale === 'zh' ? result.label : result.labelEn
}
