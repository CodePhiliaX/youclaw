import type { ManagedSkill, Skill } from '@/api/client'
import type { useI18n } from '@/i18n'

export type RuntimeSkillAvailability = 'disabled' | 'usable' | 'enabledNotReady'

export function isCustomEditableManagedSkill(managedSkill?: ManagedSkill | null) {
  return Boolean(
    managedSkill?.editable
    && managedSkill.userSkillKind === 'custom',
  )
}

export function getSkillDescription(
  skill: Skill,
  managedSkill: ManagedSkill | null | undefined,
  t: ReturnType<typeof useI18n>['t'],
) {
  return skill.frontmatter.description || managedSkill?.description || t.skills.skillDescriptionFallback
}

export function getExternalSkillSourceLabel(skill: Skill | ManagedSkill, t: ReturnType<typeof useI18n>['t']) {
  const source = skill.registryMeta?.source

  if (skill.externalSource === 'marketplace') {
    if (source === 'clawhub') return t.settings.registrySourceClawhub
    if (source === 'tencent') return t.settings.registrySourceTencent
    return t.skills.sourceMarketplace
  }

  if (skill.externalSource === 'url') {
    if (source === 'raw-url') {
      return t.skills.sourceRawUrlImport
    }
    if (source === 'github') {
      return t.skills.sourceGitHubImport
    }
    return t.skills.sourceImported
  }

  if (skill.externalSource === 'local') {
    if (source === 'zip-upload') {
      return t.skills.sourceZipUpload
    }
    if (source === 'folder-import') {
      return t.skills.sourceFolderImport
    }
    return t.skills.sourceManual
  }

  return t.skills.user
}

export function getInstalledSkillSourceLabel(
  skill: Skill,
  managedSkill: ManagedSkill | null | undefined,
  t: ReturnType<typeof useI18n>['t'],
) {
  if (managedSkill?.userSkillKind === 'custom') return t.skills.sourceCustom
  if (skill.source === 'builtin') return t.skills.builtin
  return getExternalSkillSourceLabel(skill, t)
}

export function resolveRuntimeSkillAvailability(
  skill: Pick<Skill, 'enabled' | 'usable'>,
): RuntimeSkillAvailability {
  if (!skill.enabled) return 'disabled'
  if (skill.usable) return 'usable'
  return 'enabledNotReady'
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
