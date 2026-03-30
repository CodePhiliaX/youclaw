import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, cpSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { getLogger } from '../logger/index.ts'
import { getShellEnv } from '../utils/shell-env.ts'
import { SkillInstallSource } from './types.ts'
import type {
  FolderImportSkillRegistryMeta,
  GitHubSkillRegistryMeta,
  MarketplaceSkillRegistryMeta,
  RawUrlSkillRegistryMeta,
  Skill,
  SkillProjectMeta,
  SkillRegistryMeta,
  ZipUploadSkillRegistryMeta,
} from './types.ts'

const PROJECT_META_FILENAME = '.youclaw-skill.json'
const SCHEMA_VERSION = 1

export interface InstallMetadata {
  source: typeof SkillInstallSource[keyof typeof SkillInstallSource]
  slug?: string
  installedAt?: string
  displayName?: string
  version?: string
  provider?: typeof SkillInstallSource[keyof typeof SkillInstallSource]
  sourceUrl?: string
  homepageUrl?: string
  ref?: string
  path?: string
  projectOrigin?: SkillProjectMeta['origin']
  originalFilename?: string
  sourcePath?: string
}

/**
 * SkillsInstaller: manages skill installation and uninstallation.
 *
 * Supports:
 * - Copy skill from local path
 * - Download skill from remote URL
 * - Uninstall skill (delete directory + run teardown)
 * - Dependency and conflict checks
 */
export class SkillsInstaller {
  /**
   * Install a skill from a local path to the target directory.
   */
  async installFromLocal(sourcePath: string, targetDir: string, metadata?: InstallMetadata): Promise<void> {
    const logger = getLogger()

    if (!existsSync(sourcePath)) {
      throw new Error(`Source path does not exist: ${sourcePath}`)
    }

    const skillName = basename(sourcePath)
    const destPath = resolve(targetDir, skillName)

    if (existsSync(destPath)) {
      throw new Error(`Skill "${skillName}" already exists in target directory`)
    }

    mkdirSync(destPath, { recursive: true })

    try {
      cpSync(sourcePath, destPath, { recursive: true, force: false })
      this.writeInstallMeta(destPath, metadata?.projectOrigin ?? 'imported')
      if (metadata) {
        this.writeRegistryMeta(destPath, {
          ...metadata,
          slug: metadata.slug ?? skillName,
          displayName: metadata.displayName ?? skillName,
          installedAt: metadata.installedAt ?? new Date().toISOString(),
        })
      }
    } catch (err) {
      rmSync(destPath, { recursive: true, force: true })
      throw new Error(`Failed to copy skill files: ${err instanceof Error ? err.message : String(err)}`)
    }

    logger.info({ skillName, sourcePath, destPath }, 'Skill installed from local path')
  }

  /**
   * Install a skill from a remote URL.
   */
  async installFromUrl(url: string, targetDir: string, metadata?: InstallMetadata): Promise<void> {
    const logger = getLogger()
    const tmpRoot = mkdtempSync(resolve(tmpdir(), 'youclaw-skill-url-'))

    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to download skill: HTTP ${response.status} ${response.statusText}`)
      }
      const content = await response.text()

      const { parseFrontmatter } = await import('./frontmatter.ts')
      const { frontmatter } = parseFrontmatter(content)
      const skillName = frontmatter.name

      const destPath = resolve(targetDir, skillName)
      if (existsSync(destPath)) {
        throw new Error(`Skill "${skillName}" already exists in target directory`)
      }

      mkdirSync(destPath, { recursive: true })
      writeFileSync(resolve(destPath, 'SKILL.md'), content, 'utf-8')
      this.writeInstallMeta(destPath, metadata?.projectOrigin ?? 'manual')
      if (metadata) {
        this.writeRegistryMeta(destPath, {
          ...metadata,
          slug: metadata.slug ?? skillName,
          displayName: metadata.displayName ?? skillName,
          installedAt: metadata.installedAt ?? new Date().toISOString(),
        })
      }

      logger.info({ skillName, url, destPath }, 'Skill installed from remote URL')
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true })
    }
  }

  /**
   * Uninstall a skill.
   */
  async uninstall(skillName: string, targetDir: string): Promise<void> {
    const logger = getLogger()
    const skillDir = resolve(targetDir, skillName)

    if (!existsSync(skillDir)) {
      throw new Error(`Skill "${skillName}" does not exist`)
    }

    // Try to read frontmatter and run teardown
    try {
      const skillFile = resolve(skillDir, 'SKILL.md')
      if (existsSync(skillFile)) {
        const { parseFrontmatter } = await import('./frontmatter.ts')
        const content = readFileSync(skillFile, 'utf-8')
        const { frontmatter } = parseFrontmatter(content)

        if (frontmatter.teardown) {
          logger.info({ skillName, teardown: frontmatter.teardown }, 'Running teardown command')
          try {
            execSync(frontmatter.teardown, { encoding: 'utf-8', timeout: 30_000, env: getShellEnv() })
          } catch (err) {
            logger.warn({ skillName, error: err instanceof Error ? err.message : String(err) }, 'Teardown command failed')
          }
        }
      }
    } catch {
      // Teardown failure does not block uninstallation
    }

    // Delete skill directory
    rmSync(skillDir, { recursive: true, force: true })
    logger.info({ skillName }, 'Skill uninstalled')
  }

  /**
   * Check dependencies and conflicts.
   */
  checkCompatibility(skill: Skill, installedSkills: Skill[]): { ok: boolean; issues: string[] } {
    const issues: string[] = []
    const installedNames = new Set(installedSkills.map((s) => s.name))

    // Check dependencies
    if (skill.frontmatter.requires) {
      for (const dep of skill.frontmatter.requires) {
        if (!installedNames.has(dep)) {
          issues.push(`Missing required skill: ${dep}`)
        }
      }
    }

    // Check conflicts
    if (skill.frontmatter.conflicts) {
      for (const conflict of skill.frontmatter.conflicts) {
        if (installedNames.has(conflict)) {
          issues.push(`Conflicts with installed skill "${conflict}"`)
        }
      }
    }

    return { ok: issues.length === 0, issues }
  }

  private writeInstallMeta(skillDir: string, origin: SkillProjectMeta['origin']): void {
    const now = new Date().toISOString()
    const meta: SkillProjectMeta = {
      schemaVersion: SCHEMA_VERSION,
      managed: false,
      origin,
      createdAt: now,
      updatedAt: now,
    }

    writeFileSync(resolve(skillDir, PROJECT_META_FILENAME), JSON.stringify(meta, null, 2), 'utf-8')
  }

  private writeRegistryMeta(skillDir: string, metadata: InstallMetadata): void {
    const base = {
      slug: metadata.slug ?? basename(skillDir),
      installedAt: metadata.installedAt ?? new Date().toISOString(),
      displayName: metadata.displayName,
      version: metadata.version,
    }

    let registryMeta: SkillRegistryMeta
    if (metadata.source === SkillInstallSource.RawUrl) {
      const rawUrlMeta: RawUrlSkillRegistryMeta = {
        ...base,
        source: SkillInstallSource.RawUrl,
        provider: SkillInstallSource.RawUrl,
        sourceUrl: metadata.sourceUrl ?? '',
      }
      registryMeta = rawUrlMeta
    } else if (metadata.source === SkillInstallSource.GitHub) {
      const githubMeta: GitHubSkillRegistryMeta = {
        ...base,
        source: SkillInstallSource.GitHub,
        provider: SkillInstallSource.GitHub,
        sourceUrl: metadata.sourceUrl ?? '',
        homepageUrl: metadata.homepageUrl,
        ref: metadata.ref,
        path: metadata.path,
      }
      registryMeta = githubMeta
    } else if (metadata.source === SkillInstallSource.ZipUpload) {
      const zipUploadMeta: ZipUploadSkillRegistryMeta = {
        ...base,
        source: SkillInstallSource.ZipUpload,
        provider: SkillInstallSource.ZipUpload,
        originalFilename: metadata.originalFilename,
      }
      registryMeta = zipUploadMeta
    } else if (metadata.source === SkillInstallSource.FolderImport) {
      const folderImportMeta: FolderImportSkillRegistryMeta = {
        ...base,
        source: SkillInstallSource.FolderImport,
        provider: SkillInstallSource.FolderImport,
        sourcePath: metadata.sourcePath,
      }
      registryMeta = folderImportMeta
    } else {
      const marketplaceMeta: MarketplaceSkillRegistryMeta = {
        ...base,
        source: metadata.source,
        homepageUrl: metadata.homepageUrl,
      }
      registryMeta = marketplaceMeta
    }

    writeFileSync(resolve(skillDir, '.registry.json'), JSON.stringify(registryMeta, null, 2), 'utf-8')
  }
}
