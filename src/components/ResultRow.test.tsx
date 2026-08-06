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
})
