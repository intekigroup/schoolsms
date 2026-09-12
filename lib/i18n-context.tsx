'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'
import { t as translate, type Locale, type Vars } from '@/lib/i18n'

interface I18nContextType {
  locale: Locale
  /** Switches the UI language and remembers it on the account, so it survives a reload and follows the user to another device. */
  setLocale: (l: Locale) => void
  t: (key: string, vars?: Vars) => string
  /** State only — used once on mount to adopt the account's saved language without re-saving it. */
  hydrateLocale: (l: Locale) => void
}

const I18nContext = createContext<I18nContextType>({
  locale: 'en',
  setLocale: () => {},
  t: (key: string) => key,
  hydrateLocale: () => {},
})

export function I18nProvider({ children, defaultLocale = 'en' }: { children: React.ReactNode; defaultLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale)
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try { document.cookie = `locale=${l}; path=/; max-age=31536000; samesite=lax` } catch {}
    // Persist on the account; a failure here only means the choice is forgotten on the next sign-in.
    fetch('/api/auth/locale', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: l }) }).catch(() => {})
  }, [])
  const tFn = useCallback((key: string, vars?: Vars) => translate(key, locale, vars), [locale])

  return (
    <I18nContext.Provider value={{ locale, setLocale, t: tFn, hydrateLocale: setLocaleState }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  return useContext(I18nContext)
}
