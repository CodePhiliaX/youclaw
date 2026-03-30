import type {
  ExternalSkillSource,
  SkillCatalogInfo,
  SkillInstallSource,
  SkillProject,
  SkillProjectMeta,
} from './types.ts'

const MARKETPLACE_INSTALL_SOURCES = new Set<SkillInstallSource>(['clawhub', 'tencent'])
const URL_INSTALL_SOURCES = new Set<SkillInstallSource>(['raw-url', 'github'])
const LOCAL_INSTALL_SOURCES = new Set<SkillInstallSource>(['zip-upload', 'folder-import'])

export function resolveExternalSkillSource(
  registryMeta?: { source?: string },
  projectMeta?: SkillProjectMeta | null,
): ExternalSkillSource | undefined {
  if (registryMeta?.source && MARKETPLACE_INSTALL_SOURCES.has(registryMeta.source as SkillInstallSource)) {
    return 'marketplace'
  }
  if (registryMeta?.source && URL_INSTALL_SOURCES.has(registryMeta.source as SkillInstallSource)) {
    return 'url'
  }
  if (registryMeta?.source && LOCAL_INSTALL_SOURCES.has(registryMeta.source as SkillInstallSource)) {
    return 'local'
  }
  if (projectMeta?.origin === 'marketplace') {
    return 'marketplace'
  }
  if (projectMeta?.origin === 'imported' || projectMeta?.origin === 'manual') {
    return 'local'
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
