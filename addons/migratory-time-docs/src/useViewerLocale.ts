import { useEffect, useState } from 'react'
import type { Locale } from '../../../src/types'
import { docsApi } from './docApi'

const STORAGE_KEY = 'migratory-time-docs-locale'

export function useViewerLocale() {
  const [locale, setLocale] = useState<Locale>(() => {
    return window.localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'zh'
  })

  useEffect(() => {
    let active = true
    void docsApi.Env.Language.getLanguage()
      .then((language) => {
        if (
          active &&
          window.localStorage.getItem(STORAGE_KEY) === null
        ) {
          setLocale(language.startsWith('zh') ? 'zh' : 'en')
        }
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  function toggleLocale() {
    setLocale((current) => {
      const next = current === 'zh' ? 'en' : 'zh'
      window.localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }

  return { locale, toggleLocale }
}
