import type { ManagedSkill, Skill } from '@/api/client'

export type InstalledSkillListItem =
  | {
      kind: 'editable'
      name: string
      description: string
      sourceLabel: string
      skill: ManagedSkill
      sortTimestamp?: string
    }
  | {
      kind: 'installed'
      name: string
      description: string
      sourceLabel: string
      skill: Skill
      sortTimestamp?: string
    }

export function compareByNewestThenName(left: { name: string; sortTimestamp?: string }, right: { name: string; sortTimestamp?: string }) {
  const leftParsed = left.sortTimestamp ? Date.parse(left.sortTimestamp) : Number.NaN
  const rightParsed = right.sortTimestamp ? Date.parse(right.sortTimestamp) : Number.NaN
  const leftTime = Number.isFinite(leftParsed) ? leftParsed : Number.NEGATIVE_INFINITY
  const rightTime = Number.isFinite(rightParsed) ? rightParsed : Number.NEGATIVE_INFINITY

  if (leftTime !== rightTime) {
    return rightTime - leftTime
  }

  return left.name.localeCompare(right.name)
}
