import { describe, expect, test } from 'bun:test'
import {
  canDeleteInstalledSkill,
  getInstalledSkillSourceLabel,
  getExternalSkillSourceLabel,
} from '../web/src/components/skills/shared-utils.ts'
import { zh } from '../web/src/i18n/zh.ts'

describe('skill source labels', () => {
  test('maps concrete external sources to specific labels', () => {
    expect(getExternalSkillSourceLabel({
      externalSource: 'url',
      registryMeta: { source: 'raw-url', provider: 'raw-url' },
    } as any, zh)).toBe('URL 导入')

    expect(getExternalSkillSourceLabel({
      externalSource: 'url',
      registryMeta: { source: 'github', provider: 'github' },
    } as any, zh)).toBe('GitHub 导入')

    expect(getExternalSkillSourceLabel({
      externalSource: 'local',
      registryMeta: { source: 'zip-upload', provider: 'zip-upload' },
    } as any, zh)).toBe('ZIP 导入')

    expect(getExternalSkillSourceLabel({
      externalSource: 'local',
      registryMeta: { source: 'folder-import', provider: 'folder-import' },
    } as any, zh)).toBe('文件夹导入')
  })
})

describe('installed skill actions', () => {
  test('true builtin skills are not deletable from installed list', () => {
    expect(canDeleteInstalledSkill({
      source: 'builtin',
      catalogGroup: 'builtin',
    } as any)).toBe(false)
  })

  test('user-installed skills remain deletable', () => {
    expect(canDeleteInstalledSkill({
      source: 'user',
      catalogGroup: 'user',
    } as any)).toBe(true)
  })

  test('workspace skills are deletable', () => {
    expect(canDeleteInstalledSkill({
      source: 'workspace',
      catalogGroup: 'builtin',
    } as any)).toBe(true)
  })

  test('workspace skills keep the workspace source label', () => {
    expect(getInstalledSkillSourceLabel({
      source: 'workspace',
      externalSource: undefined,
    } as any, null, zh)).toBe('工作区')
  })
})
