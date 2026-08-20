import type { RefObject } from 'react'
import { UI_TEXT } from '../i18n'
import type { Locale } from '../types'

interface PreferenceActionsProps {
  locale: Locale
  regionButtonRef: RefObject<HTMLButtonElement | null>
  regionsOpen: boolean
  onOpenRegions: () => void
  onToggleLocale: () => void
}

export function PreferenceActions({
  locale,
  regionButtonRef,
  regionsOpen,
  onOpenRegions,
  onToggleLocale,
}: PreferenceActionsProps) {
  const text = UI_TEXT[locale]

  return (
    <div className="preference-actions" aria-label={text.appLabel}>
      <button
        className="floating-action preference-action"
        type="button"
        aria-label={text.switchLanguage}
        data-time-action="language"
        data-tooltip={text.switchLanguage}
        onClick={onToggleLocale}
      >
        <span className="language-icon" aria-hidden="true">
          <span>文</span>
          <span>A</span>
        </span>
      </button>
      <button
        ref={regionButtonRef}
        className="floating-action preference-action"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={regionsOpen}
        aria-label={text.regions}
        data-time-action="regions"
        data-tooltip={text.regions}
        onClick={onOpenRegions}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8" />
          <path d="M4 12h16M12 4c2.1 2.2 3.2 4.9 3.2 8S14.1 17.8 12 20M12 4c-2.1 2.2-3.2 4.9-3.2 8S9.9 17.8 12 20" />
        </svg>
      </button>
    </div>
  )
}
