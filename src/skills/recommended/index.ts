import { readFileSync } from 'node:fs'
import {
  recommendationSourceFileOrder,
  type RecommendationSourceCategory,
} from '../recommendation-sources/index.ts'

export const recommendedCategoryOrder = recommendationSourceFileOrder

export type RecommendedCategory = RecommendationSourceCategory

export interface RecommendedEntry {
  slug: string
  displayName: string
  summary: string
  category: RecommendedCategory
  tags: string[]
}

type RecommendedEntryInput = Partial<RecommendedEntry> & Record<string, unknown>

export type RecommendedShardMap = Record<RecommendedCategory, RecommendedEntry[]>

function loadRecommendedShard(category: RecommendedCategory): RecommendedEntry[] {
  const raw = JSON.parse(
    readFileSync(new URL(`./${category}.json`, import.meta.url), 'utf-8'),
  ) as RecommendedEntryInput[]

  if (!Array.isArray(raw)) {
    throw new Error(`Recommended shard "${category}" must contain an array`)
  }

  return raw.map((entry, index) => normalizeRecommendedEntry(category, entry, index))
}

function normalizeRecommendedEntry(
  category: RecommendedCategory,
  entry: RecommendedEntryInput,
  index: number,
): RecommendedEntry {
  const slug = typeof entry.slug === 'string' ? entry.slug.trim() : ''
  const displayName = typeof entry.displayName === 'string' ? entry.displayName.trim() : ''
  const summary = typeof entry.summary === 'string' ? entry.summary.trim() : ''
  const entryCategory = typeof entry.category === 'string' ? entry.category.trim() : ''
  const tags = Array.isArray(entry.tags)
    ? entry.tags
      .map((tag) => String(tag).trim())
      .filter((tag) => tag.length > 0)
    : []

  if (!slug || !displayName || !summary) {
    throw new Error(`Recommended shard "${category}" has an invalid entry at index ${index}`)
  }

  if (entryCategory !== category) {
    throw new Error(`Recommended shard "${category}" contains "${slug}" with mismatched category "${entryCategory}"`)
  }

  if (tags.length === 0) {
    throw new Error(`Recommended shard "${category}" contains "${slug}" without tags`)
  }

  return {
    slug,
    displayName,
    summary,
    category,
    tags,
  }
}

export const recommendedShards = Object.fromEntries(
  recommendedCategoryOrder.map((category) => [category, loadRecommendedShard(category)]),
) as RecommendedShardMap

const recommendedSkillsData = recommendedCategoryOrder.flatMap((category) => recommendedShards[category])

export default recommendedSkillsData
