import { useEffect, useMemo, useRef, useState } from 'react'
import { TIME_ZONES } from '../../../src/data/timeZones'
import { getRegionLabel, UI_TEXT } from '../../../src/i18n'
import {
  convertInstant,
  formatEditableDateTimeInput,
  parseEditableDateTime,
  resolveWallTime,
} from '../../../src/lib/timeConversion'
import { getTemporal } from '../../../src/lib/temporal'
import type { Locale, WallTimeResolution } from '../../../src/types'
import { docsApi } from './docApi'
import { useViewerLocale } from './useViewerLocale'
import {
  createDefaultWidgetRecord,
  normalizeWidgetRecord,
  type WidgetRecord,
} from './widgetModel'
import './styles.css'

const copy = {
  zh: {
    stage: '阶段名称',
    untitled: '时间节点',
    regions: '显示地区',
    invalid: '日期或时间无效',
  },
  en: {
    stage: 'Stage name',
    untitled: 'Time milestone',
    regions: 'Regions',
    invalid: 'Invalid date or local time',
  },
} as const

function LanguageIcon() {
  return (
    <span className="docs-language-icon" aria-hidden="true">
      <span>文</span>
      <span>A</span>
    </span>
  )
}

function RegionIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.1 2.2 3.2 4.9 3.2 8S14.1 17.8 12 20M12 4c-2.1 2.2-3.2 4.9-3.2 8S9.9 17.8 12 20" />
    </svg>
  )
}

export default function App() {
  const { locale, toggleLocale } = useViewerLocale()
  const [record, setRecord] = useState<WidgetRecord>(() =>
    createDefaultWidgetRecord(),
  )
  const [ready, setReady] = useState(false)
  const [editable, setEditable] = useState(false)
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editError, setEditError] = useState(false)
  const [ambiguousResolution, setAmbiguousResolution] =
    useState<Extract<WallTimeResolution, { status: 'ambiguous' }> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const recordInitializedRef = useRef(false)
  const text = UI_TEXT[locale]
  const localCopy = copy[locale]

  const instant = useMemo(() => {
    const Temporal = getTemporal()
    return Temporal.Instant.from(record.instant)
  }, [record.instant])
  const allResults = useMemo(
    () => convertInstant(instant, locale),
    [instant, locale],
  )
  const results = useMemo(() => {
    const selected = new Set(record.zoneIds)
    return allResults.filter((result) => selected.has(result.id))
  }, [allResults, record.zoneIds])

  useEffect(() => {
    let active = true
    const handleRecordChange = (nextRecord: Record<string, unknown>) => {
      if (active) {
        recordInitializedRef.current = Object.keys(nextRecord).length > 0
        setRecord(normalizeWidgetRecord(nextRecord))
      }
    }

    void (async () => {
      const [storedRecord, documentRef] = await Promise.all([
        docsApi.Record.getRecord(),
        docsApi.getActiveDocumentRef(),
      ])
      if (!active) return

      const normalized = normalizeWidgetRecord(storedRecord)
      recordInitializedRef.current = Object.keys(storedRecord).length > 0
      setRecord(normalized)
      const permission = await docsApi.Service.Permission.getDocumentPermission(
        documentRef,
      )
      if (!active) return
      setEditable(permission.editable)
      setReady(true)
      await docsApi.Record.onRecordChange(handleRecordChange)
      await docsApi.LifeCycle.notifyAppReady()
    })().catch(() => {
      if (active) {
        setReady(true)
        setEditable(true)
      }
    })

    return () => {
      active = false
      void docsApi.Record.offRecordChange(handleRecordChange)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    const nextHeight = Math.min(
      590,
      76 + results.length * 56 + (ambiguousResolution ? 24 : 0),
    )
    void docsApi.Bridge.updateHeight(nextHeight).catch(() => undefined)
  }, [ambiguousResolution, ready, results.length])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editingZoneId])

  async function save(next: WidgetRecord) {
    setRecord(next)
    const mutation = recordInitializedRef.current ? 'replace' : 'insert'
    await docsApi.Record.applyTransaction((operation) => {
      operation[mutation](['instant'], next.instant)
      operation[mutation](['stageLabel'], next.stageLabel)
      operation[mutation](['version'], next.version)
      operation[mutation](['zoneIds'], next.zoneIds)
    })
    recordInitializedRef.current = true
  }

  function beginEdit(zoneId: string) {
    if (!editable) return
    const result = allResults.find((candidate) => candidate.id === zoneId)
    if (!result) return
    setEditingZoneId(zoneId)
    setEditValue(formatEditableDateTimeInput(result.dateTimeValue))
    setEditError(false)
    setAmbiguousResolution(null)
  }

  async function commitEdit() {
    if (!editingZoneId) return
    const parsed = parseEditableDateTime(editValue)
    if (!parsed) {
      setEditError(true)
      return
    }
    const resolution = resolveWallTime(parsed.date, parsed.time, editingZoneId)
    if (resolution.status === 'ambiguous') {
      setEditError(false)
      setAmbiguousResolution(resolution)
      return
    }
    if (resolution.status !== 'valid') {
      setEditError(true)
      setAmbiguousResolution(null)
      return
    }
    await save({
      ...record,
      instant: resolution.instant.toString(),
    })
    setEditingZoneId(null)
    setEditError(false)
    setAmbiguousResolution(null)
  }

  async function commitAmbiguous(choice: 'earlier' | 'later') {
    if (!ambiguousResolution) return
    await save({
      ...record,
      instant: ambiguousResolution[choice].toString(),
    })
    setEditingZoneId(null)
    setEditError(false)
    setAmbiguousResolution(null)
  }

  async function openRegions() {
    if (!editable) return
    const response = await docsApi.View.Action.openModal({
      data: { locale, zoneIds: record.zoneIds },
      key: 'regions',
      title: localCopy.regions,
      width: 420,
    })
    if (response.source !== 'api-invoke' || !response.data) return
    const next = normalizeWidgetRecord({
      ...record,
      zoneIds: response.data.zoneIds,
    })
    await save(next)
  }

  if (!ready) return <div className="docs-loading" />

  return (
    <main className="docs-widget">
      <header className="docs-header">
        {editable ? (
          <input
            className="docs-stage-input"
            aria-label={localCopy.stage}
            maxLength={40}
            placeholder={localCopy.untitled}
            value={record.stageLabel}
            onChange={(event) =>
              setRecord({ ...record, stageLabel: event.target.value })
            }
            onBlur={() => void save(record)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
          />
        ) : (
          <span className="docs-stage-label">
            {record.stageLabel || localCopy.untitled}
          </span>
        )}
        <div className="docs-controls">
          <button
            className="docs-icon-button"
            type="button"
            aria-label={text.switchLanguage}
            title={text.switchLanguage}
            onClick={toggleLocale}
          >
            <LanguageIcon />
          </button>
          {editable ? (
            <button
              className="docs-icon-button"
              type="button"
              aria-label={localCopy.regions}
              title={localCopy.regions}
              onClick={() => void openRegions()}
            >
              <RegionIcon />
            </button>
          ) : null}
        </div>
      </header>

      <ol className="docs-time-list">
        {results.map((result) => (
          <li className="docs-time-row" key={result.id}>
            <span className="docs-region">
              {getRegionLabel(result, locale)}
            </span>
            <span className="docs-utc">{result.utcOffsetLabel}</span>
            {editingZoneId === result.id ? (
              <div className="docs-inline-editor">
                <input
                  ref={inputRef}
                  aria-invalid={editError}
                  aria-label={text.editDateTime(getRegionLabel(result, locale))}
                  value={editValue}
                  onChange={(event) => {
                    setEditValue(formatEditableDateTimeInput(event.target.value))
                    setEditError(false)
                    setAmbiguousResolution(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setEditingZoneId(null)
                      setEditError(false)
                      setAmbiguousResolution(null)
                    }
                    if (event.key === 'Enter') void commitEdit()
                  }}
                  onBlur={() => void commitEdit()}
                />
                {editError ? (
                  <span className="docs-edit-error">{localCopy.invalid}</span>
                ) : null}
                {ambiguousResolution ? (
                  <span
                    className="docs-ambiguity"
                    role="group"
                    aria-label={text.ambiguity}
                  >
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => void commitAmbiguous('earlier')}
                    >
                      {text.ambiguityEarlier}
                    </button>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => void commitAmbiguous('later')}
                    >
                      {text.ambiguityLater}
                    </button>
                  </span>
                ) : null}
              </div>
            ) : (
              <button
                className="docs-time-value"
                type="button"
                disabled={!editable}
                aria-label={text.editZone(getRegionLabel(result, locale))}
                onClick={() => beginEdit(result.id)}
              >
                <time dateTime={result.dateTimeValue}>
                  {result.dateTimeValue.replace('T', ' ')}
                </time>
              </button>
            )}
          </li>
        ))}
      </ol>
      <footer className="docs-brand">Migratory Time · openAdam</footer>
    </main>
  )
}
