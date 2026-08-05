import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EDITABLE_DATE_TIME_GUIDE } from '../lib/timeConversion'
import { InlineDateTimeEditor } from './InlineDateTimeEditor'

const noOp = () => undefined

describe('inline date-time editor', () => {
  it('keeps the semantic guide visible behind an empty value', () => {
    const html = renderToStaticMarkup(
      <InlineDateTimeEditor
        ambiguous={false}
        error={null}
        label="北京时间"
        locale="zh"
        value=""
        onCancel={noOp}
        onChange={noOp}
        onChooseAmbiguous={noOp}
        onSubmit={noOp}
      />,
    )

    expect(html).toContain(EDITABLE_DATE_TIME_GUIDE)
    expect(html).not.toContain('role="alert"')
  })

  it('replaces the guide one position at a time', () => {
    const value = '2026-08-0'
    const html = renderToStaticMarkup(
      <InlineDateTimeEditor
        ambiguous={false}
        error={null}
        label="北京时间"
        locale="zh"
        value={value}
        onCancel={noOp}
        onChange={noOp}
        onChooseAmbiguous={noOp}
        onSubmit={noOp}
      />,
    )

    expect(html).toContain('class="editor-mask-entered">-</span>')
    expect(html).toContain(EDITABLE_DATE_TIME_GUIDE.slice(value.length))
  })

  it('associates a visible error with invalid input', () => {
    const html = renderToStaticMarkup(
      <InlineDateTimeEditor
        ambiguous={false}
        error="日期或时间无效"
        label="北京时间"
        locale="zh"
        value="2026-02-30 12:00"
        onCancel={noOp}
        onChange={noOp}
        onChooseAmbiguous={noOp}
        onSubmit={noOp}
      />,
    )

    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('role="alert"')
    expect(html).toContain('日期或时间无效')
  })
})
