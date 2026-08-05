import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getRegionPickerLabel, UI_TEXT } from '../i18n'
import type { ConversionResult, Locale } from '../types'

interface RegionPickerDialogProps {
  locale: Locale
  onClose: () => void
  onToggleZone: (zoneId: string) => void
  results: ConversionResult[]
  selectedZoneIds: string[]
}

export function RegionPickerDialog({
  locale,
  onClose,
  onToggleZone,
  results,
  selectedZoneIds,
}: RegionPickerDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const text = UI_TEXT[locale]

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
          'button:not(:disabled)',
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

  return createPortal(
    <div
      className="region-picker-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="region-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="region-picker-title"
        aria-describedby="region-picker-description"
      >
        <header className="region-picker-header">
          <div>
            <h2 id="region-picker-title">{text.regions}</h2>
            <p id="region-picker-description">{text.regionsHint}</p>
          </div>
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

        <div className="region-options">
          {results.map((result) => {
            const selected = selectedZoneIds.includes(result.id)
            const onlySelection = selected && selectedZoneIds.length === 1

            return (
              <button
                key={result.id}
                className={`region-option${selected ? ' is-selected' : ''}`}
                type="button"
                aria-pressed={selected}
                disabled={onlySelection}
                onClick={() => onToggleZone(result.id)}
              >
                <span className="region-option-name">
                  {getRegionPickerLabel(result, locale)}
                </span>
                <span className="region-option-code">
                  {result.timeZoneAbbreviation}
                </span>
                <span className="region-option-check" aria-hidden="true">
                  <svg viewBox="0 0 18 18">
                    <path d="m4.3 9.2 3 3 6.4-6.4" />
                  </svg>
                </span>
              </button>
            )
          })}
        </div>

        <footer className="region-picker-brand">
          Migratory Time <span>by openAdam</span>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
