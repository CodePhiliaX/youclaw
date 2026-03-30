import type { MarketplacePage, MarketplaceSkill, MarketplaceSkillDetail } from '@/api/client'
import type { Translations } from '@/i18n/types'
import { getVisibleMarketplaceItems } from '@/lib/marketplace-updates'

export type MarketplaceCardMetricKey =
  | 'latestVersion'
  | 'installedVersion'
  | 'downloads'
  | 'stars'
  | 'installs'
  | 'updatedAt'

export type MarketplaceCardMetricKind = 'text' | 'number' | 'date'

export interface MarketplaceCardMetricViewModel {
  key: MarketplaceCardMetricKey
  kind: MarketplaceCardMetricKind
  label: string
  value: string | number
  testId?: string
}

export interface MarketplaceCardViewModel {
  slug: string
  displayName: string
  summary: string
  installed: boolean
  installedSkillName?: string
  installedVersion?: string
  latestVersion?: string | null
  hasUpdate: boolean
  downloads?: number | null
  stars?: number | null
  installs?: number | null
  metrics: MarketplaceCardMetricViewModel[]
}

export interface MarketplaceInstallDialogViewModel {
  displayName: string
  externalUrl: string | null
  summary: string
  stats: Array<{ key: string; label: string; value: string | number }>
  authorName: string | null
  authorImage: string | null
  isSuspicious: boolean
  isMalwareBlocked: boolean
}

export interface MarketplaceResultsViewModel {
  isSearching: boolean
  hasItems: boolean
  canLoadMore: boolean
  flatItems: MarketplaceCardViewModel[]
}

function formatMarketplaceVersion(version: string) {
  return version.startsWith('v') ? version : `v${version}`
}

export function toMarketplaceCardViewModel(skill: MarketplaceSkill, t: Translations): MarketplaceCardViewModel {
  const metrics: MarketplaceCardMetricViewModel[] = []

  if (typeof skill.downloads === 'number') {
    metrics.push({
      key: 'downloads',
      kind: 'number',
      label: t.skills.marketplaceDownloadsLabel,
      value: skill.downloads,
      testId: `marketplace-downloads-${skill.slug}`,
    })
  }

  if (typeof skill.stars === 'number') {
    metrics.push({
      key: 'stars',
      kind: 'number',
      label: t.skills.marketplaceStarsLabel,
      value: skill.stars,
      testId: `marketplace-stars-${skill.slug}`,
    })
  }

  if (skill.latestVersion) {
    metrics.push({
      key: 'latestVersion',
      kind: 'text',
      label: t.skills.marketplaceVersionLabel,
      value: formatMarketplaceVersion(skill.latestVersion),
      testId: `marketplace-latest-version-${skill.slug}`,
    })
  }

  return {
    slug: skill.slug,
    displayName: skill.displayName,
    summary: skill.summary,
    installed: skill.installed,
    installedSkillName: skill.installedSkillName,
    installedVersion: skill.installedVersion,
    latestVersion: skill.latestVersion,
    hasUpdate: skill.hasUpdate,
    downloads: skill.downloads ?? null,
    stars: skill.stars ?? null,
    installs: skill.installs ?? null,
    metrics,
  }
}

export function toMarketplaceInstallDialogFallbackViewModel(viewModel: MarketplaceCardViewModel, t: Translations): MarketplaceInstallDialogViewModel {
  const stats: Array<{ key: string; label: string; value: string | number }> = []

  if (typeof viewModel.downloads === 'number') {
    stats.push({ key: 'downloads', label: t.skills.marketplaceDownloadsLabel, value: viewModel.downloads })
  }

  if (typeof viewModel.stars === 'number') {
    stats.push({ key: 'stars', label: t.skills.marketplaceStarsLabel, value: viewModel.stars })
  }

  if (typeof viewModel.installs === 'number') {
    stats.push({ key: 'installs', label: t.skills.marketplaceInstallsLabel, value: viewModel.installs })
  }

  return {
    displayName: viewModel.displayName,
    externalUrl: null,
    summary: viewModel.summary,
    stats,
    authorName: null,
    authorImage: null,
    isSuspicious: false,
    isMalwareBlocked: false,
  }
}

export function toMarketplaceInstallDialogViewModel(detail: MarketplaceSkillDetail, t: Translations): MarketplaceInstallDialogViewModel {
  const stats: Array<{ key: string; label: string; value: string | number }> = []

  if (typeof detail.downloads === 'number') {
    stats.push({ key: 'downloads', label: t.skills.marketplaceDownloadsLabel, value: detail.downloads })
  }

  if (typeof detail.stars === 'number') {
    stats.push({ key: 'stars', label: t.skills.marketplaceStarsLabel, value: detail.stars })
  }

  if (typeof detail.installs === 'number') {
    stats.push({ key: 'installs', label: t.skills.marketplaceInstallsLabel, value: detail.installs })
  }

  return {
    displayName: detail.displayName,
    externalUrl: detail.url ?? null,
    summary: detail.summary,
    stats,
    authorName: detail.author?.name ?? detail.author?.handle ?? detail.ownerName ?? null,
    authorImage: detail.author?.image ?? null,
    isSuspicious: Boolean(detail.moderation?.isSuspicious),
    isMalwareBlocked: Boolean(detail.moderation?.isMalwareBlocked),
  }
}

export function toMarketplaceResultsViewModel(
  page: MarketplacePage,
  searchQuery: string,
  appendError: string,
  t: Translations,
): MarketplaceResultsViewModel {
  const isSearching = searchQuery.trim().length > 0
  const visibleItems = getVisibleMarketplaceItems(page)

  return {
    isSearching,
    hasItems: visibleItems.length > 0,
    canLoadMore: Boolean(page.nextCursor) && !appendError,
    flatItems: visibleItems.map((skill) => toMarketplaceCardViewModel(skill, t)),
  }
}
