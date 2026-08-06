import type { RefObject } from 'react'
import { UI_TEXT } from '../i18n'
import type { Locale } from '../types'
import { ActionFeedback } from './ActionFeedback'

interface FloatingActionsProps {
  copyStatus: 'idle' | 'success' | 'error'
  isLive: boolean
  locale: Locale
  onCopy: () => void
  onReset: () => void
  onShare: () => void
  resetFeedback: boolean
  resetSequence: number
  shareButtonRef: RefObject<HTMLButtonElement | null>
  shareOpen: boolean
  shareStatus: 'idle' | 'error' | 'invalid-link'
}

export function FloatingActions({
  copyStatus,
  isLive,
  locale,
  onCopy,
  onReset,
  onShare,
  resetFeedback,
  resetSequence,
  shareButtonRef,
  shareOpen,
  shareStatus,
}: FloatingActionsProps) {
  const text = UI_TEXT[locale]
  const feedback: { kind: 'success' | 'error'; message: string } | null =
    shareStatus === 'invalid-link'
      ? { kind: 'error', message: text.invalidShareLink }
      : shareStatus === 'error'
        ? { kind: 'error', message: text.shareFailed }
        : copyStatus === 'error'
          ? { kind: 'error', message: text.copyFailed }
          : copyStatus === 'success'
            ? { kind: 'success', message: text.copied }
            : resetFeedback
              ? { kind: 'success', message: text.resetDone }
              : null

  return (
    <>
      {feedback ? (
        <ActionFeedback kind={feedback.kind} message={feedback.message} />
      ) : null}

      <div className="floating-actions" aria-label={text.appLabel}>
        <button
          ref={shareButtonRef}
          className={`floating-action share-action${shareOpen ? ' is-shared' : ''}${shareStatus === 'error' ? ' has-error' : ''}`}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={shareOpen}
          aria-label={
            shareStatus === 'error' ? text.shareRetry : text.share
          }
          data-time-action="share"
          title={shareStatus === 'error' ? text.shareRetry : text.share}
          onClick={onShare}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M12 15V3" />
            <path d="m8 7 4-4 4 4" />
            <path d="M6 10v8.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V10" />
          </svg>
        </button>
        <button
          className={`floating-action${isLive ? ' is-live' : ''}`}
          type="button"
          aria-label={text.reset}
          aria-pressed={isLive}
          data-time-action="reset"
          title={isLive ? text.liveMode : text.reset}
          onClick={onReset}
        >
          <span
            key={resetSequence}
            className={resetSequence > 0 ? 'reset-icon is-spinning' : 'reset-icon'}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M4.8 8.2A8 8 0 1 1 4 13" />
              <path d="M4.8 3.8v4.4h4.4" />
            </svg>
          </span>
        </button>
        <button
          className={`floating-action${copyStatus === 'success' ? ' is-copied' : ''}${copyStatus === 'error' ? ' has-error' : ''}`}
          type="button"
          aria-label={
            copyStatus === 'success'
              ? text.copied
              : copyStatus === 'error'
                ? text.copyRetry
                : text.copy
          }
          data-time-action="copy"
          title={
            copyStatus === 'success'
              ? text.copied
              : copyStatus === 'error'
                ? text.copyRetry
                : text.copy
          }
          onClick={onCopy}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <rect x="8" y="8" width="11" height="11" rx="1.5" />
            <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
          </svg>
        </button>
      </div>
    </>
  )
}
