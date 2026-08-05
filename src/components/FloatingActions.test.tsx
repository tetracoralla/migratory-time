import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FloatingActions } from './FloatingActions'

describe('floating actions', () => {
  it('exposes the live mode through the existing reset control', () => {
    const html = renderToStaticMarkup(
      <FloatingActions
        copyStatus="idle"
        isLive
        locale="zh"
        onCopy={() => undefined}
        onReset={() => undefined}
        resetFeedback={false}
        resetSequence={0}
      />,
    )

    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('data-time-action="reset"')
    expect(html).toContain('data-time-action="copy"')
    expect(html).toContain('floating-action is-live')
  })

  it('shows a visible retry state after copy fails', () => {
    const html = renderToStaticMarkup(
      <FloatingActions
        copyStatus="error"
        isLive={false}
        locale="zh"
        onCopy={() => undefined}
        onReset={() => undefined}
        resetFeedback={false}
        resetSequence={0}
      />,
    )

    expect(html).toContain('复制失败，再试一次')
    expect(html).toContain('复制失败，重试复制所示时间')
    expect(html).toContain('floating-action has-error')
  })

  it('announces successful actions and animates a triggered reset', () => {
    const resetHtml = renderToStaticMarkup(
      <FloatingActions
        copyStatus="idle"
        isLive
        locale="zh"
        onCopy={() => undefined}
        onReset={() => undefined}
        resetFeedback
        resetSequence={1}
      />,
    )
    const copyHtml = renderToStaticMarkup(
      <FloatingActions
        copyStatus="success"
        isLive={false}
        locale="zh"
        onCopy={() => undefined}
        onReset={() => undefined}
        resetFeedback={false}
        resetSequence={0}
      />,
    )

    expect(resetHtml).toContain('role="status"')
    expect(resetHtml).toContain('已恢复到现在')
    expect(resetHtml).toContain('action-feedback-icon')
    expect(resetHtml).toContain('reset-icon is-spinning')
    expect(copyHtml).toContain('role="status"')
    expect(copyHtml).toContain('已复制所示时间')
  })
})
