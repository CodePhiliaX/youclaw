import { describe, expect, test } from 'bun:test'
import { getExternalSkillSourceLabel } from '../web/src/components/skills/shared-utils.ts'
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
