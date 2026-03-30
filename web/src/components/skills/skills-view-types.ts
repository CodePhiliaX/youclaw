import type { ManagedSkill, Skill } from '@/api/client'

export type InstalledSkillSection = 'builtin' | 'external' | 'custom'

export type InstalledSkillSourceFilter = 'all' | 'builtin' | 'external' | 'custom'

interface InstalledSkillBase {
  name: string
  description: string
  sourceLabel: string
  section: InstalledSkillSection
  sortTimestamp?: string
}

export type InstalledSkillListItem =
  | (InstalledSkillBase & {
      kind: 'editable'
      skill: ManagedSkill
      runtimeSkill: Skill | null
      managedSkill: ManagedSkill
    })
  | (InstalledSkillBase & {
      kind: 'installed'
      skill: Skill
      runtimeSkill: Skill
      managedSkill: ManagedSkill | null
    })

export function isInstalledSkillCustom(item: InstalledSkillListItem) {
  return item.section === 'custom'
}

export function isInstalledSkillEditable(item: InstalledSkillListItem) {
  return Boolean(
    item.managedSkill
    && item.managedSkill.editable
    && item.managedSkill.userSkillKind === 'custom',
  )
}

export function isInstalledSkillDraftOnly(item: InstalledSkillListItem) {
  return Boolean(
    item.managedSkill
    && item.managedSkill.hasDraft
    && !item.managedSkill.hasPublished
    && !item.runtimeSkill,
  )
}

export function resolveInstalledSkillFilter(item: InstalledSkillListItem): Exclude<InstalledSkillSourceFilter, 'all'> {
  if (item.section === 'custom') return 'custom'
  if (item.section === 'builtin') return 'builtin'
  return 'external'
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
