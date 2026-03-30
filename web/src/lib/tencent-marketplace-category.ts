import type { MarketplaceSkill, TencentMarketplaceCategory } from '@/api/client'
import type { Translations } from '@/i18n/types'

export type TencentMarketplaceCategoryFilter = 'all' | TencentMarketplaceCategory

export const tencentMarketplaceCategoryOrder: TencentMarketplaceCategory[] = [
  'ai-intelligence',
  'developer-tools',
  'productivity',
  'data-analysis',
  'content-creation',
  'security-compliance',
  'communication-collaboration',
]

const tencentMarketplaceCategorySet = new Set<TencentMarketplaceCategory>(tencentMarketplaceCategoryOrder)

export function isTencentMarketplaceCategory(category: unknown): category is TencentMarketplaceCategory {
  return typeof category === 'string' && tencentMarketplaceCategorySet.has(category as TencentMarketplaceCategory)
}

export function getTencentMarketplaceCategoryLabel(
  category: TencentMarketplaceCategoryFilter,
  t: Translations,
): string {
  switch (category) {
    case 'all':
      return t.skills.marketplaceCategoryAll
    case 'ai-intelligence':
      return t.skills.tencentCategoryAiIntelligence
    case 'developer-tools':
      return t.skills.tencentCategoryDeveloperTools
    case 'productivity':
      return t.skills.tencentCategoryProductivity
    case 'data-analysis':
      return t.skills.tencentCategoryDataAnalysis
    case 'content-creation':
      return t.skills.tencentCategoryContentCreation
    case 'security-compliance':
      return t.skills.tencentCategorySecurityCompliance
    case 'communication-collaboration':
      return t.skills.tencentCategoryCommunicationCollaboration
  }
}

export function filterTencentMarketplaceSkills(
  skills: MarketplaceSkill[],
  filter: TencentMarketplaceCategoryFilter,
): MarketplaceSkill[] {
  if (filter === 'all') {
    return skills
  }

  return skills.filter((skill) => skill.category === filter)
}
