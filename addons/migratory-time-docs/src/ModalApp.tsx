import { useEffect, useState } from 'react'
import { TIME_ZONES } from '../../../src/data/timeZones'
import type { Locale } from '../../../src/types'
import { docsApi } from './docApi'
import { toggleWidgetZone } from './widgetModel'
import './styles.css'

interface ModalData {
  locale: Locale
  zoneIds: string[]
}

export default function ModalApp() {
  const [data, setData] = useState<ModalData | null>(null)

  useEffect(() => {
    void docsApi.Bridge.getInitData().then((value) => {
      const locale = value?.locale === 'en' ? 'en' : 'zh'
      const zoneIds = Array.isArray(value?.zoneIds)
        ? value.zoneIds
        : TIME_ZONES.map((zone) => zone.id)
      setData({ locale, zoneIds })
    })
  }, [])

  if (!data) return null

  return (
    <main className="docs-modal">
      <div className="docs-modal-options">
        {TIME_ZONES.map((zone) => {
          const selected = data.zoneIds.includes(zone.id)
          const onlySelection = selected && data.zoneIds.length === 1
          return (
            <button
              key={zone.id}
              className={`docs-modal-option${selected ? ' is-selected' : ''}`}
              type="button"
              aria-pressed={selected}
              disabled={onlySelection}
              onClick={() =>
                setData({
                  ...data,
                  zoneIds: toggleWidgetZone(data.zoneIds, zone.id),
                })
              }
            >
              <span>{data.locale === 'zh' ? zone.label : zone.labelEn}</span>
              <span className="docs-modal-check" aria-hidden="true">✓</span>
            </button>
          )
        })}
      </div>
      <div className="docs-modal-footer">
        <button
          className="docs-modal-primary"
          type="button"
          onClick={() => void docsApi.View.Action.closeModal({ zoneIds: data.zoneIds })}
        >
          {data.locale === 'zh' ? '完成' : 'Done'}
        </button>
      </div>
    </main>
  )
}
