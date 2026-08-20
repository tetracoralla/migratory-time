import type { Temporal } from '@js-temporal/polyfill'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  MAX_SELECTED_TIME_ZONES,
  searchTimeZoneDefinitions,
} from '../data/timeZoneRegistry'
import { getRegionPickerLabel, UI_TEXT } from '../i18n'
import {
  convertInstant,
  hasMinutePrecisionAcrossTimeZones,
} from '../lib/timeConversion'
import type { Locale } from '../types'

interface RegionPickerDialogProps {
  instant: Temporal.Instant
  locale: Locale
  onClose: () => void
  onToggleZone: (zoneId: string) => void
  selectedZoneIds: string[]
}

export function RegionPickerDialog({
  instant,
  locale,
  onClose,
  onToggleZone,
  selectedZoneIds,
}: RegionPickerDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const text = UI_TEXT[locale]
  const foundIds = useMemo(
    () => searchTimeZoneDefinitions(query, locale, 10).map((zone) => zone.id),
    [locale, query],
  )
  const results = useMemo(() => {
    const ids = query.trim()
      ? foundIds
      : [...new Set([...selectedZoneIds, ...foundIds])]
    return convertInstant(instant, locale, ids)
  }, [foundIds, instant, locale, query, selectedZoneIds])

  useEffect(() => {
    searchRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'input:not(:disabled), button:not(:disabled)',
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
      >
        <header className="region-picker-header">
          <h2 id="region-picker-title">{text.regions}</h2>
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

        <div className="region-search-wrap">
          <input
            ref={searchRef}
            className="region-search"
            type="search"
            value={query}
            aria-label={text.searchRegions}
            placeholder={text.searchRegionsPlaceholder}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="region-options">
          {results.map((result) => {
            const label = getRegionPickerLabel(result, locale)
            const selected = selectedZoneIds.includes(result.id)
            const onlySelection = selected && selectedZoneIds.length === 1
            const atLimit =
              !selected && selectedZoneIds.length >= MAX_SELECTED_TIME_ZONES
            const unsupportedPrecision =
              !selected &&
              !hasMinutePrecisionAcrossTimeZones(instant, [result.id])
            const disabled = onlySelection || atLimit || unsupportedPrecision
            const disabledReason = onlySelection
              ? text.regionsMinimum
              : atLimit
                ? text.regionsLimit
                : unsupportedPrecision
                  ? text.unsupportedPrecision
                  : undefined
            const context = [result.countryName, result.mainCities?.[0], result.id]
              .filter((value, index, values) =>
                Boolean(value) && values.indexOf(value) === index,
              )
              .join(' · ')

            return (
              <button
                key={result.id}
                className={`region-option${selected ? ' is-selected' : ''}`}
                type="button"
                aria-pressed={selected}
                aria-label={`${label}, ${context}${disabledReason ? `, ${disabledReason}` : ''}`}
                disabled={disabled}
                title={disabledReason}
                onClick={() => onToggleZone(result.id)}
              >
                <span className="region-option-identity">
                  <span className="region-option-name">
                    {label}
                  </span>
                  <span className="region-option-context">{context}</span>
                </span>
                <span className="region-option-code">
                  {label === result.utcOffsetLabel
                    ? result.timeZoneAbbreviation
                    : `${result.utcOffsetLabel} · ${result.timeZoneAbbreviation}`}
                </span>
                <span className="region-option-check" aria-hidden="true">
                  <svg viewBox="0 0 18 18">
                    <path d="m4.3 9.2 3 3 6.4-6.4" />
                  </svg>
                </span>
              </button>
            )
          })}
          {!results.length ? (
            <p className="region-options-empty" role="status">
              {text.noRegions}
            </p>
          ) : null}
        </div>

        <footer className="region-picker-footer">
          <span className="region-picker-count">
            {text.selectedRegions(selectedZoneIds.length, MAX_SELECTED_TIME_ZONES)}
          </span>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
