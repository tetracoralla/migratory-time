import { getRegionLabel } from '../i18n'
import type { ConversionResult, Locale } from '../types'
import { makeCopyText } from './timeConversion'

export const SHARE_CARD_WIDTH = 375
const SHARE_CARD_ROW_HEIGHT = 112
const SHARE_CARD_TOP = 16
const SHARE_CARD_FOOTER_HEIGHT = 42
const SHARE_CARD_PIXEL_RATIO = 2

export interface ShareCard {
  height: number
  svg: string
  width: number
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    }
    return entities[character]
  })
}

function makeShareDateLabel(result: ConversionResult, locale: Locale) {
  const localDate = result.dateTimeValue.slice(0, 10)
  const weekday =
    locale === 'zh'
      ? result.dateLabel.split(' ').at(-1)
      : result.dateLabel.split(' · ').at(-1)

  return weekday ? `${localDate} · ${weekday}` : localDate
}

export function createShareCard(
  results: ConversionResult[],
  locale: Locale,
): ShareCard {
  const rowsHeight = results.length * SHARE_CARD_ROW_HEIGHT
  const height = SHARE_CARD_TOP + rowsHeight + SHARE_CARD_FOOTER_HEIGHT
  const firstDotY = SHARE_CARD_TOP + SHARE_CARD_ROW_HEIGHT / 2
  const lastDotY =
    SHARE_CARD_TOP +
    Math.max(results.length - 1, 0) * SHARE_CARD_ROW_HEIGHT +
    SHARE_CARD_ROW_HEIGHT / 2

  const rows = results
    .map((result, index) => {
      const rowTop = SHARE_CARD_TOP + index * SHARE_CARD_ROW_HEIGHT
      const divider =
        index === results.length - 1
          ? ''
          : `<line x1="50" y1="${rowTop + SHARE_CARD_ROW_HEIGHT}" x2="353" y2="${rowTop + SHARE_CARD_ROW_HEIGHT}" stroke="#eceef1" stroke-width="1" />`

      return `
        <g>
          ${divider}
          <circle cx="30" cy="${rowTop + SHARE_CARD_ROW_HEIGHT / 2}" r="6.5" fill="#0c62ff" />
          <text x="50" y="${rowTop + 42}" fill="#101114" font-family="PingFang SC, SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="20" font-weight="600">${escapeXml(getRegionLabel(result, locale))}</text>
          <text x="50" y="${rowTop + 64}" fill="#626871" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="13">${escapeXml(result.utcOffsetLabel)}</text>
          <text x="353" y="${rowTop + 48}" text-anchor="end" fill="#101114" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif" font-size="38" font-weight="400" letter-spacing="1.3">${escapeXml(result.timeLabel)}</text>
          <text x="353" y="${rowTop + 80}" text-anchor="end" fill="#626871" font-family="SF Pro Text, PingFang SC, Helvetica Neue, Arial, sans-serif" font-size="13">${escapeXml(makeShareDateLabel(result, locale))}</text>
        </g>`
    })
    .join('')

  const axis = results.length
    ? `<line x1="30" y1="${firstDotY - 4.5}" x2="30" y2="${lastDotY + 4.5}" stroke="#0c62ff" stroke-width="2" />`
    : ''

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SHARE_CARD_WIDTH}" height="${height}" viewBox="0 0 ${SHARE_CARD_WIDTH} ${height}">
    <rect width="${SHARE_CARD_WIDTH}" height="${height}" fill="#ffffff" />
    ${axis}
    ${rows}
    <text x="187.5" y="${height - 15}" text-anchor="middle" fill="#858b94" font-family="SF Pro Text, Helvetica Neue, Arial, sans-serif" font-size="12" font-weight="500" letter-spacing="0.2">Migratory Time · openAdam</text>
  </svg>`

  return { height, svg, width: SHARE_CARD_WIDTH }
}

export function makeShareCardPreviewUrl(card: ShareCard) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(card.svg)}`
}

export async function renderShareCardPng(card: ShareCard) {
  const sourceUrl = URL.createObjectURL(
    new Blob([card.svg], { type: 'image/svg+xml;charset=utf-8' }),
  )

  try {
    const image = new Image()
    image.decoding = 'async'
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Share image could not be rendered'))
    })
    image.src = sourceUrl
    await loaded

    const canvas = document.createElement('canvas')
    canvas.width = card.width * SHARE_CARD_PIXEL_RATIO
    canvas.height = card.height * SHARE_CARD_PIXEL_RATIO
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is unavailable')

    context.scale(SHARE_CARD_PIXEL_RATIO, SHARE_CARD_PIXEL_RATIO)
    context.drawImage(image, 0, 0, card.width, card.height)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('PNG could not be created'))
      }, 'image/png')
    })
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}

export async function copyShareImage(card: ShareCard) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Image clipboard is unavailable')
  }

  const png = renderShareCardPng(card)
  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': png }),
  ])
}

export function makeShareImageFilename(url: string) {
  const encodedInstant = new URL(url).searchParams.get('t')
  return `migratory-time-${encodedInstant ?? 'shared-time'}.png`
}

export async function downloadShareImage(card: ShareCard, url: string) {
  const png = await renderShareCardPng(card)
  const downloadUrl = URL.createObjectURL(png)
  const anchor = document.createElement('a')
  anchor.href = downloadUrl
  anchor.download = makeShareImageFilename(url)
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0)
}

export function canUseSystemShare(
  shareNavigator: Pick<Navigator, 'share'> | undefined =
    typeof navigator === 'undefined' ? undefined : navigator,
) {
  return typeof shareNavigator?.share === 'function'
}

export async function shareWithSystem(
  card: ShareCard,
  results: ConversionResult[],
  url: string,
) {
  if (!canUseSystemShare()) throw new Error('System sharing is unavailable')

  const png = await renderShareCardPng(card)
  const file = new File([png], makeShareImageFilename(url), {
    type: 'image/png',
  })
  const baseShareData: ShareData = {
    title: 'Migratory Time',
    text: makeCopyText(results),
    url,
  }
  const fileShareData = { ...baseShareData, files: [file] }
  const shareData = navigator.canShare?.(fileShareData)
    ? fileShareData
    : baseShareData

  await navigator.share(shareData)
}
