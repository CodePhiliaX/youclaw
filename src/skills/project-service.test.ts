import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { stringify as stringifyYaml } from 'yaml'
import type { AgentConfig } from '../agent/types.ts'
import { SkillProjectService } from './project-service.ts'
import type { Skill } from './types.ts'

class FakeSkillsLoader {
  skills: Skill[] = []

  loadAllSkills(): Skill[] {
    return this.skills
  }

  refresh(): Skill[] {
    return this.skills
  }
}

class FakeAgentManager {
  reloadCount = 0

  constructor(private readonly agents: AgentConfig[]) {}

  getAgents(): AgentConfig[] {
    return this.agents
  }

  getAgent(agentId: string) {
    const config = this.agents.find((agent) => agent.id === agentId)
    return config ? { config, workspaceDir: config.workspaceDir } : undefined
  }

  async reloadAgents(): Promise<void> {
    this.reloadCount += 1
    for (const agent of this.agents) {
      const yamlPath = resolve(agent.workspaceDir, 'agent.yaml')
      const nextSkills = parseSkills(readFileSync(yamlPath, 'utf-8'))
      agent.skills = nextSkills
    }
  }
}

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe('SkillProjectService', () => {
  test('creates managed project metadata and draft files', () => {
    const fixture = createFixture()
    const detail = fixture.service.createProject({
      name: 'Release Helper',
      description: 'Automates release checks',
    })

    expect(detail.project.name).toBe('release-helper')
    expect(detail.project.editable).toBe(true)
    expect(detail.project.origin).toBe('user')
    expect(detail.project.hasDraft).toBe(true)
    expect(existsSync(resolve(fixture.skillsDir, 'release-helper', '.youclaw-skill.json'))).toBe(true)
    expect(existsSync(resolve(fixture.skillsDir, 'release-helper', '.draft', 'SKILL.md'))).toBe(true)
  })

  test('publishes renamed draft and updates bound agents', async () => {
    const fixture = createFixture()
    fixture.service.createProject({
      name: 'Release Helper',
      description: 'Automates release checks',
    })
    fixture.service.saveDraft('release-helper', {
      mode: 'form',
      draft: {
        frontmatter: {
          name: 'release-helper',
          description: 'Initial release helper',
        },
        content: '# Ship Helper\n\n## Workflow\n\n1. Check release readiness.',
      },
    })
    await fixture.service.publishDraft('release-helper')
    await fixture.service.bindSkill('release-helper', 'default')
    fixture.service.saveDraft('release-helper', {
      mode: 'form',
      draft: {
        frontmatter: {
          name: 'ship-helper',
          description: 'Updated release helper',
        },
        content: '# Ship Helper\n\n## Workflow\n\n1. Check release readiness.',
      },
    })

    const published = await fixture.service.publishDraft('release-helper')

    expect(published.project.name).toBe('ship-helper')
    expect(existsSync(resolve(fixture.skillsDir, 'ship-helper', 'SKILL.md'))).toBe(true)
    expect(existsSync(resolve(fixture.skillsDir, 'release-helper'))).toBe(false)
    expect(parseSkills(readFileSync(resolve(fixture.agentDir, 'agent.yaml'), 'utf-8'))).toEqual(['ship-helper'])
  })

  test('publishes draft and applies all selected agent bindings with one reload', async () => {
    const fixture = createFixture({
      agents: [
        { id: 'default', name: 'Default', skills: [] },
        { id: 'writer', name: 'Writer', skills: [] },
      ],
    })

    fixture.service.createProject({
      name: 'Release Helper',
      description: 'Automates release checks',
    })
    fixture.service.saveDraft('release-helper', {
      mode: 'form',
      draft: {
        frontmatter: {
          name: 'release-helper',
          description: 'Initial release helper',
        },
        content: '# Ship Helper\n\n## Workflow\n\n1. Check release readiness.',
      },
    })

    const published = await fixture.service.publishDraft('release-helper', {
      bindingAgentIds: ['default', 'writer'],
    })

    expect(published.bindingStates.filter((binding) => binding.state === 'bound').map((binding) => binding.id).sort()).toEqual(['default', 'writer'])
    expect(parseSkills(readFileSync(resolve(fixture.agentDirs.default, 'agent.yaml'), 'utf-8'))).toEqual(['release-helper'])
    expect(parseSkills(readFileSync(resolve(fixture.agentDirs.writer, 'agent.yaml'), 'utf-8'))).toEqual(['release-helper'])
    expect(fixture.agentManager.reloadCount).toBe(1)
  })

  test('deletes project and removes agent bindings', async () => {
    const fixture = createFixture()
    fixture.service.createProject({
      name: 'Repo Doctor',
      description: 'Checks repo state',
    })
    fixture.service.saveDraft('repo-doctor', {
      mode: 'form',
      draft: {
        frontmatter: {
          name: 'repo-doctor',
          description: 'Checks repo state',
        },
        content: '# Repo Doctor',
      },
    })
    await fixture.service.publishDraft('repo-doctor')
    await fixture.service.bindSkill('repo-doctor', 'default')

    const result = await fixture.service.deleteProject('repo-doctor')

    expect(result.ok).toBe(true)
    expect(result.affectedAgents.map((agent) => agent.id)).toEqual(['default'])
    expect(existsSync(resolve(fixture.skillsDir, 'repo-doctor'))).toBe(false)
    expect(parseSkills(readFileSync(resolve(fixture.agentDir, 'agent.yaml'), 'utf-8'))).toEqual([])
  })

  test('creates managed project with blank draft body and version 1', () => {
    const fixture = createFixture()

    const detail = fixture.service.createProject({
      name: 'Snapshot Worker',
      description: 'Skill created from blank draft',
    })

    expect(detail.project.name).toBe('snapshot-worker')
    expect(detail.draft?.frontmatter.version).toBe('1')
    expect(detail.draft?.content).toBe('')
  })

  test('validateDraft rejects non-integer skill version', () => {
    const fixture = createFixture()

    const validation = fixture.service.validateDraft('release-helper', {
      mode: 'form',
      draft: {
        frontmatter: {
          name: 'release-helper',
          description: 'Automates release checks',
          version: '1.2',
        },
        content: '# Release Helper',
      },
    })

    expect(validation.errors).toContainEqual({
      field: 'version',
      message: 'Skill version must be an integer',
    })
  })

  test('supports unicode letters when normalizing skill names', () => {
    const fixture = createFixture()

    const detail = fixture.service.createProject({
      name: 'Alpha Omega Ü 01',
      description: 'Verifies unicode-friendly skill identifiers',
    })

    expect(detail.project.name).toBe('alpha-omega-ü-01')
    expect(existsSync(resolve(fixture.skillsDir, 'alpha-omega-ü-01', '.youclaw-skill.json'))).toBe(true)
  })
})

function createFixture(options?: {
  agents?: Array<{ id: string; name: string; skills?: string[] }>
}) {
  const root = mkdtempSync(resolve(tmpdir(), 'youclaw-skill-project-'))
  tempDirs.push(root)
  const skillsDir = resolve(root, 'skills')
  mkdirSync(skillsDir, { recursive: true })
  const agentDefinitions = options?.agents ?? [{ id: 'default', name: 'Default', skills: [] }]
  const agentDirs = Object.fromEntries(agentDefinitions.map((agent) => [agent.id, resolve(root, 'agents', agent.id)]))
  const agentConfigs = agentDefinitions.map((agent) => {
    const workspaceDir = agentDirs[agent.id]
    mkdirSync(workspaceDir, { recursive: true })
    writeFileSync(resolve(workspaceDir, 'agent.yaml'), stringifyYaml({
      id: agent.id,
      name: agent.name,
      skills: agent.skills ?? [],
    }))

    return {
      id: agent.id,
      name: agent.name,
      workspaceDir,
      skills: [...(agent.skills ?? [])],
    } satisfies AgentConfig
  })

  const loader = new FakeSkillsLoader()
  const agentManager = new FakeAgentManager(agentConfigs)
  const service = new SkillProjectService(loader as any, agentManager as any, skillsDir)

  return {
    root,
    skillsDir,
    agentDir: agentDirs.default,
    agentDirs,
    loader,
    agentManager,
    service,
  }
}

function parseSkills(rawYaml: string): string[] {
  const match = rawYaml.match(/skills:\n((?:\s+- .*\n?)*)/)
  if (!match?.[1]) return []
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2))
}
