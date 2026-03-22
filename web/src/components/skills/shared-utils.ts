import type { ManagedSkill, Skill } from '@/api/client'
import type { useI18n } from '@/i18n'

export function getExternalSkillSourceLabel(skill: Skill | ManagedSkill, t: ReturnType<typeof useI18n>['t']) {
  if (skill.externalSource === 'marketplace') {
    if (skill.registryMeta?.source === 'clawhub') return t.settings.registrySourceClawhub
    if (skill.registryMeta?.source === 'tencent') return t.settings.registrySourceTencent
    return t.skills.sourceMarketplace
  }

  if (skill.externalSource === 'imported') {
    if (skill.registryMeta?.provider === 'raw-url' || skill.registryMeta?.source === 'raw-url') {
      return t.skills.sourceRawUrlImport
    }
    if (skill.registryMeta?.provider === 'github' || skill.registryMeta?.source === 'github') {
      return t.skills.sourceGitHubImport
    }
    return t.skills.sourceImported
  }

  if (skill.externalSource === 'manual') return t.skills.sourceManual
  return t.skills.user
}

export function getSkillSourceBadges(skill: Skill | ManagedSkill, t: ReturnType<typeof useI18n>['t']) {
  const labels: string[] = []

  if (skill.catalogGroup === 'user') {
    labels.push(t.skills.groupUser)
    if (skill.userSkillKind === 'external') {
      labels.push(t.skills.groupExternal)
      labels.push(getExternalSkillSourceLabel(skill, t))
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
