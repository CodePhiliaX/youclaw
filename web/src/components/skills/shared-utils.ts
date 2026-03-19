import type { ManagedSkill, Skill } from '@/api/client'
import type { useI18n } from '@/i18n'

export function getSkillSourceBadges(skill: Skill | ManagedSkill, t: ReturnType<typeof useI18n>['t']) {
  const labels: string[] = []

  if (skill.catalogGroup === 'user') {
    labels.push(t.skills.groupUser)
    if (skill.userSkillKind === 'external') {
      labels.push(t.skills.groupExternal)
      if (skill.externalSource === 'marketplace') labels.push(t.skills.sourceMarketplace)
      if (skill.externalSource === 'imported') labels.push(t.skills.sourceImported)
      if (skill.externalSource === 'manual') labels.push(t.skills.sourceManual)
    } else if (skill.userSkillKind === 'custom') {
      labels.push(t.skills.groupCustom)
    }
    return labels
  }

  labels.push(t.skills.groupBuiltin)
  if (skill.source === 'workspace') {
    labels.push(t.skills.workspace)
  }

  return labels
}
