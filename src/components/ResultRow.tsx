import { getRegionLabel, UI_TEXT } from '../i18n'
import type { ConversionResult } from '../types'
import type { Locale } from '../types'
import { InlineDateTimeEditor } from './InlineDateTimeEditor'

interface ResultRowProps {
  ambiguous: boolean
  editButtonRef: (node: HTMLButtonElement | null) => void
  editError: string | null
  editValue: string
  isEditing: boolean
  locale: Locale
  result: ConversionResult
  onCancelEdit: (restoreFocus?: boolean) => void
  onChooseAmbiguous: (choice: 'earlier' | 'later') => void
  onEditValueChange: (value: string) => void
  onStartEdit: () => void
  onSubmitEdit: (restoreFocus?: boolean) => void
}

export function ResultRow({
  ambiguous,
  editButtonRef,
  editError,
  editValue,
  isEditing,
  locale,
  result,
  onCancelEdit,
  onChooseAmbiguous,
  onEditValueChange,
  onStartEdit,
  onSubmitEdit,
}: ResultRowProps) {
  const label = getRegionLabel(result, locale)
  const text = UI_TEXT[locale]

  return (
    <li
      className={`result-row${isEditing ? ' is-editing' : ''}`}
      data-zone={result.id}
    >
      <span className="timeline-dot" aria-hidden="true" />
      <div className="region-block">
        <span className="region-name">{label}</span>
        {!isEditing && label !== result.utcOffsetLabel ? (
          <span className="utc-offset">{result.utcOffsetLabel}</span>
        ) : null}
      </div>

      {isEditing ? (
        <InlineDateTimeEditor
          ambiguous={ambiguous}
          error={editError}
          label={label}
          locale={locale}
          value={editValue}
          onCancel={onCancelEdit}
          onChange={onEditValueChange}
          onChooseAmbiguous={onChooseAmbiguous}
          onSubmit={onSubmitEdit}
        />
      ) : (
        <div className="result-value">
          <span className="result-date">{result.dateLabel}</span>
          <button
            ref={editButtonRef}
            className="edit-trigger"
            type="button"
            aria-label={text.editZone(label)}
            data-edit-zone={result.id}
            onClick={onStartEdit}
          >
            <time className="result-time" dateTime={result.dateTimeValue}>
              {result.timeLabel}
            </time>
          </button>
        </div>
      )}
    </li>
  )
}
