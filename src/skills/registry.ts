import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { unzipSync } from 'fflate'
import { getLogger } from '../logger/index.ts'
import type { SkillsLoader } from './loader.ts'
import type { SkillRegistryMeta } from './types.ts'

export interface RecommendedSkill {
  slug: string
  displayName: string
  summary: string
  category: string
  installed: boolean
}

interface RecommendedEntry {
  slug: string
  displayName: string
  summary: string
  category: string
}

const CLAWHUB_DOWNLOAD_URL = 'https://clawhub.ai/api/v1/download'

export class RegistryManager {
  private recommended: RecommendedEntry[] = []

  constructor(private skillsLoader: SkillsLoader) {
    this.loadRecommendedList()
  }

  /** 读取推荐列表，合并本地安装状态 */
  getRecommended(): RecommendedSkill[] {
    const allSkills = this.skillsLoader.loadAllSkills()
    // 已安装的 slug 集合（通过 registryMeta 或目录名匹配）
    const installedSlugs = new Set<string>()
    for (const skill of allSkills) {
      if (skill.registryMeta?.slug) {
        installedSlugs.add(skill.registryMeta.slug)
      }
    }

    // 同时检查用户 skills 目录下是否有对应 slug 的目录
    const userSkillsDir = resolve(homedir(), '.youclaw', 'skills')
    for (const entry of this.recommended) {
      if (!installedSlugs.has(entry.slug)) {
        const dir = resolve(userSkillsDir, entry.slug)
        if (existsSync(resolve(dir, 'SKILL.md'))) {
          installedSlugs.add(entry.slug)
        }
      }
    }

    return this.recommended.map((entry) => ({
      ...entry,
      installed: installedSlugs.has(entry.slug),
    }))
  }

  /** 从 ClawHub 下载 ZIP 并安装到 ~/.youclaw/skills/<slug>/ */
  async installSkill(slug: string): Promise<void> {
    const logger = getLogger()
    const entry = this.recommended.find((e) => e.slug === slug)
    if (!entry) {
      throw new Error(`未知的推荐技能: ${slug}`)
    }

    const userSkillsDir = resolve(homedir(), '.youclaw', 'skills')
    const targetDir = resolve(userSkillsDir, slug)

    if (existsSync(resolve(targetDir, 'SKILL.md'))) {
      throw new Error(`技能 "${slug}" 已安装`)
    }

    // 下载 ZIP
    const url = `${CLAWHUB_DOWNLOAD_URL}?slug=${encodeURIComponent(slug)}`
    logger.info({ slug, url }, '正在从 ClawHub 下载技能')

    let response = await fetch(url)

    // 处理 429 限流：读 retry-after，等待重试 1 次
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10)
      logger.warn({ slug, retryAfter }, 'ClawHub 限流，等待重试')
      await new Promise((r) => setTimeout(r, retryAfter * 1000))
      response = await fetch(url)
    }

    if (!response.ok) {
      throw new Error(`下载失败: HTTP ${response.status} ${response.statusText}`)
    }

    const zipBuffer = await response.arrayBuffer()

    // 解压并安装
    mkdirSync(targetDir, { recursive: true })

    try {
      const zipData = new Uint8Array(zipBuffer)
      const files = unzipSync(zipData)

      let hasSkillMd = false

      for (const [filePath, content] of Object.entries(files)) {
        // 跳过目录条目（以 / 结尾且内容为空）
        if (filePath.endsWith('/') && content.length === 0) continue

        // 去掉可能的顶层目录前缀（如 slug/）
        let relativePath = filePath
        const firstSlash = filePath.indexOf('/')
        if (firstSlash !== -1) {
          // 检查是否所有文件都有相同的顶层目录
          relativePath = filePath.slice(firstSlash + 1)
          if (!relativePath) continue // 顶层目录本身
        }

        if (relativePath === 'SKILL.md' || relativePath.endsWith('/SKILL.md')) {
          hasSkillMd = true
        }

        const destPath = resolve(targetDir, relativePath)
        const destDir = resolve(destPath, '..')
        mkdirSync(destDir, { recursive: true })
        writeFileSync(destPath, content)
      }

      // 如果没有找到 SKILL.md，可能文件直接在根目录
      if (!hasSkillMd) {
        // 再检查一下是否直接解压到了 targetDir
        if (!existsSync(resolve(targetDir, 'SKILL.md'))) {
          throw new Error('ZIP 包中未找到 SKILL.md')
        }
      }

      // 写入 .registry.json 元数据
      const meta: SkillRegistryMeta = {
        source: 'clawhub',
        slug,
        installedAt: new Date().toISOString(),
        displayName: entry.displayName,
      }
      writeFileSync(resolve(targetDir, '.registry.json'), JSON.stringify(meta, null, 2))

      // 刷新 skills 缓存
      this.skillsLoader.refresh()
      logger.info({ slug, targetDir }, '技能安装完成')
    } catch (err) {
      // 清理失败的安装
      const { rmSync } = await import('node:fs')
      rmSync(targetDir, { recursive: true, force: true })
      throw err
    }
  }

  /** 卸载技能 */
  async uninstallSkill(slug: string): Promise<void> {
    const logger = getLogger()
    const userSkillsDir = resolve(homedir(), '.youclaw', 'skills')
    const targetDir = resolve(userSkillsDir, slug)

    if (!existsSync(targetDir)) {
      throw new Error(`技能 "${slug}" 未安装`)
    }

    const { rmSync } = await import('node:fs')
    rmSync(targetDir, { recursive: true, force: true })

    this.skillsLoader.refresh()
    logger.info({ slug }, '技能已卸载')
  }

  /** 加载推荐列表（启动时缓存） */
  private loadRecommendedList(): void {
    const logger = getLogger()
    try {
      // 使用 Bun.file + import.meta.resolve 确保编译后也能读取嵌入的文件
      const filePath = new URL('./recommended-skills.json', import.meta.url).pathname
      const raw = readFileSync(filePath, 'utf-8')
      this.recommended = JSON.parse(raw)
      logger.debug({ count: this.recommended.length }, '推荐技能列表已加载')
    } catch (err) {
      logger.warn({ error: err instanceof Error ? err.message : String(err) }, '加载推荐技能列表失败')
      this.recommended = []
    }
  }
}
