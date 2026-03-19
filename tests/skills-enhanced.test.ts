import { describe, test, expect } from 'bun:test'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { SkillsInstaller } from '../src/skills/installer.ts'
import type { Skill } from '../src/skills/types.ts'

function createSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'test-skill',
    source: 'builtin',
    frontmatter: {
      name: 'test-skill',
      description: 'Test skill',
      ...overrides.frontmatter,
    },
    content: 'body',
    path: '/tmp/test-skill/SKILL.md',
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
    ...overrides,
  }
}

describe('SkillsInstaller.checkCompatibility', () => {
  const installer = new SkillsInstaller()

  test('passes when no dependencies and no conflicts', () => {
    const skill = createSkill()
    const installed = [createSkill({ name: 'other-skill', frontmatter: { name: 'other-skill', description: 'Other' } })]

    const result = installer.checkCompatibility(skill, installed)
    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
  })

  test('passes when required dependencies are installed', () => {
    const skill = createSkill({
      frontmatter: { name: 'test-skill', description: 'Test', requires: ['dep-a', 'dep-b'] },
    })
    const installed = [
      createSkill({ name: 'dep-a', frontmatter: { name: 'dep-a', description: 'Dep A' } }),
      createSkill({ name: 'dep-b', frontmatter: { name: 'dep-b', description: 'Dep B' } }),
    ]

    const result = installer.checkCompatibility(skill, installed)
    expect(result.ok).toBe(true)
  })

  test('reports error when required dependencies are missing', () => {
    const skill = createSkill({
      frontmatter: { name: 'test-skill', description: 'Test', requires: ['dep-a', 'dep-missing'] },
    })
    const installed = [
      createSkill({ name: 'dep-a', frontmatter: { name: 'dep-a', description: 'Dep A' } }),
    ]

    const result = installer.checkCompatibility(skill, installed)
    expect(result.ok).toBe(false)
    expect(result.issues.length).toBe(1)
    expect(result.issues[0]).toContain('dep-missing')
  })

  test('conflicts detection', () => {
    const skill = createSkill({
      frontmatter: { name: 'test-skill', description: 'Test', conflicts: ['conflicting-skill'] },
    })
    const installed = [
      createSkill({ name: 'conflicting-skill', frontmatter: { name: 'conflicting-skill', description: 'Conflict' } }),
    ]

    const result = installer.checkCompatibility(skill, installed)
    expect(result.ok).toBe(false)
    expect(result.issues.length).toBe(1)
    expect(result.issues[0]).toContain('conflicting-skill')
    expect(result.issues[0]).toContain('Conflicts')
  })

  test('skill with dependencies reports error when no skills are installed', () => {
    const skill = createSkill({
      frontmatter: { name: 'test-skill', description: 'Test', requires: ['needed'] },
    })

    const result = installer.checkCompatibility(skill, [])
    expect(result.ok).toBe(false)
    expect(result.issues[0]).toContain('needed')
  })

  test('skill with conflict declarations passes when no skills are installed', () => {
    const skill = createSkill({
      frontmatter: { name: 'test-skill', description: 'Test', conflicts: ['absent-conflict'] },
    })

    const result = installer.checkCompatibility(skill, [])
    expect(result.ok).toBe(true)
  })

  test('reports all issues when both dependency and conflict problems exist', () => {
    const skill = createSkill({
      frontmatter: {
        name: 'test-skill',
        description: 'Test',
        requires: ['missing-dep'],
        conflicts: ['existing-conflict'],
      },
    })
    const installed = [
      createSkill({ name: 'existing-conflict', frontmatter: { name: 'existing-conflict', description: 'Conflict' } }),
    ]

    const result = installer.checkCompatibility(skill, installed)
    expect(result.ok).toBe(false)
    expect(result.issues.length).toBe(2)
    expect(result.issues.some((i) => i.includes('missing-dep'))).toBe(true)
    expect(result.issues.some((i) => i.includes('existing-conflict'))).toBe(true)
  })
})

describe('SkillsInstaller local metadata', () => {
  test('writes fixed install metadata for imported skills', async () => {
    const installer = new SkillsInstaller()
    const root = mkdtempSync(resolve(tmpdir(), 'youclaw-installer-'))
    const sourceDir = resolve(root, 'source-skill')
    const targetDir = resolve(root, 'target')

    try {
      mkdirSync(sourceDir, { recursive: true })
      mkdirSync(targetDir, { recursive: true })
      writeFileSync(resolve(sourceDir, 'SKILL.md'), '---\nname: source-skill\ndescription: Source\n---\nbody\n')

      await installer.installFromLocal(sourceDir, targetDir)

      const metaPath = resolve(targetDir, 'source-skill', '.youclaw-skill.json')
      expect(existsSync(metaPath)).toBe(true)
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as { managed: boolean; origin: string }
      expect(meta.managed).toBe(false)
      expect(meta.origin).toBe('imported')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// SkillsLoader.getAgentSkillsView tests
import './setup-light.ts'
import { initDatabase } from '../src/db/index.ts'
import { SkillsLoader } from '../src/skills/loader.ts'

initDatabase()

describe('SkillsLoader.getAgentSkillsView', () => {
  test('returns all available skills but no enabled bindings when no skills field is specified', () => {
    const loader = new SkillsLoader()
    const allSkills = loader.loadAllSkills()

    const view = loader.getAgentSkillsView({
      id: 'test',
      name: 'Test',
      model: 'claude-sonnet-4-6',
      workspaceDir: '/tmp',
    } as any)

    expect(view.available).toEqual(allSkills)
    expect(view.enabled).toEqual([])
    expect(view.eligible).toEqual([])
  })

  test('enabled only contains specified skills when skills field is present', () => {
    const loader = new SkillsLoader()
    const allSkills = loader.loadAllSkills()
    // If no skills are loaded, this test has limited value
    // But at least verify the logic doesn't throw errors
    const view = loader.getAgentSkillsView({
      id: 'test',
      name: 'Test',
      model: 'claude-sonnet-4-6',
      workspaceDir: '/tmp',
      skills: ['nonexistent-skill'],
    } as any)

    expect(view.available).toEqual(allSkills)
    expect(view.enabled).toEqual([]) // nonexistent matches nothing
    expect(view.eligible).toEqual([])
  })
})
