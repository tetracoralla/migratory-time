import { UI_TEXT } from '../i18n'
import type { Locale } from '../types'

interface FloatingActionsProps {
  copyStatus: 'idle' | 'success' | 'error'
  isLive: boolean
  locale: Locale
  onCopy: () => void
  onReset: () => void
  resetFeedback: boolean
  resetSequence: number
}

export function FloatingActions({
  copyStatus,
  isLive,
  locale,
  onCopy,
  onReset,
  resetFeedback,
  resetSequence,
}: FloatingActionsProps) {
  const text = UI_TEXT[locale]
  const feedback =
    copyStatus === 'error'
      ? { kind: 'error', message: text.copyFailed }
      : copyStatus === 'success'
        ? { kind: 'success', message: text.copied }
        : resetFeedback
          ? { kind: 'success', message: text.resetDone }
          : null

  return (
    <>
      {feedback ? (
        <span
          className={`action-feedback${feedback.kind === 'error' ? ' is-error' : ''}`}
          role={feedback.kind === 'error' ? 'alert' : 'status'}
        >
          <svg
            className="action-feedback-icon"
            aria-hidden="true"
            viewBox="0 0 20 20"
          >
            {feedback.kind === 'error' ? (
              <>
                <path d="M6.5 6.5l7 7" />
                <path d="M13.5 6.5l-7 7" />
              </>
            ) : (
              <path d="m5.5 10.3 2.8 2.8 6.2-6.2" />
            )}
          </svg>
          {feedback.message}
        </span>
      ) : null}

      <div className="floating-actions" aria-label={text.appLabel}>
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
