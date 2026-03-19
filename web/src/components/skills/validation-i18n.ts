import type { SkillValidationMessage } from '@/api/client'
import type { useI18n } from '@/i18n'

type ValidationItem = SkillValidationMessage & { kind: 'error' | 'warning' }

export function localizeValidationMessages(
  items: ValidationItem[],
  t: ReturnType<typeof useI18n>['t'],
): ValidationItem[] {
  return items.map((item) => ({
    ...item,
    field: localizeValidationField(item.field, t),
    message: localizeValidationMessage(item, t),
  }))
}

function localizeValidationField(
  field: string | undefined,
  t: ReturnType<typeof useI18n>['t'],
) {
  switch (field) {
    case 'name':
      return t.skills.fieldName
    case 'description':
      return t.skills.fieldDescription
    case 'version':
    case 'frontmatterDefaults.version':
      return t.skills.version
    case 'requires':
      return t.skills.requires
    case 'conflicts':
      return t.skills.conflicts
    default:
      return field
  }
}

function localizeValidationMessage(
  item: SkillValidationMessage,
  t: ReturnType<typeof useI18n>['t'],
) {
  const message = item.message

  if (
    message === 'Skill name is required'
    || message === 'Skill description is required'
  ) {
    return t.skills.validationRequired
  }

  if (message === 'Skill version must be an integer') {
    return t.skills.validationIntegerOnly
  }

  if (message === 'Skill name must contain at least one letter or number') {
    return t.skills.validationNameInvalid
  }

  if (message === 'SKILL.md missing frontmatter (must start with ---)') {
    return t.skills.validationFrontmatterMissing
  }

  if (message === 'SKILL.md frontmatter not closed (missing second ---)') {
    return t.skills.validationFrontmatterNotClosed
  }

  if (message === 'SKILL.md frontmatter parsed to invalid result') {
    return t.skills.validationFrontmatterInvalid
  }

  const requiredFrontmatterMatch = message.match(/^SKILL\.md frontmatter missing required field: (.+)$/)
  if (requiredFrontmatterMatch) {
    const fieldLabel = localizeValidationField(requiredFrontmatterMatch[1], t) ?? requiredFrontmatterMatch[1]
    return t.skills.validationFrontmatterRequired.replace('{field}', fieldLabel)
  }

  const missingSkillMatch = message.match(/^Referenced skill not found: (.+)$/)
  if (missingSkillMatch) {
    return t.skills.validationReferencedSkillMissing.replace('{value}', missingSkillMatch[1])
  }

  const conflictSkillMatch = message.match(/^Conflicting skill is installed: (.+)$/)
  if (conflictSkillMatch) {
    return t.skills.validationConflictingSkillInstalled.replace('{value}', conflictSkillMatch[1])
  }

  return message
}
