import type { MarketplaceCategory, MarketplaceSkill } from '@/api/client'
import type { Translations } from '@/i18n/types'

export type DisplayMarketplaceCategory =
  | 'agent'
  | 'memory'
  | 'documents'
  | 'productivity'
  | 'security'
  | 'integrations'
  | 'media'
  | 'data'
  | 'coding'
  | 'other'

export const marketplaceCategoryOrder: DisplayMarketplaceCategory[] = [
  'agent',
  'memory',
  'documents',
  'productivity',
  'security',
  'integrations',
  'media',
  'data',
  'coding',
  'other',
]

const displayMarketplaceCategorySet = new Set<DisplayMarketplaceCategory>(marketplaceCategoryOrder)

export function normalizeMarketplaceCategory(category?: MarketplaceCategory): DisplayMarketplaceCategory {
  if (category === 'search') return 'data'
  if (category === 'browser') return 'integrations'
  if (!category || !displayMarketplaceCategorySet.has(category as DisplayMarketplaceCategory)) {
    return 'other'
  }
  return category as DisplayMarketplaceCategory
}

export function getMarketplaceCategoryLabels(t: Translations): Record<DisplayMarketplaceCategory, string> {
  return {
    agent: t.skills.categoryAgent,
    memory: t.skills.categoryMemory,
    documents: t.skills.categoryDocuments,
    productivity: t.skills.categoryProductivity,
    security: t.skills.categorySecurity,
    integrations: t.skills.categoryIntegrations,
    media: t.skills.categoryMedia,
    data: t.skills.categoryData,
    coding: t.skills.categoryCoding,
    other: t.skills.categoryOther,
  }
}

export function groupMarketplaceSkillsByCategory(skills: MarketplaceSkill[]) {
  const buckets = new Map<DisplayMarketplaceCategory, MarketplaceSkill[]>()
  for (const category of marketplaceCategoryOrder) {
    buckets.set(category, [])
  }

  for (const skill of skills) {
    const category = normalizeMarketplaceCategory(skill.category)
    buckets.get(category)?.push(skill)
  }

  return marketplaceCategoryOrder
    .map((category) => ({ category, items: buckets.get(category) ?? [] }))
    .filter((group) => group.items.length > 0)
}
