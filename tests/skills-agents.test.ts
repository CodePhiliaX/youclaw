import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import './setup-light.ts'
import { Hono } from 'hono'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml'
import { createSkillsRoutes } from '../src/routes/skills.ts'
import type { SkillsLoader } from '../src/skills/index.ts'
import type { AgentManager } from '../src/agent/index.ts'
import type { AgentConfig } from '../src/agent/types.ts'
import type { Skill } from '../src/skills/types.ts'

// ---------- helpers ----------

function createMockSkill(name: string, source: 'builtin' | 'workspace' | 'user' = 'workspace'): Skill {
  return {
    name,
    source,
    frontmatter: { name, description: `${name} skill` },
    content: 'body',
    path: `/tmp/skills/${name}/SKILL.md`,
    eligible: true,
    eligibilityErrors: [],
    eligibilityDetail: {
      os: { passed: true, current: process.platform },
      dependencies: { passed: true, results: [] },
      env: { passed: true, results: [] },
    },
    loadedAt: Date.now(),
    enabled: true,
    usable: true,
  } as Skill
}

function createMockAgent(id: string, workspaceDir: string, skills?: string[]): AgentConfig {
  return {
    id,
    name: `Agent ${id}`,
    model: 'claude-sonnet-4-6',
    workspaceDir,
    ...(skills !== undefined ? { skills } : {}),
  } as AgentConfig
}

function buildApp(skills: Skill[], agents: AgentConfig[]) {
  const mockSkillsLoader = {
    loadAllSkills: () => skills,
    refresh: mock(() => skills),
    getCacheStats: mock(() => ({})),
    getConfig: mock(() => ({})),
    setSkillEnabled: mock(() => null),
    getAgentSkillsView: mock(() => ({ available: [], enabled: [], eligible: [] })),
  } as unknown as SkillsLoader

  const mockAgentManager = {
    getAgents: () => agents,
    getAgent: (id: string) => agents.find((a) => a.id === id) ?? null,
    reloadAgents: mock(async () => {}),
  } as unknown as AgentManager

  const app = new Hono()
  const routes = createSkillsRoutes(mockSkillsLoader, mockAgentManager)
  app.route('/api', routes)

  return { app, mockSkillsLoader, mockAgentManager }
}

// ---------- GET /api/skills/:name/agents ----------

describe('GET /api/skills/:name/agents', () => {
  test('returns empty agents array when no agent references the skill', async () => {
    const { app } = buildApp(
      [createMockSkill('my-skill')],
      [createMockAgent('a1', '/tmp/a1', ['other-skill'])],
    )

    const res = await app.request('/api/skills/my-skill/agents')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.agents).toEqual([])
  })

  test('returns agents that have the skill in their skills array', async () => {
    const { app } = buildApp(
      [createMockSkill('search')],
      [
        createMockAgent('a1', '/tmp/a1', ['search', 'translate']),
        createMockAgent('a2', '/tmp/a2', ['search']),
        createMockAgent('a3', '/tmp/a3', ['translate']),
      ],
    )

    const res = await app.request('/api/skills/search/agents')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.agents).toEqual([
      { id: 'a1', name: 'Agent a1' },
      { id: 'a2', name: 'Agent a2' },
    ])
  })

  test('ignores agents that do not have a skills field', async () => {
    const { app } = buildApp(
      [createMockSkill('search')],
      [
        createMockAgent('with-skills', '/tmp/ws', ['search']),
        createMockAgent('no-skills', '/tmp/ns'), // no skills field
      ],
    )

    const res = await app.request('/api/skills/search/agents')
    expect(res.status).toBe(200)
    const body = await res.json()
    // Only the agent with an explicit skills array containing "search" should appear
    expect(body.agents).toEqual([{ id: 'with-skills', name: 'Agent with-skills' }])
  })

  test('returns 200 with empty agents even if the skill does not exist', async () => {
    const { app } = buildApp([], [createMockAgent('a1', '/tmp/a1', ['something'])])

    const res = await app.request('/api/skills/nonexistent/agents')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.agents).toEqual([])
  })
})

// ---------- DELETE /api/skills/:name — cleanup behavior ----------

describe('DELETE /api/skills/:name cleanup', () => {
  const tmpBase = `/tmp/youclaw-skills-agents-test-${Date.now()}`

  beforeEach(() => {
    mkdirSync(tmpBase, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(tmpBase)) {
      rmSync(tmpBase, { recursive: true, force: true })
    }
  })

  function setupAgentDir(agentId: string, yamlContent: Record<string, unknown>): string {
    const dir = resolve(tmpBase, agentId)
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolve(dir, 'agent.yaml'), stringifyYaml(yamlContent), 'utf-8')
    return dir
  }

  test('after deleting a skill, agent configs that referenced it have the skill removed', async () => {
    const skillName = 'doomed-skill'
    const dir1 = setupAgentDir('agent1', {
      id: 'agent1',
      name: 'Agent 1',
      model: 'claude-sonnet-4-6',
      skills: [skillName, 'keep-me'],
    })
    const dir2 = setupAgentDir('agent2', {
      id: 'agent2',
      name: 'Agent 2',
      model: 'claude-sonnet-4-6',
      skills: [skillName],
    })

    const skill = createMockSkill(skillName, 'user')
    // uninstall requires a real directory, so create a fake skill dir
    const skillDir = resolve(tmpBase, 'skills-dir', skillName)
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(resolve(skillDir, 'SKILL.md'), 'body', 'utf-8')
    skill.path = resolve(skillDir, 'SKILL.md')

    const agents = [
      createMockAgent('agent1', dir1, [skillName, 'keep-me']),
      createMockAgent('agent2', dir2, [skillName]),
    ]

    const { app, mockAgentManager } = buildApp([skill], agents)

    // Mock SkillsInstaller.uninstall so it doesn't actually remove files
    const { SkillsInstaller } = await import('../src/skills/installer.ts')
    const origUninstall = SkillsInstaller.prototype.uninstall
    SkillsInstaller.prototype.uninstall = async () => {}

    try {
      const res = await app.request(`/api/skills/${skillName}`, { method: 'DELETE' })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)

      // Verify agent1's yaml no longer contains the deleted skill but keeps others
      const yaml1 = parseYaml(readFileSync(resolve(dir1, 'agent.yaml'), 'utf-8'))
      expect(yaml1.skills).toEqual(['keep-me'])

      // Verify agent2's yaml has an empty skills array
      const yaml2 = parseYaml(readFileSync(resolve(dir2, 'agent.yaml'), 'utf-8'))
      expect(yaml2.skills).toEqual([])

      // Verify reloadAgents was called
      expect(mockAgentManager.reloadAgents).toHaveBeenCalled()
    } finally {
      SkillsInstaller.prototype.uninstall = origUninstall
    }
  })

  test('agents without a skills field are not modified during deletion', async () => {
    const skillName = 'some-skill'
    const originalYaml = {
      id: 'no-skills-agent',
      name: 'No Skills Agent',
      model: 'claude-sonnet-4-6',
    }
    const dir = setupAgentDir('no-skills-agent', originalYaml)

    const skill = createMockSkill(skillName, 'user')
    const skillDir = resolve(tmpBase, 'skills-dir2', skillName)
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(resolve(skillDir, 'SKILL.md'), 'body', 'utf-8')
    skill.path = resolve(skillDir, 'SKILL.md')

    const agents = [
      createMockAgent('no-skills-agent', dir), // no skills field
    ]

    const { app } = buildApp([skill], agents)

    const { SkillsInstaller } = await import('../src/skills/installer.ts')
    const origUninstall = SkillsInstaller.prototype.uninstall
    SkillsInstaller.prototype.uninstall = async () => {}

    try {
      const res = await app.request(`/api/skills/${skillName}`, { method: 'DELETE' })
      expect(res.status).toBe(200)

      // Verify the yaml file was not modified
      const yaml = parseYaml(readFileSync(resolve(dir, 'agent.yaml'), 'utf-8'))
      expect(yaml.skills).toBeUndefined()
      expect(yaml.id).toBe('no-skills-agent')
    } finally {
      SkillsInstaller.prototype.uninstall = origUninstall
    }
  })
})
