import { Hono } from 'hono'
import { z } from 'zod/v4'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execSync } from 'node:child_process'
import { ROOT_DIR } from '../config/index.ts'
import { getShellEnv, resetShellEnvCache } from '../utils/shell-env.ts'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { getLogger } from '../logger/index.ts'
import type { SkillsLoader } from '../skills/index.ts'
import {
  ImportManager,
  SkillInstallSource,
  SkillProjectService,
  SkillsInstaller,
  resolveExternalSkillSource,
  resolveManagedSkillCatalogInfo,
} from '../skills/index.ts'
import type { AgentManager } from '../agent/index.ts'
import type {
  AgentSkillsView,
  Skill,
  SkillCatalogInfo,
  SkillProject,
  SkillProjectMeta,
} from '../skills/types.ts'
import type { SkillProjectDetail } from '../skills/project-service.ts'
import { parseFrontmatter } from '../skills/frontmatter.ts'
import { MAX_ARCHIVE_BYTES, unpackZipArchive, writeArchiveEntries } from '../skills/archive.ts'

const PROJECT_META_FILENAME = '.youclaw-skill.json'
const configureEnvSchema = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  value: z.string(),
})

const installSchema = z.object({
  skillName: z.string().min(1),
  method: z.string().min(1),
})

const toggleSchema = z.object({
  enabled: z.boolean(),
})

const normalizedUrlField = z.preprocess(
  (value) => typeof value === 'string' ? value.trim().replace(/^[-*+]\s+/, '') : value,
  z.string().url(),
)

const installFromPathSchema = z.object({
  sourcePath: z.string().min(1),
  targetDir: z.string().optional(),
})

const installFromUrlSchema = z.object({
  url: normalizedUrlField,
  targetDir: z.string().optional(),
})

const rawUrlImportSchema = z.object({
  url: normalizedUrlField,
  targetDir: z.string().optional(),
})

const githubImportSchema = z.object({
  repoUrl: normalizedUrlField,
  path: z.string().optional(),
  ref: z.string().optional(),
  targetDir: z.string().optional(),
})

const createSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  locale: z.enum(['en', 'zh']).optional(),
})

const draftPayloadSchema = z.object({
  mode: z.enum(['form', 'source']),
  draft: z.object({
    frontmatter: z.record(z.string(), z.unknown()).optional(),
    content: z.string().optional(),
    rawMarkdown: z.string().optional(),
  }).optional(),
  rawMarkdown: z.string().optional(),
})

const duplicateSkillSchema = z.object({
  name: z.string().optional(),
})

const bindSkillSchema = z.object({
  agentId: z.string().min(1),
})

const publishSkillSchema = z.object({
  bindingAgentIds: z.array(z.string().min(1)).optional(),
})

export type SerializedSkill = Skill & SkillCatalogInfo
export type SerializedManagedSkill = SkillProject & SkillCatalogInfo
export type SerializedSkillProjectDetail = Omit<SkillProjectDetail, 'project'> & { skill: SerializedManagedSkill }

function readRuntimeSkillProjectMeta(skill: Skill): SkillProjectMeta | null {
  const metaPath = resolve(skill.path, '..', PROJECT_META_FILENAME)
  if (!existsSync(metaPath)) {
    return null
  }

  try {
    return JSON.parse(readFileSync(metaPath, 'utf-8')) as SkillProjectMeta
  } catch {
    return null
  }
}

function resolveRuntimeSkillCatalogInfo(skill: Skill): SkillCatalogInfo {
  const projectMeta = readRuntimeSkillProjectMeta(skill)
  const treatAsUserSkill = skill.source === 'user'
    || Boolean(projectMeta && projectMeta.origin !== 'builtin')

  if (!treatAsUserSkill) {
    return {
      catalogGroup: 'builtin',
      sortTimestamp: undefined,
    }
  }

  return {
    catalogGroup: 'user',
    userSkillKind: projectMeta?.managed ? 'custom' : 'external',
    externalSource: projectMeta?.managed ? undefined : resolveExternalSkillSource(skill.registryMeta, projectMeta),
    sortTimestamp: skill.registryMeta?.installedAt ?? projectMeta?.updatedAt ?? projectMeta?.createdAt,
  }
}

function serializeSkill(skill: Skill): SerializedSkill {
  return {
    ...skill,
    ...resolveRuntimeSkillCatalogInfo(skill),
  }
}

function sanitizeSkillDirectoryName(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\/\\]/g, '-')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[<>:"|?*]/g, '-')
    .trim()
}

function resolveSafeSkillRoot(rootDir: string, rawName: string): string {
  const skillDirName = sanitizeSkillDirectoryName(rawName)
  if (!skillDirName || skillDirName === '.' || skillDirName === '..') {
    throw new Error('Skill name must resolve to a safe directory name')
  }

  const skillRoot = resolve(rootDir, skillDirName)
  const relativePath = relative(rootDir, skillRoot)
  if (
    !relativePath
    || relativePath === '.'
    || relativePath === '..'
    || isAbsolute(relativePath)
    || relativePath.startsWith(`..${sep}`)
  ) {
    throw new Error('Skill name must resolve to a safe directory name')
  }

  return skillRoot
}

function serializeAgentSkillsView(view: AgentSkillsView) {
  return {
    available: view.available.map(serializeSkill),
    enabled: view.enabled.map(serializeSkill),
    eligible: view.eligible.map(serializeSkill),
  }
}

export function serializeManagedSkill(skill: SkillProject): SerializedManagedSkill {
  return {
    ...skill,
    ...resolveManagedSkillCatalogInfo(skill),
  }
}

export function serializeManagedSkillDetail(detail: SkillProjectDetail): SerializedSkillProjectDetail {
  return {
    skill: serializeManagedSkill(detail.project),
    publishedDraft: detail.publishedDraft,
    draft: detail.draft,
    draftMeta: detail.draftMeta,
    bindingStates: detail.bindingStates,
  }
}

export function createSkillsRoutes(
  skillsLoader: SkillsLoader,
  agentManager: AgentManager,
  options?: { skillsDir?: string; installer?: SkillsInstaller; importManager?: ImportManager },
) {
  const skills = new Hono()
  const installer = options?.installer ?? new SkillsInstaller()
  const importManager = options?.importManager ?? new ImportManager(installer)
  const skillAuthoringService = new SkillProjectService(skillsLoader, agentManager, options?.skillsDir)

  // GET /api/skills — all available skills
  skills.get('/skills', (c) => {
    const allSkills = skillsLoader.loadAllSkills()
    return c.json(allSkills.map(serializeSkill))
  })

  // GET /api/skills/stats — cache statistics
  skills.get('/skills/stats', (c) => {
    const stats = skillsLoader.getCacheStats()
    const config = skillsLoader.getConfig()
    return c.json({ ...stats, config })
  })

  // GET /api/skills/mine — managed custom skills
  skills.get('/skills/mine', (c) => {
    return c.json(skillAuthoringService.listProjects().filter((skill) => skill.editable).map(serializeManagedSkill))
  })

  // POST /api/skills — create new managed skill
  skills.post('/skills', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = createSkillSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid parameters', details: parsed.error.issues }, 400)
    }

    try {
      const detail = skillAuthoringService.createProject(parsed.data)
      return c.json(serializeManagedSkillDetail(detail), 201)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: msg }, 400)
    }
  })

  // GET /api/skills/:name/draft — draft detail
  skills.get('/skills/:name/draft', (c) => {
    try {
      return c.json(serializeManagedSkillDetail(skillAuthoringService.getProject(c.req.param('name'))))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: msg }, 404)
    }
  })

  // PUT /api/skills/:name/draft — save draft
  skills.put('/skills/:name/draft', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = draftPayloadSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid parameters', details: parsed.error.issues }, 400)
    }

    try {
      const detail = skillAuthoringService.saveDraft(c.req.param('name'), parsed.data)
      const validation = skillAuthoringService.validateDraft(c.req.param('name'), parsed.data)
      return c.json({ ...serializeManagedSkillDetail(detail), validation })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: msg }, 400)
    }
  })

  // DELETE /api/skills/:name/draft — discard draft
  skills.delete('/skills/:name/draft', (c) => {
    try {
      return c.json(serializeManagedSkillDetail(skillAuthoringService.discardDraft(c.req.param('name'))))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: msg }, 400)
    }
  })

  // POST /api/skills/:name/validate — validate draft without saving
  skills.post('/skills/:name/validate', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = draftPayloadSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid parameters', details: parsed.error.issues }, 400)
    }

    try {
      return c.json(skillAuthoringService.validateDraft(c.req.param('name'), parsed.data))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: msg }, 400)
    }
  })

  // POST /api/skills/:name/publish — publish draft to SKILL.md
  skills.post('/skills/:name/publish', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = publishSkillSchema.safeParse(body ?? {})
    if (!parsed.success) {
      return c.json({ error: 'Invalid parameters', details: parsed.error.issues }, 400)
    }

    try {
      const detail = await skillAuthoringService.publishDraft(c.req.param('name'), parsed.data)
      return c.json(serializeManagedSkillDetail(detail))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: msg }, 400)
    }
  })

  // POST /api/skills/:name/duplicate — duplicate managed skill
  skills.post('/skills/:name/duplicate', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = duplicateSkillSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid parameters', details: parsed.error.issues }, 400)
    }

    try {
      return c.json(serializeManagedSkillDetail(skillAuthoringService.duplicateProject(c.req.param('name'), parsed.data.name)), 201)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: msg }, 400)
    }
  })

  // DELETE /api/skills/:name/manage — delete managed skill
  skills.delete('/skills/:name/manage', async (c) => {
    try {
      return c.json(await skillAuthoringService.deleteProject(c.req.param('name')))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: msg }, 400)
    }
  })

  // POST /api/skills/:name/bind — bind published skill to an agent
  skills.post('/skills/:name/bind', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = bindSkillSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid parameters', details: parsed.error.issues }, 400)
    }

    try {
      const result = await skillAuthoringService.bindSkill(c.req.param('name'), parsed.data.agentId)
      return c.json(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: msg }, 400)
    }
  })

  // POST /api/skills/:name/unbind — unbind skill from an agent
  skills.post('/skills/:name/unbind', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = bindSkillSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid parameters', details: parsed.error.issues }, 400)
    }

    try {
      const result = await skillAuthoringService.unbindSkill(c.req.param('name'), parsed.data.agentId)
      return c.json(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: msg }, 400)
    }
  })

  // POST /api/skills/reload — force reload
  skills.post('/skills/reload', (c) => {
    const reloaded = skillsLoader.refresh()
    return c.json({ count: reloaded.length, reloadedAt: Date.now() })
  })

  // POST /api/skills/configure — save environment variable to .env
  skills.post('/skills/configure', async (c) => {
    const body = await c.req.json()
    const parsed = configureEnvSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid parameters', details: parsed.error.issues }, 400)
    }

    const { key, value } = parsed.data
    const envPath = resolve(ROOT_DIR, '.env')
    const logger = getLogger()

    try {
      let content = ''
      if (existsSync(envPath)) {
        content = readFileSync(envPath, 'utf-8')
      }

      const lineRegex = new RegExp(`^(#\\s*)?${key}\\s*=.*$`, 'm')
      if (lineRegex.test(content)) {
        content = content.replace(lineRegex, `${key}=${value}`)
      } else {
        content = content.trimEnd() + `\n${key}=${value}\n`
      }

      writeFileSync(envPath, content, 'utf-8')
      process.env[key] = value
      skillsLoader.refresh()

      logger.info({ key }, 'Env var saved to .env')
      return c.json({ ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error({ key, error: msg }, 'Failed to save env var')
      return c.json({ error: msg }, 500)
    }
  })

  // POST /api/skills/install — run install command (dependency installation for existing skill)
  skills.post('/skills/install', async (c) => {
    const body = await c.req.json()
    const parsed = installSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid parameters', details: parsed.error.issues }, 400)
    }

    const { skillName, method } = parsed.data
    const logger = getLogger()
    const allSkills = skillsLoader.loadAllSkills()
    const skill = allSkills.find((s) => s.name === skillName)
    if (!skill) {
      return c.json({ error: 'Skill not found' }, 404)
    }

    const command = skill.frontmatter.install?.[method]
    if (!command) {
      return c.json({ error: `Install method "${method}" not found for skill "${skillName}"` }, 400)
    }

    logger.info({ skillName, method, command }, 'Installing skill dependency')

    try {
      let stdout = ''
      let stderr = ''
      let exitCode = 0
      try {
        stdout = execSync(command, { encoding: 'utf-8', timeout: 120_000, env: getShellEnv() })
      } catch (execErr: any) {
        stdout = execErr.stdout ?? ''
        stderr = execErr.stderr ?? ''
        exitCode = execErr.status ?? 1
      }

      resetShellEnvCache()
      skillsLoader.refresh()

      logger.info({ skillName, method, exitCode }, 'Installation complete')
      return c.json({ ok: exitCode === 0, stdout, stderr, exitCode })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error({ skillName, method, error: msg }, 'Installation failed')
      return c.json({ error: msg }, 500)
    }
  })

  // POST /api/skills/:name/toggle — enable/disable a skill
  skills.post('/skills/:name/toggle', async (c) => {
    const name = c.req.param('name')
    const body = await c.req.json()
    const parsed = toggleSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid parameters', details: parsed.error.issues }, 400)
    }

    const allSkills = skillsLoader.loadAllSkills()
    const exists = allSkills.find((s) => s.name === name)
    if (!exists) {
      return c.json({ error: 'Skill not found' }, 404)
    }

    const updated = skillsLoader.setSkillEnabled(name, parsed.data.enabled)
    return c.json(updated ? serializeSkill(updated) : null)
  })

  // POST /api/skills/install-from-path — install skill from local path
  skills.post('/skills/install-from-path', async (c) => {
    const body = await c.req.json()
    const parsed = installFromPathSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid parameters', details: parsed.error.issues }, 400)
    }

    const { sourcePath, targetDir } = parsed.data
    const dest = targetDir ?? resolve(ROOT_DIR, 'skills')

    try {
      await installer.installFromLocal(sourcePath, dest, {
        source: SkillInstallSource.FolderImport,
        provider: SkillInstallSource.FolderImport,
        sourcePath,
        projectOrigin: 'manual',
      })
      skillsLoader.refresh()
      return c.json({ ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: msg }, 500)
    }
  })

  // POST /api/skills/install-from-archive — install skill from uploaded zip
  skills.post('/skills/install-from-archive', async (c) => {
    const formData = await c.req.formData().catch(() => null)
    const rawFile = formData?.get('file')
    const rawTargetDir = formData?.get('targetDir')

    if (!(rawFile instanceof File)) {
      return c.json({ error: 'File is required' }, 400)
    }

    if (rawFile.size > MAX_ARCHIVE_BYTES) {
      return c.json({ error: `File exceeds the ${(MAX_ARCHIVE_BYTES / 1024 / 1024).toFixed(0)}MB limit` }, 400)
    }

    const fileName = rawFile.name || 'skill.zip'
    if (!fileName.toLowerCase().endsWith('.zip')) {
      return c.json({ error: 'Uploaded file must be a .zip archive' }, 400)
    }

    const dest = typeof rawTargetDir === 'string' && rawTargetDir.trim()
      ? rawTargetDir.trim()
      : resolve(ROOT_DIR, 'skills')

    const archive = new Uint8Array(await rawFile.arrayBuffer())
    const stageRoot = mkdtempSync(resolve(tmpdir(), 'youclaw-skill-upload-'))

    try {
      const entries = unpackZipArchive(archive)
      const skillEntry = entries.find((entry) => entry.relativePath === 'SKILL.md')
      if (!skillEntry) {
        throw new Error('Archive does not contain a root SKILL.md')
      }

      const markdown = Buffer.from(skillEntry.content).toString('utf-8')
      const { frontmatter } = parseFrontmatter(markdown)
      const fallbackDirName = fileName.replace(/\.zip$/i, '') || 'uploaded-skill'
      const skillRoot = resolveSafeSkillRoot(stageRoot, frontmatter.name || fallbackDirName || 'uploaded-skill')

      mkdirSync(skillRoot, { recursive: true })
      writeArchiveEntries(skillRoot, entries)

      await installer.installFromLocal(skillRoot, dest, {
        source: SkillInstallSource.ZipUpload,
        provider: SkillInstallSource.ZipUpload,
        originalFilename: fileName,
        projectOrigin: 'imported',
      })
      skillsLoader.refresh()
      return c.json({ ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: msg }, 400)
    } finally {
      rmSync(stageRoot, { recursive: true, force: true })
    }
  })

  // POST /api/skills/install-from-url — install skill from remote URL
  skills.post('/skills/install-from-url', async (c) => {
    const body = await c.req.json()
    const parsed = installFromUrlSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid parameters', details: parsed.error.issues }, 400)
    }

    const { url, targetDir } = parsed.data
    const dest = targetDir ?? resolve(ROOT_DIR, 'skills')

    try {
      await installer.installFromUrl(url, dest, {
        source: SkillInstallSource.RawUrl,
        provider: SkillInstallSource.RawUrl,
        sourceUrl: url,
        projectOrigin: 'imported',
      })
      skillsLoader.refresh()
      return c.json({ ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: msg }, 500)
    }
  })

  skills.get('/skills/import/providers', (c) => {
    return c.json(importManager.listProviders())
  })

  skills.post('/skills/import/raw-url/probe', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = rawUrlImportSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid parameters', details: parsed.error.issues }, 400)
    }

    try {
      return c.json(await importManager.probe('raw-url', parsed.data))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: msg }, 400)
    }
  })

  skills.post('/skills/import/raw-url', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = rawUrlImportSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid parameters', details: parsed.error.issues }, 400)
    }

    try {
      await importManager.import('raw-url', parsed.data)
      skillsLoader.refresh()
      return c.json({ ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: msg }, 400)
    }
  })

  skills.post('/skills/import/github/probe', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = githubImportSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid parameters', details: parsed.error.issues }, 400)
    }

    try {
      return c.json(await importManager.probe('github', parsed.data))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: msg }, 400)
    }
  })

  skills.post('/skills/import/github', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = githubImportSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid parameters', details: parsed.error.issues }, 400)
    }

    try {
      await importManager.import('github', parsed.data)
      skillsLoader.refresh()
      return c.json({ ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: msg }, 400)
    }
  })

  // DELETE /api/skills/:name — uninstall a skill
  skills.delete('/skills/:name', async (c) => {
    const name = c.req.param('name')
    const logger = getLogger()
    const allSkills = skillsLoader.loadAllSkills()
    const skill = allSkills.find((s) => s.name === name)

    if (!skill) {
      return c.json({ error: 'Skill not found' }, 404)
    }

    if (skill.source === 'workspace') {
      return c.json({ error: 'Cannot uninstall workspace-level skills via API' }, 403)
    }

    try {
      const { dirname, basename } = await import('node:path')
      const skillDir = dirname(skill.path)
      await installer.uninstall(basename(skillDir), dirname(skillDir))
      skillsLoader.refresh()

      const agents = agentManager.getAgents()
      let modified = false
      for (const agent of agents) {
        if (!agent.skills?.includes(name)) continue
        const yamlPath = resolve(agent.workspaceDir, 'agent.yaml')
        if (!existsSync(yamlPath)) continue
        try {
          const raw = readFileSync(yamlPath, 'utf-8')
          const doc = parseYaml(raw)
          if (Array.isArray(doc.skills)) {
            doc.skills = doc.skills.filter((s: string) => s !== name)
            writeFileSync(yamlPath, stringifyYaml(doc), 'utf-8')
            modified = true
          }
        } catch (yamlErr) {
          logger.error({ agent: agent.id, error: yamlErr }, 'Failed to clean skill from agent.yaml')
        }
      }
      if (modified) {
        await agentManager.reloadAgents()
      }

      return c.json({ ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error({ name, error: msg }, 'Failed to uninstall skill')
      return c.json({ error: msg }, 500)
    }
  })

  // GET /api/skills/:name/agents — agents that reference a skill
  skills.get('/skills/:name/agents', (c) => {
    const name = c.req.param('name')
    const agents = agentManager.getAgents()
    const matched = agents
      .filter((a) => a.skills?.includes('*') || a.skills?.includes(name))
      .map((a) => ({ id: a.id, name: a.name }))
    return c.json({ agents: matched })
  })

  // GET /api/skills/:name — single skill details
  skills.get('/skills/:name', (c) => {
    const name = c.req.param('name')
    const allSkills = skillsLoader.loadAllSkills()
    const skill = allSkills.find((s) => s.name === name)

    if (!skill) {
      return c.json({ error: 'Skill not found' }, 404)
    }

    return c.json(serializeSkill(skill))
  })

  // GET /api/agents/:id/skills — agent skills view (enhanced)
  skills.get('/agents/:id/skills', (c) => {
    const id = c.req.param('id')
    const managed = agentManager.getAgent(id)

    if (!managed) {
      return c.json({ error: 'Agent not found' }, 404)
    }

    const view = skillsLoader.getAgentSkillsView(managed.config)
    return c.json(serializeAgentSkillsView(view))
  })

  return skills
}
