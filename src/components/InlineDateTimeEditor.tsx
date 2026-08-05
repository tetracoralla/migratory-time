import { useEffect, useId, useRef } from 'react'
import { UI_TEXT } from '../i18n'
import {
  deleteFromDateTimeInput,
  formatDateTimeInputEdit,
  getSelectedDateTimeText,
  type DateTimeDeletionDirection,
} from '../lib/dateTimeInput'
import { EDITABLE_DATE_TIME_GUIDE } from '../lib/timeConversion'
import type { Locale } from '../types'

interface InlineDateTimeEditorProps {
  ambiguous: boolean
  error: string | null
  label: string
  locale: Locale
  value: string
  onCancel: (restoreFocus?: boolean) => void
  onChange: (value: string) => void
  onChooseAmbiguous: (choice: 'earlier' | 'later') => void
  onSubmit: (restoreFocus?: boolean) => void
}

export function InlineDateTimeEditor({
  ambiguous,
  error,
  label,
  locale,
  value,
  onCancel,
  onChange,
  onChooseAmbiguous,
  onSubmit,
}: InlineDateTimeEditorProps) {
  const text = UI_TEXT[locale]
  const inputRef = useRef<HTMLInputElement>(null)
  const selectionFrame = useRef<number | undefined>(undefined)
  const skipBlurSubmission = useRef(false)
  const messageId = useId()

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [label])

  useEffect(
    () => () => {
      window.cancelAnimationFrame(selectionFrame.current ?? 0)
    },
    [],
  )

  function restoreCollapsedSelection(selectionStart: number) {
    window.cancelAnimationFrame(selectionFrame.current ?? 0)
    selectionFrame.current = window.requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(selectionStart, selectionStart)
    })
  }

  function deleteSelection(direction: DateTimeDeletionDirection) {
    const input = inputRef.current
    if (!input) return

    const edit = deleteFromDateTimeInput(
      input.value,
      input.selectionStart ?? 0,
      input.selectionEnd ?? 0,
      direction,
    )
    onChange(edit.value)
    restoreCollapsedSelection(edit.selectionStart)
  }

  return (
    <div className="inline-editor">
      <div className="inline-editor-control">
        <div className="inline-editor-visual" aria-hidden="true">
          {[...value].map((character, index) => (
            <span
              className="editor-mask-entered"
              key={`${character}-${index}`}
            >
              {character}
            </span>
          ))}
          <span className="editor-mask-guide">
            {EDITABLE_DATE_TIME_GUIDE.slice(value.length)}
          </span>
        </div>
        <input
          ref={inputRef}
          aria-describedby={error || ambiguous ? messageId : undefined}
          aria-invalid={error ? true : undefined}
          aria-label={text.editDateTime(label)}
          autoComplete="off"
          inputMode="numeric"
          maxLength={EDITABLE_DATE_TIME_GUIDE.length}
          placeholder={EDITABLE_DATE_TIME_GUIDE}
          spellCheck={false}
          value={value}
          onBlur={() => {
            if (skipBlurSubmission.current) {
              skipBlurSubmission.current = false
              return
            }
            onSubmit(false)
          }}
          onChange={(event) => {
            const edit = formatDateTimeInputEdit(
              event.currentTarget.value,
              event.currentTarget.selectionStart ??
                event.currentTarget.value.length,
            )
            onChange(edit.value)
            restoreCollapsedSelection(edit.selectionStart)
          }}
          onCopy={(event) => {
            const selectedText = getSelectedDateTimeText(
              event.currentTarget.value,
              event.currentTarget.selectionStart ?? 0,
              event.currentTarget.selectionEnd ?? 0,
            )
            if (selectedText === null) return

            try {
              event.clipboardData.setData('text/plain', selectedText)
              event.preventDefault()
            } catch {
              // Keep the browser's native copy path when clipboard access fails.
            }
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return

            if (
              (event.key === 'Backspace' || event.key === 'Delete') &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.altKey &&
              !event.shiftKey
            ) {
              event.preventDefault()
              deleteSelection(
                event.key === 'Backspace' ? 'backward' : 'forward',
              )
              return
            }

            if (event.key === 'Enter') {
              event.preventDefault()
              event.stopPropagation()
              onSubmit(true)
              return
            }

            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              skipBlurSubmission.current = true
              onCancel(true)
            }
          }}
        />
      </div>

      {error ? (
        <div id={messageId} className="editor-message editor-error" role="alert">
          {error}
        </div>
      ) : ambiguous ? (
        <div
          id={messageId}
          className="editor-message ambiguity-options"
          role="group"
          aria-label={text.ambiguity}
        >
          <span>{text.ambiguity}</span>
          <button type="button" onClick={() => onChooseAmbiguous('earlier')}>
            {text.ambiguityEarlier}
          </button>
          <button type="button" onClick={() => onChooseAmbiguous('later')}>
            {text.ambiguityLater}
          </button>
        </div>
      ) : null}
    </div>
  )
}
