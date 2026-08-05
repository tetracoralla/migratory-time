import type { ConversionResult, Locale } from './types'

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
    invalidDateTime: '日期或时间无效',
    invalidIncomplete: '请完整输入日期和时间',
    liveMode: '当前为实时模式',
    regions: '显示地区',
    regionsHint: '选择列表中显示和复制的地区',
    reset: '恢复到现在',
    resetDone: '已恢复到现在',
    resultsLabel: '各地区对应时间',
    switchLanguage: 'Switch to English',
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
    invalidDateTime: 'Invalid date or local time',
    invalidIncomplete: 'Enter the complete date and time',
    liveMode: 'Showing the current time',
    regions: 'Regions',
    regionsHint: 'Choose the regions shown in the list and copied text',
    reset: 'Reset to now',
    resetDone: 'Reset to now',
    resultsLabel: 'Corresponding times by region',
    switchLanguage: '切换到中文',
  },
} as const

export function getRegionLabel(result: ConversionResult, locale: Locale) {
  return locale === 'zh' ? result.label : result.timeZoneAbbreviation
}

export function getRegionPickerLabel(
  result: ConversionResult,
  locale: Locale,
) {
  return locale === 'zh' ? result.label : result.labelEn
}
