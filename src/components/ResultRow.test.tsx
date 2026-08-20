import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ConversionResult } from '../types'
import { ResultRow } from './ResultRow'

const noOp = () => undefined
const result: ConversionResult = {
  abbreviations: { '+08:00': 'CST' },
  id: 'Asia/Shanghai',
  label: '北京时间',
  labelEn: 'China',
  shareCode: 'cn',
  shortLabel: '北京',
  shortLabelEn: 'China',
  dateLabel: '08月04日 周二',
  timeLabel: '12:00',
  dateTimeLabel: '08月04日 周二 12:00',
  dateTimeValue: '2026-08-04T12:00',
  timeZoneAbbreviation: 'CST',
  utcOffsetLabel: 'UTC+8',
}

describe('result row', () => {
  it('only places the time digits inside the edit trigger', () => {
    const html = renderToStaticMarkup(
      <ResultRow
        ambiguous={false}
        editButtonRef={noOp}
        editError={null}
        editValue="2026-08-04 12:00"
        isEditing={false}
        locale="zh"
        result={result}
        onCancelEdit={noOp}
        onChooseAmbiguous={noOp}
        onEditValueChange={noOp}
        onStartEdit={noOp}
        onSubmitEdit={noOp}
      />,
    )
    const editTrigger = html.match(/<button[^>]*class="edit-trigger"[\s\S]*?<\/button>/)?.[0]

    expect(html).toContain('class="result-value"')
    expect(editTrigger).toContain('12:00')
    expect(editTrigger).not.toContain('08月04日 周二')
  })

  it('uses a concise place name instead of an ambiguous abbreviation in English', () => {
    const html = renderToStaticMarkup(
      <ResultRow
        ambiguous={false}
        editButtonRef={noOp}
        editError={null}
        editValue="2026-08-04 12:00"
        isEditing={false}
        locale="en"
        result={result}
        onCancelEdit={noOp}
        onChooseAmbiguous={noOp}
        onEditValueChange={noOp}
        onStartEdit={noOp}
        onSubmitEdit={noOp}
      />,
    )

    expect(html).toContain('class="region-name">China</span>')
    expect(html).toContain('aria-label="Edit China"')
    expect(html).not.toContain('class="region-name">CST</span>')
  })

  it('hides the UTC detail while the row is being edited', () => {
    const html = renderToStaticMarkup(
      <ResultRow
        ambiguous={false}
        editButtonRef={noOp}
        editError={null}
        editValue="2026-08-04 12:00"
        isEditing
        locale="zh"
        result={result}
        onCancelEdit={noOp}
        onChooseAmbiguous={noOp}
        onEditValueChange={noOp}
        onStartEdit={noOp}
        onSubmitEdit={noOp}
      />,
    )

    expect(html).toContain('北京时间')
    expect(html).toContain('2026-08-04 12:00')
    expect(html).not.toContain('UTC+8')
  })

  it('uses place identity instead of a generic time-zone name for global rows', () => {
    const parisResult: ConversionResult = {
      ...result,
      id: 'Europe/Paris',
      label: '中欧时间',
      labelEn: 'Central European Time',
      shortLabel: '巴黎',
      shortLabelEn: 'Paris',
      timeZoneAbbreviation: 'GMT+2',
      utcOffsetLabel: 'UTC+2',
    }
    const chineseHtml = renderToStaticMarkup(
      <ResultRow
        ambiguous={false}
        editButtonRef={noOp}
        editError={null}
        editValue="2026-08-04 12:00"
        isEditing={false}
        locale="zh"
        result={parisResult}
        onCancelEdit={noOp}
        onChooseAmbiguous={noOp}
        onEditValueChange={noOp}
        onStartEdit={noOp}
        onSubmitEdit={noOp}
      />,
    )
    const englishHtml = renderToStaticMarkup(
      <ResultRow
        ambiguous={false}
        editButtonRef={noOp}
        editError={null}
        editValue="2026-08-04 12:00"
        isEditing={false}
        locale="en"
        result={parisResult}
        onCancelEdit={noOp}
        onChooseAmbiguous={noOp}
        onEditValueChange={noOp}
        onStartEdit={noOp}
        onSubmitEdit={noOp}
      />,
    )

    expect(chineseHtml).toContain('class="region-name">巴黎</span>')
    expect(chineseHtml).toContain('aria-label="编辑巴黎"')
    expect(englishHtml).toContain('class="region-name">Paris</span>')
    expect(englishHtml).toContain('aria-label="Edit Paris"')
    expect(englishHtml).not.toContain('class="region-name">GMT+2</span>')
  })

  it('does not repeat a fixed offset as both the row name and detail', () => {
    const fixedOffsetResult: ConversionResult = {
      ...result,
      id: 'Etc/GMT+5',
      label: 'UTC−5',
      labelEn: 'UTC−5',
      shortLabel: 'UTC−5',
      shortLabelEn: 'UTC−5',
      timeZoneAbbreviation: 'GMT-5',
      utcOffsetLabel: 'UTC−5',
    }
    const html = renderToStaticMarkup(
      <ResultRow
        ambiguous={false}
        editButtonRef={noOp}
        editError={null}
        editValue="2026-08-04 12:00"
        isEditing={false}
        locale="zh"
        result={fixedOffsetResult}
        onCancelEdit={noOp}
        onChooseAmbiguous={noOp}
        onEditValueChange={noOp}
        onStartEdit={noOp}
        onSubmitEdit={noOp}
      />,
    )

    expect(html.match(/UTC−5/g)).toHaveLength(2)
    expect(html).not.toContain('class="utc-offset"')
  })
})
