import type { Locale } from '@/i18n'
import type { RegistrySelectableSource, RegistrySourceInfo } from '@/api/client'

export function resolveLocaleDefaultRegistrySource(locale: Locale): RegistrySelectableSource {
  return locale === 'zh' ? 'tencent' : 'clawhub'
}

export function resolvePreferredRegistrySource(
  availableSources: Array<Pick<RegistrySourceInfo, 'id'>>,
  preferredSource: RegistrySelectableSource | undefined,
  locale: Locale,
): RegistrySelectableSource {
  const localeDefault = resolveLocaleDefaultRegistrySource(locale)
  if (preferredSource && availableSources.some((source) => source.id === preferredSource)) {
    return preferredSource
  }
  if (availableSources.some((source) => source.id === localeDefault)) {
    return localeDefault
  }
  return availableSources[0]?.id ?? 'clawhub'
}

export function getRegistrySourceLabel(source: RegistrySelectableSource, sources: RegistrySourceInfo[]): string {
  return sources.find((item) => item.id === source)?.label ?? (source === 'tencent' ? 'Tencent' : 'ClawHub')
}
