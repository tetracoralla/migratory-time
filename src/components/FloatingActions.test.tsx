import { createRef } from 'react'
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
        onShare={() => undefined}
        resetFeedback={false}
        resetSequence={0}
        shareButtonRef={createRef()}
        shareOpen={false}
        shareStatus="idle"
      />,
    )

    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('data-time-action="reset"')
    expect(html).toContain('data-time-action="copy"')
    expect(html).toContain('data-time-action="share"')
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
        onShare={() => undefined}
        resetFeedback={false}
        resetSequence={0}
        shareButtonRef={createRef()}
        shareOpen={false}
        shareStatus="idle"
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
        onShare={() => undefined}
        resetFeedback
        resetSequence={1}
        shareButtonRef={createRef()}
        shareOpen={false}
        shareStatus="idle"
      />,
    )
    const copyHtml = renderToStaticMarkup(
      <FloatingActions
        copyStatus="success"
        isLive={false}
        locale="zh"
        onCopy={() => undefined}
        onReset={() => undefined}
        onShare={() => undefined}
        resetFeedback={false}
        resetSequence={0}
        shareButtonRef={createRef()}
        shareOpen={false}
        shareStatus="idle"
      />,
    )

    expect(resetHtml).toContain('role="status"')
    expect(resetHtml).toContain('已恢复到现在')
    expect(resetHtml).toContain('action-feedback-icon')
    expect(resetHtml).toContain('reset-icon is-spinning')
    expect(copyHtml).toContain('role="status"')
    expect(copyHtml).toContain('已复制所示时间')
  })

  it('marks an open share dialog and exposes retry after entry failure', () => {
    const openHtml = renderToStaticMarkup(
      <FloatingActions
        copyStatus="idle"
        isLive={false}
        locale="zh"
        onCopy={() => undefined}
        onReset={() => undefined}
        onShare={() => undefined}
        resetFeedback={false}
        resetSequence={0}
        shareButtonRef={createRef()}
        shareOpen
        shareStatus="idle"
      />,
    )
    const errorHtml = renderToStaticMarkup(
      <FloatingActions
        copyStatus="idle"
        isLive={false}
        locale="zh"
        onCopy={() => undefined}
        onReset={() => undefined}
        onShare={() => undefined}
        resetFeedback={false}
        resetSequence={0}
        shareButtonRef={createRef()}
        shareOpen={false}
        shareStatus="error"
      />,
    )

    expect(openHtml).toContain('aria-expanded="true"')
    expect(openHtml).toContain('share-action is-shared')
    expect(errorHtml).toContain('分享失败，再试一次')
    expect(errorHtml).toContain('分享失败，重试打开分享')
  })
})
