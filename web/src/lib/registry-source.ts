import type { Locale } from '@/i18n'
import type { MarketplaceOrder, MarketplaceSort, RegistrySelectableSource, RegistrySourceInfo } from '@/api/client'

type RemoteRegistrySource = Exclude<RegistrySelectableSource, 'recommended'>
const hiddenMarketplaceSorts: MarketplaceSort[] = ['name']

export function resolveLocaleDefaultRegistrySource(locale: Locale): RegistrySelectableSource {
  return locale === 'zh' ? 'tencent' : 'clawhub'
}

export function resolvePreferredRemoteRegistrySource(
  availableSources: Array<Pick<RegistrySourceInfo, 'id'>>,
  locale: Locale,
): RemoteRegistrySource {
  const localeDefault = resolveLocaleDefaultRegistrySource(locale)
  if (localeDefault !== 'recommended' && availableSources.some((source) => source.id === localeDefault)) {
    return localeDefault
  }

  const firstRemote = availableSources.find((source) => source.id !== 'recommended')?.id
  return firstRemote === 'tencent' ? 'tencent' : 'clawhub'
}

export function resolvePreferredRegistrySource(
  availableSources: Array<Pick<RegistrySourceInfo, 'id'>>,
  preferredSource: RegistrySelectableSource | undefined,
  locale: Locale,
): RegistrySelectableSource {
  if (preferredSource && availableSources.some((source) => source.id === preferredSource)) {
    return preferredSource
  }
  return resolvePreferredRemoteRegistrySource(availableSources, locale)
}

export function getRegistrySourceLabel(source: RegistrySelectableSource, sources: RegistrySourceInfo[]): string {
  return sources.find((item) => item.id === source)?.label
    ?? (source === 'recommended' ? 'Recommended' : source === 'tencent' ? 'Tencent' : 'ClawHub')
}

export function getRegistrySourceInfo(source: RegistrySelectableSource, sources: RegistrySourceInfo[]): RegistrySourceInfo | undefined {
  return sources.find((item) => item.id === source)
}

export function getAvailableMarketplaceSorts(source: RegistrySelectableSource, sources: RegistrySourceInfo[]): MarketplaceSort[] {
  const info = getRegistrySourceInfo(source, sources)
  return info?.capabilities.sorts.filter((sort) => !hiddenMarketplaceSorts.includes(sort)) ?? []
}

export function getDefaultMarketplaceSort(source: RegistrySelectableSource, sources: RegistrySourceInfo[]): MarketplaceSort | undefined {
  const info = getRegistrySourceInfo(source, sources)
  if (!info) {
    return undefined
  }

  const availableSorts = getAvailableMarketplaceSorts(source, sources)
  if (info.capabilities.defaultSort && availableSorts.includes(info.capabilities.defaultSort)) {
    return info.capabilities.defaultSort
  }

  return availableSorts[0]
}

export function resolveMarketplaceSort(
  source: RegistrySelectableSource,
  sources: RegistrySourceInfo[],
  sort: MarketplaceSort | undefined,
): MarketplaceSort | undefined {
  const availableSorts = getAvailableMarketplaceSorts(source, sources)
  if (sort && availableSorts.includes(sort)) {
    return sort
  }
  return getDefaultMarketplaceSort(source, sources)
}

export function resolveMarketplaceOrder(sort: MarketplaceSort | undefined, order: MarketplaceOrder | undefined): MarketplaceOrder {
  if (order === 'asc' || order === 'desc') {
    return order
  }
  return sort === 'name' ? 'asc' : 'desc'
}

export function resolveMarketplaceActionSource(
  selectedSource: RegistrySelectableSource | undefined,
  availableSources: Array<Pick<RegistrySourceInfo, 'id'>>,
  locale: Locale,
): RemoteRegistrySource {
  if (selectedSource === 'recommended') {
    const localeDefault = resolveLocaleDefaultRegistrySource(locale)
    if (localeDefault !== 'recommended' && availableSources.some((source) => source.id === localeDefault)) {
      return localeDefault
    }
  }

  if (selectedSource && selectedSource !== 'recommended') {
    return selectedSource
  }
  return resolvePreferredRemoteRegistrySource(availableSources, locale)
}
