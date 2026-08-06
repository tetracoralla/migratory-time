import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { UI_TEXT } from '../i18n'
import { writeClipboardText } from '../lib/clipboard'
import {
  canUseSystemShare,
  copyShareImage,
  createShareCard,
  downloadShareImage,
  makeShareCardPreviewUrl,
  shareWithSystem,
} from '../lib/shareImage'
import type { ShareSnapshot } from '../types'
import { ActionFeedback } from './ActionFeedback'

const FEEDBACK_DURATION = 1800

interface ShareDialogProps {
  onClose: () => void
  snapshot: ShareSnapshot
}

type ShareAction = 'copy-image' | 'download-image' | 'more' | 'copy-link'

interface ShareFeedback {
  action: ShareAction
  kind: 'success' | 'error'
  message: string
}

function isCancelledShare(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function ShareDialog({ onClose, snapshot }: ShareDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const feedbackTimer = useRef<number | undefined>(undefined)
  const [busyAction, setBusyAction] = useState<ShareAction | null>(null)
  const [feedback, setFeedback] = useState<ShareFeedback | null>(null)
  const text = UI_TEXT[snapshot.locale]
  const card = useMemo(
    () => createShareCard(snapshot.results, snapshot.locale),
    [snapshot.locale, snapshot.results],
  )
  const previewUrl = useMemo(() => makeShareCardPreviewUrl(card), [card])
  const supportsSystemShare = canUseSystemShare()

  useEffect(() => {
    dialogRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled)',
        )
        if (!focusable?.length) return

        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(
    () => () => window.clearTimeout(feedbackTimer.current),
    [],
  )

  function showFeedback(nextFeedback: ShareFeedback) {
    window.clearTimeout(feedbackTimer.current)
    setFeedback(nextFeedback)
    feedbackTimer.current = window.setTimeout(
      () => setFeedback(null),
      FEEDBACK_DURATION,
    )
  }

  async function runAction(
    action: ShareAction,
    operation: () => Promise<void>,
    successMessage: string,
    errorMessage: string,
  ) {
    if (busyAction) return
    setBusyAction(action)
    setFeedback(null)

    try {
      await operation()
      showFeedback({ action, kind: 'success', message: successMessage })
    } catch (error) {
      if (action === 'more' && isCancelledShare(error)) return
      showFeedback({ action, kind: 'error', message: errorMessage })
    } finally {
      setBusyAction(null)
    }
  }

  function actionIcon(action: ShareAction, icon: ReactNode) {
    return feedback?.action === action && feedback.kind === 'success' ? (
      <svg aria-hidden="true" viewBox="0 0 20 20">
        <path d="m4.8 10.3 3.1 3.1 7.3-7.3" />
      </svg>
    ) : (
      icon
    )
  }

  return createPortal(
    <div
      className="share-dialog-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
      >
        <header className="share-dialog-header">
          <h2 id="share-dialog-title">{text.shareDialogTitle}</h2>
          <button
            className="region-picker-close"
            type="button"
            aria-label={text.close}
            onClick={onClose}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20">
              <path d="M5 5l10 10M15 5 5 15" />
            </svg>
          </button>
        </header>

        <div className="share-preview">
          <img src={previewUrl} alt={text.shareImagePreview} />
        </div>

        <div
          className={`share-image-actions${supportsSystemShare ? ' has-more' : ''}`}
        >
          <button
            className="share-dialog-action is-primary"
            type="button"
            disabled={busyAction !== null}
            onClick={() =>
              void runAction(
                'copy-image',
                () => copyShareImage(card),
                text.imageCopied,
                text.imageCopyFailed,
              )
            }
          >
            {actionIcon(
              'copy-image',
              <svg aria-hidden="true" viewBox="0 0 20 20">
                <rect x="6.5" y="6.5" width="9" height="9" rx="1.5" />
                <path d="M13.5 6.5v-2A1.5 1.5 0 0 0 12 3H4.5A1.5 1.5 0 0 0 3 4.5V12a1.5 1.5 0 0 0 1.5 1.5h2" />
              </svg>,
            )}
            <span>{text.copyImage}</span>
          </button>
          <button
            className="share-dialog-action"
            type="button"
            disabled={busyAction !== null}
            onClick={() =>
              void runAction(
                'download-image',
                () => downloadShareImage(card, snapshot.url),
                text.imageDownloaded,
                text.imageDownloadFailed,
              )
            }
          >
            {actionIcon(
              'download-image',
              <svg aria-hidden="true" viewBox="0 0 20 20">
                <path d="M10 3v9" />
                <path d="m6.5 8.5 3.5 3.5 3.5-3.5" />
                <path d="M3.5 15.5h13" />
              </svg>,
            )}
            <span>{text.downloadImage}</span>
          </button>
          {supportsSystemShare ? (
            <button
              className="share-dialog-action"
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                void runAction(
                  'more',
                  () =>
                    shareWithSystem(card, snapshot.results, snapshot.url),
                  text.systemShareDone,
                  text.systemShareFailed,
                )
              }
            >
              {actionIcon(
                'more',
                <svg aria-hidden="true" viewBox="0 0 20 20">
                  <circle cx="4" cy="10" r="1.2" />
                  <circle cx="10" cy="10" r="1.2" />
                  <circle cx="16" cy="10" r="1.2" />
                </svg>,
              )}
              <span>{text.more}</span>
            </button>
          ) : null}
        </div>

        <div className="share-link-row">
          <label className="sr-only" htmlFor="share-link-value">
            {text.shareLink}
          </label>
          <input
            id="share-link-value"
            readOnly
            value={snapshot.url}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            className="share-link-copy"
            type="button"
            disabled={busyAction !== null}
            onClick={() =>
              void runAction(
                'copy-link',
                () => writeClipboardText(snapshot.url),
                text.linkCopied,
                text.linkCopyFailed,
              )
            }
          >
            {actionIcon(
              'copy-link',
              <svg aria-hidden="true" viewBox="0 0 20 20">
                <rect x="6.5" y="6.5" width="9" height="9" rx="1.5" />
                <path d="M13.5 6.5v-2A1.5 1.5 0 0 0 12 3H4.5A1.5 1.5 0 0 0 3 4.5V12a1.5 1.5 0 0 0 1.5 1.5h2" />
              </svg>,
            )}
            <span>{text.copyLink}</span>
          </button>
        </div>
      </section>

      {feedback ? (
        <ActionFeedback
          className="share-dialog-feedback"
          kind={feedback.kind}
          message={feedback.message}
        />
      ) : null}
    </div>,
    document.body,
  )
}
