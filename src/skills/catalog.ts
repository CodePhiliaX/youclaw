import type {
  ExternalSkillSource,
  SkillCatalogInfo,
  SkillProject,
  SkillProjectMeta,
} from './types.ts'

const CLAWHUB_SOURCE = 'clawhub'

function resolveExternalSkillSource(
  registryMeta?: { source?: string },
  projectMeta?: SkillProjectMeta | null,
): ExternalSkillSource | undefined {
  if (registryMeta?.source === CLAWHUB_SOURCE) {
    return 'marketplace'
  }
  if (projectMeta?.origin === 'marketplace') {
    return 'marketplace'
  }
  if (projectMeta?.origin === 'imported') {
    return 'imported'
  }
  if (projectMeta?.origin === 'manual') {
    return 'manual'
  }
  return undefined
}

export function resolveManagedSkillCatalogInfo(skill: Pick<
  SkillProject,
  'source' | 'editable' | 'managed' | 'origin' | 'createdAt' | 'updatedAt' | 'draftUpdatedAt'
>): SkillCatalogInfo {
  if (skill.source === 'user') {
    const isCustom = skill.editable || skill.managed || skill.origin === 'duplicated'
    return {
      catalogGroup: 'user',
      userSkillKind: isCustom ? 'custom' : 'external',
      externalSource: isCustom ? undefined : resolveExternalSkillSource(undefined, {
        schemaVersion: 1,
        managed: skill.managed,
        origin: skill.origin,
        createdAt: skill.createdAt ?? '',
        updatedAt: skill.updatedAt ?? '',
      }),
      sortTimestamp: isCustom
        ? (skill.draftUpdatedAt ?? skill.updatedAt ?? skill.createdAt)
        : (skill.updatedAt ?? skill.createdAt),
    }
  }

  return {
    catalogGroup: 'builtin',
    sortTimestamp: skill.updatedAt ?? skill.createdAt,
  }
}

export function compareByNewestThenName<T extends { name: string; sortTimestamp?: string }>(left: T, right: T): number {
  const leftParsed = left.sortTimestamp ? Date.parse(left.sortTimestamp) : Number.NaN
  const rightParsed = right.sortTimestamp ? Date.parse(right.sortTimestamp) : Number.NaN
  const leftTime = Number.isFinite(leftParsed) ? leftParsed : Number.NEGATIVE_INFINITY
  const rightTime = Number.isFinite(rightParsed) ? rightParsed : Number.NEGATIVE_INFINITY

  if (leftTime !== rightTime) {
    return rightTime - leftTime
  }

  return left.name.localeCompare(right.name)
}
