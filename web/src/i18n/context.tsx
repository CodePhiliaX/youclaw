import { type ReactNode } from 'react'
import { en } from './en'
import { zh } from './zh'
import type { Translations } from './types'
import { useAppPreferencesStore } from '@/stores/app'
import { I18nContext, type Locale } from './ctx'

const locales: Record<Locale, Translations> = { en, zh }

export type { Locale } from './ctx'

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useAppPreferencesStore((s) => s.locale)
  const setLocale = useAppPreferencesStore((s) => s.setLocale)

  return (
    <I18nContext.Provider value={{ locale, t: locales[locale], setLocale }}>
      {children}
    </I18nContext.Provider>
  )
}
