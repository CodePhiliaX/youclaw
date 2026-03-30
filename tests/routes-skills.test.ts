import { afterEach, describe, test, expect } from 'bun:test'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, resolve } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { stringify as stringifyYaml } from 'yaml'
import { createSkillsRoutes, serializeManagedSkillDetail } from '../src/routes/skills.ts'
import { loadEnv } from '../src/config/index.ts'
import { initLogger } from '../src/logger/index.ts'
import type { SkillProjectDetail } from '../src/skills/project-service.ts'

loadEnv()
initLogger()

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

const baseSkill = {
  name: 'pdf',
  source: 'workspace',
  frontmatter: {
    name: 'pdf',
    description: 'Read PDFs',
  },
  content: 'body',
  path: '/tmp/pdf/SKILL.md',
  eligible: true,
  eligibilityErrors: [],
  eligibilityDetail: {
    os: { passed: true, current: process.platform },
    dependencies: { passed: true, results: [] },
    env: { passed: true, results: [] },
  },
  loadedAt: 1,
  enabled: true,
  usable: true,
}

describe('skills routes', () => {
  test('GET /skills returns all skills', async () => {
    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [baseSkill],
        getCacheStats: () => ({ totalCached: 1 }),
        getConfig: () => ({ maxSkillCount: 50 }),
        refresh: () => [baseSkill],
        loadSkillsForAgent: () => [baseSkill],
        getAgentSkillsView: () => ({ available: [baseSkill], enabled: [baseSkill], eligible: [baseSkill] }),
      } as any,
      { getAgent: () => ({ config: { id: 'agent-1' } }) } as any,
    )

    const res = await app.request('/skills')
    const body = await res.json() as Array<{ name: string }>

    expect(res.status).toBe(200)
    expect(body.map((skill) => skill.name)).toEqual(['pdf'])
  })

  test('GET /skills/stats returns cache statistics and config', async () => {
    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [baseSkill],
        getCacheStats: () => ({ totalCached: 1, lastLoadedAt: 123 }),
        getConfig: () => ({ maxSkillCount: 50, maxTotalChars: 30000 }),
        refresh: () => [baseSkill],
        loadSkillsForAgent: () => [baseSkill],
        getAgentSkillsView: () => ({ available: [baseSkill], enabled: [baseSkill], eligible: [baseSkill] }),
      } as any,
      { getAgent: () => ({ config: { id: 'agent-1' } }) } as any,
    )

    const res = await app.request('/skills/stats')
    const body = await res.json() as { totalCached: number; lastLoadedAt: number; config: { maxSkillCount: number } }

    expect(body.totalCached).toBe(1)
    expect(body.lastLoadedAt).toBe(123)
    expect(body.config.maxSkillCount).toBe(50)
  })

  test('GET /skills/:name returns 404 when not found', async () => {
    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [baseSkill],
        getCacheStats: () => ({}),
        getConfig: () => ({}),
        refresh: () => [baseSkill],
        loadSkillsForAgent: () => [baseSkill],
        getAgentSkillsView: () => ({ available: [], enabled: [], eligible: [] }),
      } as any,
      { getAgent: () => ({ config: { id: 'agent-1' } }) } as any,
    )

    const res = await app.request('/skills/missing')

    expect(res.status).toBe(404)
  })

  test('GET /agents/:id/skills returns skills view when agent exists', async () => {
    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [baseSkill],
        getCacheStats: () => ({}),
        getConfig: () => ({}),
        refresh: () => [baseSkill],
        loadSkillsForAgent: () => [baseSkill],
        getAgentSkillsView: () => ({
          available: [baseSkill],
          enabled: [baseSkill],
          eligible: [baseSkill],
        }),
      } as any,
      { getAgent: (id: string) => id === 'agent-1' ? { config: { id } } : undefined } as any,
    )

    const ok = await app.request('/agents/agent-1/skills')
    const missing = await app.request('/agents/missing/skills')

    expect(ok.status).toBe(200)
    const body = await ok.json() as { available: Array<{ name: string }>; enabled: Array<{ name: string }>; eligible: Array<{ name: string }> }
    expect(body.available[0]?.name).toBe('pdf')
    expect(body.enabled[0]?.name).toBe('pdf')
    expect(body.eligible[0]?.name).toBe('pdf')
    expect(missing.status).toBe(404)
  })

  test('POST /skills/:name/toggle toggles correctly', async () => {
    const disabledSkill = { ...baseSkill, enabled: false, usable: false }
    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [baseSkill],
        getCacheStats: () => ({}),
        getConfig: () => ({}),
        refresh: () => [disabledSkill],
        loadSkillsForAgent: () => [baseSkill],
        setSkillEnabled: (_name: string, _enabled: boolean) => disabledSkill,
      } as any,
      { getAgent: () => ({ config: { id: 'agent-1' } }) } as any,
    )

    const res = await app.request('/skills/pdf/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    })
    const body = await res.json() as { name: string; enabled: boolean; usable: boolean }

    expect(res.status).toBe(200)
    expect(body.name).toBe('pdf')
    expect(body.enabled).toBe(false)
    expect(body.usable).toBe(false)
  })

  test('POST /skills/:name/toggle returns 404 for nonexistent skill', async () => {
    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [baseSkill],
        getCacheStats: () => ({}),
        getConfig: () => ({}),
        refresh: () => [baseSkill],
        loadSkillsForAgent: () => [baseSkill],
        setSkillEnabled: () => null,
      } as any,
      { getAgent: () => ({ config: { id: 'agent-1' } }) } as any,
    )

    const res = await app.request('/skills/nonexistent/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    })

    expect(res.status).toBe(404)
  })

  test('POST /skills/reload returns count and reloadedAt', async () => {
    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [baseSkill],
        getCacheStats: () => ({}),
        getConfig: () => ({}),
        refresh: () => [baseSkill],
        loadSkillsForAgent: () => [baseSkill],
      } as any,
      { getAgent: () => ({ config: { id: 'agent-1' } }) } as any,
    )

    const res = await app.request('/skills/reload', { method: 'POST' })
    const body = await res.json() as { count: number; reloadedAt: number }

    expect(res.status).toBe(200)
    expect(body.count).toBe(1)
    expect(typeof body.reloadedAt).toBe('number')
  })

  test('POST /skills/:name/toggle with invalid body returns 400', async () => {
    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [baseSkill],
        getCacheStats: () => ({}),
        getConfig: () => ({}),
        refresh: () => [baseSkill],
        loadSkillsForAgent: () => [baseSkill],
        setSkillEnabled: (_name: string, _enabled: boolean) => baseSkill,
      } as any,
      { getAgent: () => ({ config: { id: 'agent-1' } }) } as any,
    )

    const res = await app.request('/skills/pdf/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: 'not-a-boolean' }),
    })

    expect(res.status).toBe(400)
  })

  test('POST /skills/install-from-path with invalid body returns 400', async () => {
    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [baseSkill],
        getCacheStats: () => ({}),
        getConfig: () => ({}),
        refresh: () => [baseSkill],
        loadSkillsForAgent: () => [baseSkill],
      } as any,
      { getAgent: () => ({ config: { id: 'agent-1' } }) } as any,
    )

    const res = await app.request('/skills/install-from-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(400)
  })

  test('POST /skills/install-from-path installs the folder and writes folder-import metadata', async () => {
    let refreshCount = 0
    const root = mkdtempSync(resolve(tmpdir(), 'youclaw-route-folder-'))
    tempDirs.push(root)
    const sourcePath = resolve(root, 'folder-skill')
    const targetDir = resolve(root, 'skills')

    mkdirSync(resolve(sourcePath, 'scripts'), { recursive: true })
    writeFileSync(resolve(sourcePath, 'SKILL.md'), '---\nname: folder-skill\ndescription: Folder import\n---\nHello\n', 'utf-8')
    writeFileSync(resolve(sourcePath, 'README.md'), '# Folder import\n', 'utf-8')
    writeFileSync(resolve(sourcePath, 'scripts/setup.sh'), 'echo setup\n', 'utf-8')

    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [baseSkill],
        getCacheStats: () => ({}),
        getConfig: () => ({}),
        refresh: () => {
          refreshCount += 1
          return [baseSkill]
        },
        loadSkillsForAgent: () => [baseSkill],
      } as any,
      { getAgent: () => ({ config: { id: 'agent-1' } }) } as any,
    )

    const res = await app.request('/skills/install-from-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath, targetDir }),
    })
    const body = await res.json() as { ok: boolean }
    const installedSkillDir = resolve(targetDir, 'folder-skill')
    const projectMetaPath = resolve(installedSkillDir, '.youclaw-skill.json')
    const registryMetaPath = resolve(installedSkillDir, '.registry.json')

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(refreshCount).toBe(1)
    expect(readFileSync(resolve(installedSkillDir, 'SKILL.md'), 'utf-8'))
      .toBe('---\nname: folder-skill\ndescription: Folder import\n---\nHello\n')
    expect(readFileSync(resolve(installedSkillDir, 'README.md'), 'utf-8')).toBe('# Folder import\n')
    expect(readFileSync(resolve(installedSkillDir, 'scripts/setup.sh'), 'utf-8')).toBe('echo setup\n')
    expect(JSON.parse(readFileSync(projectMetaPath, 'utf-8'))).toMatchObject({
      schemaVersion: 1,
      managed: false,
      origin: 'manual',
    })
    expect(JSON.parse(readFileSync(registryMetaPath, 'utf-8'))).toMatchObject({
      source: 'folder-import',
      provider: 'folder-import',
      sourcePath,
      slug: 'folder-skill',
    })
  })

  test('POST /skills/install-from-url with invalid body returns 400', async () => {
    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [baseSkill],
        getCacheStats: () => ({}),
        getConfig: () => ({}),
        refresh: () => [baseSkill],
        loadSkillsForAgent: () => [baseSkill],
      } as any,
      { getAgent: () => ({ config: { id: 'agent-1' } }) } as any,
    )

    const res = await app.request('/skills/install-from-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'not-a-valid-url' }),
    })

    expect(res.status).toBe(400)
  })

  test('POST /skills/install-from-archive installs uploaded zip and refreshes the loader', async () => {
    let refreshCount = 0
    const root = mkdtempSync(resolve(tmpdir(), 'youclaw-route-archive-'))
    tempDirs.push(root)
    const targetDir = resolve(root, 'skills')
    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [baseSkill],
        getCacheStats: () => ({}),
        getConfig: () => ({}),
        refresh: () => {
          refreshCount += 1
          return [baseSkill]
        },
        loadSkillsForAgent: () => [baseSkill],
      } as any,
      { getAgent: () => ({ config: { id: 'agent-1' } }) } as any,
    )

    const archive = zipSync({
      'bundle/SKILL.md': strToU8('---\nname: archive-skill\ndescription: Uploaded skill\n---\nHello\n'),
      'bundle/README.md': strToU8('# Uploaded skill\n'),
      'bundle/scripts/install.sh': strToU8('echo install\n'),
    })
    const formData = new FormData()
    formData.set('file', new File([archive], 'archive-skill.zip', { type: 'application/zip' }))
    formData.set('targetDir', targetDir)

    const res = await app.request('/skills/install-from-archive', {
      method: 'POST',
      body: formData,
    })
    const body = await res.json() as { ok: boolean }
    const installedSkillDir = resolve(targetDir, 'archive-skill')
    const projectMetaPath = resolve(installedSkillDir, '.youclaw-skill.json')
    const registryMetaPath = resolve(installedSkillDir, '.registry.json')

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(refreshCount).toBe(1)
    expect(basename(installedSkillDir)).toBe('archive-skill')
    expect(readFileSync(resolve(installedSkillDir, 'SKILL.md'), 'utf-8'))
      .toBe('---\nname: archive-skill\ndescription: Uploaded skill\n---\nHello\n')
    expect(readFileSync(resolve(installedSkillDir, 'README.md'), 'utf-8')).toBe('# Uploaded skill\n')
    expect(readFileSync(resolve(installedSkillDir, 'scripts/install.sh'), 'utf-8')).toBe('echo install\n')
    expect(existsSync(projectMetaPath)).toBe(true)
    expect(JSON.parse(readFileSync(projectMetaPath, 'utf-8'))).toMatchObject({
      schemaVersion: 1,
      managed: false,
      origin: 'imported',
    })
    expect(JSON.parse(readFileSync(registryMetaPath, 'utf-8'))).toMatchObject({
      source: 'zip-upload',
      provider: 'zip-upload',
      originalFilename: 'archive-skill.zip',
      slug: 'archive-skill',
    })
  })

  test('POST /skills/install-from-archive rejects archives without a root SKILL.md', async () => {
    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [baseSkill],
        getCacheStats: () => ({}),
        getConfig: () => ({}),
        refresh: () => [baseSkill],
        loadSkillsForAgent: () => [baseSkill],
      } as any,
      { getAgent: () => ({ config: { id: 'agent-1' } }) } as any,
    )

    const archive = zipSync({
      'bundle/README.md': strToU8('# Missing skill entry\n'),
    })
    const formData = new FormData()
    formData.set('file', new File([archive], 'broken-skill.zip', { type: 'application/zip' }))

    const res = await app.request('/skills/install-from-archive', {
      method: 'POST',
      body: formData,
    })
    const body = await res.json() as { error: string }

    expect(res.status).toBe(400)
    expect(body.error).toBe('Archive does not contain a root SKILL.md')
  })

  test('POST /skills/install-from-archive rejects skill names that escape the staging directory', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'youclaw-route-archive-unsafe-'))
    tempDirs.push(root)
    const targetDir = resolve(root, 'skills')
    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [baseSkill],
        getCacheStats: () => ({}),
        getConfig: () => ({}),
        refresh: () => [baseSkill],
        loadSkillsForAgent: () => [baseSkill],
      } as any,
      { getAgent: () => ({ config: { id: 'agent-1' } }) } as any,
    )

    const archive = zipSync({
      'bundle/SKILL.md': strToU8('---\nname: ..\ndescription: Uploaded skill\n---\nHello\n'),
    })
    const formData = new FormData()
    formData.set('file', new File([archive], 'unsafe-skill.zip', { type: 'application/zip' }))
    formData.set('targetDir', targetDir)

    const res = await app.request('/skills/install-from-archive', {
      method: 'POST',
      body: formData,
    })
    const body = await res.json() as { error: string }

    expect(res.status).toBe(400)
    expect(body.error).toBe('Skill name must resolve to a safe directory name')
    expect(existsSync(targetDir)).toBe(false)
    expect(existsSync(resolve(root, 'unsafe-skill'))).toBe(false)
  })

  test('GET /skills/import/providers returns the available import providers', async () => {
    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [baseSkill],
        getCacheStats: () => ({}),
        getConfig: () => ({}),
        refresh: () => [baseSkill],
        loadSkillsForAgent: () => [baseSkill],
      } as any,
      { getAgent: () => ({ config: { id: 'agent-1' } }) } as any,
      {
        importManager: {
          listProviders: () => [
            {
              id: 'raw-url',
              label: 'Raw URL',
              description: 'Import a SKILL.md by URL',
              capabilities: {
                probe: true,
                singleFile: true,
                directoryTree: false,
                auth: 'none',
              },
            },
          ],
        } as any,
      },
    )

    const res = await app.request('/skills/import/providers')
    const body = await res.json() as Array<{ id: string }>

    expect(res.status).toBe(200)
    expect(body.map((item) => item.id)).toEqual(['raw-url'])
  })

  test('POST /skills/import/raw-url/probe validates input and returns probe details', async () => {
    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [baseSkill],
        getCacheStats: () => ({}),
        getConfig: () => ({}),
        refresh: () => [baseSkill],
        loadSkillsForAgent: () => [baseSkill],
      } as any,
      { getAgent: () => ({ config: { id: 'agent-1' } }) } as any,
      {
        importManager: {
          listProviders: () => [],
          probe: async () => ({
            provider: 'raw-url',
            ok: true,
            suggestedName: 'hello-world',
            summary: 'Friendly greeting',
          }),
        } as any,
      },
    )

    const invalid = await app.request('/skills/import/raw-url/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const valid = await app.request('/skills/import/raw-url/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/SKILL.md' }),
    })
    const body = await valid.json() as { provider: string; suggestedName?: string }

    expect(invalid.status).toBe(400)
    expect(valid.status).toBe(200)
    expect(body.provider).toBe('raw-url')
    expect(body.suggestedName).toBe('hello-world')
  })

  test('POST /skills/import/raw-url/probe normalizes pasted markdown bullet URLs', async () => {
    let capturedUrl = ''
    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [baseSkill],
        getCacheStats: () => ({}),
        getConfig: () => ({}),
        refresh: () => [baseSkill],
        loadSkillsForAgent: () => [baseSkill],
      } as any,
      { getAgent: () => ({ config: { id: 'agent-1' } }) } as any,
      {
        importManager: {
          listProviders: () => [],
          probe: async (_provider: string, payload: { url: string }) => {
            capturedUrl = payload.url
            return {
              provider: 'raw-url',
              ok: true,
            }
          },
        } as any,
      },
    )

    const res = await app.request('/skills/import/raw-url/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: '- https://example.com/SKILL.md' }),
    })

    expect(res.status).toBe(200)
    expect(capturedUrl).toBe('https://example.com/SKILL.md')
  })

  test('POST /skills/import/github imports and refreshes the loader', async () => {
    let imported = false
    let refreshCount = 0
    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [baseSkill],
        getCacheStats: () => ({}),
        getConfig: () => ({}),
        refresh: () => {
          refreshCount += 1
          return [baseSkill]
        },
        loadSkillsForAgent: () => [baseSkill],
      } as any,
      { getAgent: () => ({ config: { id: 'agent-1' } }) } as any,
      {
        importManager: {
          listProviders: () => [],
          import: async (provider: string, payload: { repoUrl: string }) => {
            imported = provider === 'github' && payload.repoUrl === 'https://github.com/acme/skills'
          },
        } as any,
      },
    )

    const res = await app.request('/skills/import/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: 'https://github.com/acme/skills' }),
    })
    const body = await res.json() as { ok: boolean }

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(imported).toBe(true)
    expect(refreshCount).toBe(1)
  })

  test('POST /skills/import/github/probe validates input and returns probe details', async () => {
    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [baseSkill],
        getCacheStats: () => ({}),
        getConfig: () => ({}),
        refresh: () => [baseSkill],
        loadSkillsForAgent: () => [baseSkill],
      } as any,
      { getAgent: () => ({ config: { id: 'agent-1' } }) } as any,
      {
        importManager: {
          listProviders: () => [],
          probe: async () => ({
            provider: 'github',
            ok: true,
            suggestedName: 'github-ops',
            summary: 'GitHub helper',
            metadata: {
              targetKind: 'skill-file',
              path: 'skills/github-ops/SKILL.md',
            },
          }),
        } as any,
      },
    )

    const invalid = await app.request('/skills/import/github/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const valid = await app.request('/skills/import/github/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: 'https://github.com/acme/tools/blob/main/skills/github-ops/SKILL.md' }),
    })
    const body = await valid.json() as { provider: string; suggestedName?: string; metadata?: { targetKind?: string } }

    expect(invalid.status).toBe(400)
    expect(valid.status).toBe(200)
    expect(body.provider).toBe('github')
    expect(body.suggestedName).toBe('github-ops')
    expect(body.metadata?.targetKind).toBe('skill-file')
  })

  test('POST /skills/import/github/probe normalizes pasted markdown bullet URLs', async () => {
    let capturedRepoUrl = ''
    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [baseSkill],
        getCacheStats: () => ({}),
        getConfig: () => ({}),
        refresh: () => [baseSkill],
        loadSkillsForAgent: () => [baseSkill],
      } as any,
      { getAgent: () => ({ config: { id: 'agent-1' } }) } as any,
      {
        importManager: {
          listProviders: () => [],
          probe: async (_provider: string, payload: { repoUrl: string }) => {
            capturedRepoUrl = payload.repoUrl
            return {
              provider: 'github',
              ok: true,
            }
          },
        } as any,
      },
    )

    const res = await app.request('/skills/import/github/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: '- https://github.com/acme/tools/tree/main/skills/github-ops' }),
    })

    expect(res.status).toBe(200)
    expect(capturedRepoUrl).toBe('https://github.com/acme/tools/tree/main/skills/github-ops')
  })

  test('GET /skills classifies imported project skills as user external skills', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'youclaw-route-skill-'))
    tempDirs.push(root)

    const skillDir = resolve(root, 'gradio')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(resolve(skillDir, '.youclaw-skill.json'), JSON.stringify({
      schemaVersion: 1,
      managed: false,
      origin: 'imported',
      createdAt: '2026-03-19T16:10:08.722Z',
      updatedAt: '2026-03-19T16:10:08.722Z',
    }), 'utf-8')

    const importedProjectSkill = {
      ...baseSkill,
      name: 'gradio',
      source: 'builtin',
      path: resolve(skillDir, 'SKILL.md'),
      registryMeta: {
        source: 'raw-url',
        slug: 'gradio',
        installedAt: '2026-03-19T16:10:08.722Z',
      },
    }

    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [importedProjectSkill],
        getCacheStats: () => ({}),
        getConfig: () => ({}),
        refresh: () => [importedProjectSkill],
        loadSkillsForAgent: () => [importedProjectSkill],
        getAgentSkillsView: () => ({ available: [importedProjectSkill], enabled: [], eligible: [] }),
      } as any,
      { getAgent: () => ({ config: { id: 'agent-1' } }) } as any,
    )

    const res = await app.request('/skills')
    const body = await res.json() as Array<{
      name: string
      catalogGroup: string
      userSkillKind?: string
      externalSource?: string
    }>

    expect(res.status).toBe(200)
    expect(body[0]).toMatchObject({
      name: 'gradio',
      catalogGroup: 'user',
      userSkillKind: 'external',
      externalSource: 'url',
    })
  })

  test('DELETE /skills/:name returns 403 for workspace-level skill', async () => {
    const workspaceSkill = { ...baseSkill, source: 'workspace' }
    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [workspaceSkill],
        getCacheStats: () => ({}),
        getConfig: () => ({}),
        refresh: () => [workspaceSkill],
        loadSkillsForAgent: () => [workspaceSkill],
      } as any,
      { getAgent: () => ({ config: { id: 'agent-1' } }) } as any,
    )

    const res = await app.request('/skills/pdf', { method: 'DELETE' })

    expect(res.status).toBe(403)
  })

  test('DELETE /skills/:name returns 404 for nonexistent skill', async () => {
    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [baseSkill],
        getCacheStats: () => ({}),
        getConfig: () => ({}),
        refresh: () => [baseSkill],
        loadSkillsForAgent: () => [baseSkill],
      } as any,
      { getAgent: () => ({ config: { id: 'agent-1' } }) } as any,
    )

    const res = await app.request('/skills/nonexistent', { method: 'DELETE' })

    expect(res.status).toBe(404)
  })

  test('GET /skills returns items with enabled and usable fields', async () => {
    const app = createSkillsRoutes(
      {
        loadAllSkills: () => [baseSkill],
        getCacheStats: () => ({}),
        getConfig: () => ({}),
        refresh: () => [baseSkill],
        loadSkillsForAgent: () => [baseSkill],
      } as any,
      { getAgent: () => ({ config: { id: 'agent-1' } }) } as any,
    )

    const res = await app.request('/skills')
    const body = await res.json() as Array<{ name: string; enabled: boolean; usable: boolean }>

    expect(res.status).toBe(200)
    expect(body[0]?.enabled).toBe(true)
    expect(body[0]?.usable).toBe(true)
  })

  test('removed template endpoints return 404', async () => {
    const fixture = createRoutesFixture()
    const app = createSkillsRoutes(fixture.loader as any, fixture.agentManager as any, {
      skillsDir: fixture.skillsDir,
    })

    expect((await app.request('/templates')).status).toBe(404)
    expect((await app.request('/templates/release-template')).status).toBe(404)
    expect((await app.request('/skills/templates')).status).toBe(404)
    expect((await app.request('/skills/templates/workflow')).status).toBe(404)
    expect((await app.request('/skill-templates')).status).toBe(404)
    expect((await app.request('/skill-templates/workflow')).status).toBe(404)
  })
})

describe('managed skill serialization', () => {
  test('serializes authoring detail under skill key', () => {
    const detail: SkillProjectDetail = {
      project: {
        name: 'release-helper',
        rootDir: '/tmp/release-helper',
        entryFile: 'SKILL.md',
        path: '/tmp/release-helper/SKILL.md',
        source: 'user',
        editable: true,
        managed: true,
        origin: 'user',
        createdAt: '2026-03-19T00:00:00.000Z',
        updatedAt: '2026-03-19T00:00:00.000Z',
        hasPublished: true,
        hasDraft: false,
        description: 'Ship builds',
        boundAgentIds: ['default'],
      },
      publishedDraft: null,
      draft: null,
      draftMeta: null,
      bindingStates: [{ id: 'default', name: 'Default', state: 'bound' }],
    }

    const serialized = serializeManagedSkillDetail(detail)

    expect(serialized.skill.name).toBe('release-helper')
    expect(serialized.skill.catalogGroup).toBe('user')
    expect(serialized.skill.userSkillKind).toBe('custom')
    expect(serialized.skill.sortTimestamp).toBe('2026-03-19T00:00:00.000Z')
    expect(serialized.bindingStates[0]?.state).toBe('bound')
    expect('project' in serialized).toBe(false)
  })
})

function createRoutesFixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'youclaw-routes-template-'))
  tempDirs.push(root)
  const skillsDir = resolve(root, 'skills')
  const agentDir = resolve(root, 'agents', 'default')

  mkdirSync(skillsDir, { recursive: true })
  mkdirSync(agentDir, { recursive: true })

  writeFileSync(resolve(agentDir, 'agent.yaml'), stringifyYaml({
    id: 'default',
    name: 'Default',
    skills: [],
  }))

  const loader = {
    loadAllSkills: () => [],
    getCacheStats: () => ({}),
    getConfig: () => ({}),
    refresh: () => [],
    loadSkillsForAgent: () => [],
    getAgentSkillsView: () => ({ available: [], enabled: [], eligible: [] }),
    setSkillEnabled: () => null,
    deleteSkill: () => ({ ok: true }),
  }

  const agentManager = {
    getAgents: () => [],
    getAgent: (_id: string) => ({
      config: { id: 'default', name: 'Default', workspaceDir: agentDir, skills: [] },
      workspaceDir: agentDir,
    }),
    reloadAgents: async () => {},
  }

  return { root, skillsDir, agentDir, loader, agentManager }
}
