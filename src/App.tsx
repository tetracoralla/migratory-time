import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FloatingActions } from './components/FloatingActions'
import { PreferenceActions } from './components/PreferenceActions'
import { RegionPickerDialog } from './components/RegionPickerDialog'
import { ResultRow } from './components/ResultRow'
import { BEIJING_TIME_ZONE, TIME_ZONES } from './data/timeZones'
import { UI_TEXT } from './i18n'
import { writeClipboardText } from './lib/clipboard'
import {
  getDeferredAction,
  replayDeferredAction,
  type DeferredAction,
} from './lib/deferredAction'
import { startBrowserMinuteTicker } from './lib/liveClock'
import { loadPreferences, savePreferences } from './lib/preferences'
import {
  convertInstant,
  formatEditableDateTimeInput,
  getNowInstant,
  makeCopyText,
  parseEditableDateTime,
  resolveWallTime,
} from './lib/timeConversion'
import type { WallTimeResolution } from './types'

type CopyStatus = 'idle' | 'success' | 'error'
const ACTION_FEEDBACK_DURATION = 1800

type EditSubmission =
  | { status: 'none' }
  | { status: 'invalid' }
  | { status: 'needs-choice' }
  | {
      status: 'committed'
      instant: ReturnType<typeof getNowInstant>
    }

function App() {
  const initialPreferences = useMemo(
    () =>
      loadPreferences(
        typeof window === 'undefined' ? undefined : window.localStorage,
      ),
    [],
  )
  const [referenceInstant, setReferenceInstant] = useState(() => getNowInstant())
  const [isLive, setIsLive] = useState(true)
  const [locale, setLocale] = useState(initialPreferences.locale)
  const [selectedZoneIds, setSelectedZoneIds] = useState(
    initialPreferences.zoneIds,
  )
  const [regionPickerOpen, setRegionPickerOpen] = useState(false)
  const [editingZone, setEditingZone] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [ambiguousResolution, setAmbiguousResolution] =
    useState<Extract<WallTimeResolution, { status: 'ambiguous' }> | null>(null)
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const [resetFeedback, setResetFeedback] = useState(false)
  const [resetSequence, setResetSequence] = useState(0)
  const copyStatusTimer = useRef<number | undefined>(undefined)
  const resetFeedbackTimer = useRef<number | undefined>(undefined)
  const focusFrame = useRef<number | undefined>(undefined)
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const regionButtonRef = useRef<HTMLButtonElement>(null)
  const pendingInteractionCommit = useRef<
    Extract<EditSubmission, { status: 'committed' }> | undefined
  >(undefined)
  const deferredActionAfterAmbiguity = useRef<DeferredAction | undefined>(
    undefined,
  )
  const resumeLiveAfterCancel = useRef(false)

  const text = UI_TEXT[locale]
  const allResults = useMemo(
    () => convertInstant(referenceInstant, locale),
    [locale, referenceInstant],
  )
  const results = useMemo(() => {
    const selected = new Set(selectedZoneIds)
    return allResults.filter((result) => selected.has(result.id))
  }, [allResults, selectedZoneIds])

  useEffect(() => {
    savePreferences(
      typeof window === 'undefined' ? undefined : window.localStorage,
      { locale, zoneIds: selectedZoneIds },
    )
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
    document.title = 'Migratory Time'
  }, [locale, selectedZoneIds])

  useEffect(() => {
    if (!isLive) return

    return startBrowserMinuteTicker(() => {
      setReferenceInstant(getNowInstant())
    })
  }, [isLive])

  useEffect(
    () => () => {
      window.clearTimeout(copyStatusTimer.current)
      window.clearTimeout(resetFeedbackTimer.current)
      window.cancelAnimationFrame(focusFrame.current ?? 0)
    },
    [],
  )

  function setEditButtonRef(zoneId: string, node: HTMLButtonElement | null) {
    if (node) {
      editButtonRefs.current.set(zoneId, node)
    } else {
      editButtonRefs.current.delete(zoneId)
    }
  }

  function restoreFocusToRow(zoneId: string) {
    window.cancelAnimationFrame(focusFrame.current ?? 0)
    focusFrame.current = window.requestAnimationFrame(() => {
      editButtonRefs.current.get(zoneId)?.focus()
    })
  }

  function restoreFocusToEditor() {
    window.cancelAnimationFrame(focusFrame.current ?? 0)
    focusFrame.current = window.requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('.inline-editor input')?.focus()
    })
  }

  function clearEditState() {
    setEditingZone(null)
    setEditValue('')
    setEditError(null)
    setAmbiguousResolution(null)
  }

  function startEdit(zoneId: string) {
    const pendingCommit = pendingInteractionCommit.current
    pendingInteractionCommit.current = undefined
    const visibleResults = pendingCommit
      ? convertInstant(pendingCommit.instant, locale)
      : allResults
    const result = visibleResults.find((item) => item.id === zoneId)
    if (!result) return

    if (pendingCommit) {
      resumeLiveAfterCancel.current = false
    } else if (!editingZone) {
      resumeLiveAfterCancel.current = isLive
    }
    setIsLive(false)
    setEditingZone(zoneId)
    setEditValue(formatEditableDateTimeInput(result.dateTimeValue))
    setEditError(null)
    setAmbiguousResolution(null)
    deferredActionAfterAmbiguity.current = undefined
    window.clearTimeout(resetFeedbackTimer.current)
    setResetFeedback(false)
    setCopyStatus('idle')
  }

  function cancelEdit(restoreFocus = false) {
    const cancelledZone = editingZone
    const shouldResumeLive = resumeLiveAfterCancel.current
    deferredActionAfterAmbiguity.current = undefined
    clearEditState()
    setIsLive(shouldResumeLive)
    if (shouldResumeLive) setReferenceInstant(getNowInstant())
    if (restoreFocus && cancelledZone) restoreFocusToRow(cancelledZone)
  }

  function finishEdit(
    instant: Extract<WallTimeResolution, { status: 'valid' }>['instant'],
    restoreFocus = false,
  ) {
    const finishedZone = editingZone ?? BEIJING_TIME_ZONE
    setReferenceInstant(instant)
    setIsLive(false)
    clearEditState()
    setCopyStatus('idle')
    if (restoreFocus) restoreFocusToRow(finishedZone)

    return {
      status: 'committed',
      instant,
    } satisfies Extract<EditSubmission, { status: 'committed' }>
  }

  function submitEdit(restoreFocus = false): EditSubmission {
    if (!editingZone) return { status: 'none' }

    const parsed = parseEditableDateTime(editValue)
    if (!parsed) {
      setEditError(text.invalidIncomplete)
      return { status: 'invalid' }
    }

    const resolution = resolveWallTime(parsed.date, parsed.time, editingZone)
    if (resolution.status === 'nonexistent') {
      setEditError(text.invalidDateTime)
      return { status: 'invalid' }
    }

    if (resolution.status === 'ambiguous') {
      setEditError(null)
      setAmbiguousResolution(resolution)
      return { status: 'needs-choice' }
    }

    return finishEdit(resolution.instant, restoreFocus)
  }

  function chooseAmbiguous(choice: 'earlier' | 'later') {
    if (!ambiguousResolution) return
    const deferredAction = deferredActionAfterAmbiguity.current
    deferredActionAfterAmbiguity.current = undefined
    const submission = finishEdit(
      ambiguousResolution[choice],
      deferredAction === undefined,
    )

    replayDeferredAction(deferredAction, submission, {
      copy(commit) {
        pendingInteractionCommit.current = commit
        void handleCopy()
      },
      reset: resetToNow,
      editZone(zoneId, commit) {
        pendingInteractionCommit.current = commit
        startEdit(zoneId)
      },
      language: toggleLocale,
      regions: openRegionPicker,
    })
  }

  function toggleLocale() {
    setLocale((currentLocale) => (currentLocale === 'zh' ? 'en' : 'zh'))
    setCopyStatus('idle')
  }

  function openRegionPicker() {
    setRegionPickerOpen(true)
    setCopyStatus('idle')
  }

  const closeRegionPicker = useCallback(() => {
    setRegionPickerOpen(false)
    window.requestAnimationFrame(() => regionButtonRef.current?.focus())
  }, [])

  const toggleZone = useCallback((zoneId: string) => {
    setSelectedZoneIds((currentZoneIds) => {
      const selected = new Set(currentZoneIds)
      if (selected.has(zoneId)) {
        if (selected.size === 1) return currentZoneIds
        selected.delete(zoneId)
      } else {
        selected.add(zoneId)
      }

      return TIME_ZONES.map((zone) => zone.id).filter((id) => selected.has(id))
    })
    setCopyStatus('idle')
  }, [])

  function resetToNow() {
    pendingInteractionCommit.current = undefined
    deferredActionAfterAmbiguity.current = undefined
    window.clearTimeout(copyStatusTimer.current)
    window.clearTimeout(resetFeedbackTimer.current)
    clearEditState()
    setReferenceInstant(getNowInstant())
    setIsLive(true)
    setCopyStatus('idle')
    setResetSequence((sequence) => sequence + 1)
    setResetFeedback(true)
    resetFeedbackTimer.current = window.setTimeout(
      () => setResetFeedback(false),
      ACTION_FEEDBACK_DURATION,
    )
  }

  async function handleCopy() {
    const pendingCommit = pendingInteractionCommit.current
    pendingInteractionCommit.current = undefined
    window.clearTimeout(resetFeedbackTimer.current)
    setResetFeedback(false)
    const copyResults = pendingCommit
      ? convertInstant(pendingCommit.instant, locale).filter((result) =>
          selectedZoneIds.includes(result.id),
        )
      : results
    if (!copyResults.length) return

    const copyText = makeCopyText(copyResults)

    window.clearTimeout(copyStatusTimer.current)
    setCopyStatus('idle')
    try {
      await writeClipboardText(copyText)
      setCopyStatus('success')
      copyStatusTimer.current = window.setTimeout(
        () => setCopyStatus('idle'),
        ACTION_FEEDBACK_DURATION,
      )
    } catch {
      setCopyStatus('error')
    }
  }

  return (
    <main
      onClickCapture={(event) => {
        if (!editingZone) return
        if (
          event.target instanceof Element &&
          event.target.closest('.inline-editor')
        ) {
          return
        }

        const submission = submitEdit()
        if (submission.status === 'needs-choice') {
          deferredActionAfterAmbiguity.current = getDeferredAction(event.target)
          event.preventDefault()
          event.stopPropagation()
          return
        }

        if (submission.status === 'invalid') {
          deferredActionAfterAmbiguity.current = undefined
          event.preventDefault()
          event.stopPropagation()
          restoreFocusToEditor()
          return
        }

        if (submission.status === 'committed') {
          pendingInteractionCommit.current = submission
          window.setTimeout(() => {
            if (pendingInteractionCommit.current === submission) {
              pendingInteractionCommit.current = undefined
            }
          }, 0)
        }
      }}
    >
      <h1 className="sr-only">Migratory Time</h1>

      <section className="workspace" aria-label={text.appLabel}>
        <ol className="results" aria-label={text.resultsLabel}>
          {results.map((result) => (
            <ResultRow
              key={result.id}
              ambiguous={
                editingZone === result.id && ambiguousResolution !== null
              }
              editValue={editingZone === result.id ? editValue : ''}
              editError={editingZone === result.id ? editError : null}
              editButtonRef={(node) => setEditButtonRef(result.id, node)}
              isEditing={editingZone === result.id}
              locale={locale}
              result={result}
              onCancelEdit={cancelEdit}
              onChooseAmbiguous={chooseAmbiguous}
              onEditValueChange={(value) => {
                setEditValue(formatEditableDateTimeInput(value))
                setEditError(null)
                setAmbiguousResolution(null)
                deferredActionAfterAmbiguity.current = undefined
              }}
              onStartEdit={() => startEdit(result.id)}
              onSubmitEdit={(restoreFocus) => {
                submitEdit(restoreFocus)
              }}
            />
          ))}
        </ol>
      </section>

      <FloatingActions
        copyStatus={copyStatus}
        isLive={isLive}
        locale={locale}
        onCopy={() => void handleCopy()}
        onReset={resetToNow}
        resetFeedback={resetFeedback}
        resetSequence={resetSequence}
      />

      <PreferenceActions
        locale={locale}
        regionButtonRef={regionButtonRef}
        regionsOpen={regionPickerOpen}
        onOpenRegions={openRegionPicker}
        onToggleLocale={toggleLocale}
      />

      {regionPickerOpen ? (
        <RegionPickerDialog
          locale={locale}
          results={allResults}
          selectedZoneIds={selectedZoneIds}
          onClose={closeRegionPicker}
          onToggleZone={toggleZone}
        />
      ) : null}
    </main>
  )
}

export default App
