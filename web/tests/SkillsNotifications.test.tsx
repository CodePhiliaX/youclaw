import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

function readSourceFile(pathname: string) {
  return readFileSync(new URL(`../src/${pathname}`, import.meta.url), 'utf8')
}

describe('Skills page notifications', () => {
  test('keeps the Skills page free of operation bubble APIs', () => {
    const source = readSourceFile('pages/Skills.tsx')

    expect(source).not.toContain('SkillsNotificationProvider')
    expect(source).not.toContain('useSkillsNotification')
    expect(source).not.toContain('showGlobalBubble')
  })

  test('removes operation bubble APIs from Skills child components', () => {
    const files = [
      'components/MarketplaceCard.tsx',
      'components/SkillImportPanel.tsx',
      'components/SkillUploadDialog.tsx',
      'components/skills/SkillEditor.tsx',
      'components/skills/shared.tsx',
    ]

    for (const file of files) {
      const source = readSourceFile(file)
      expect(source).not.toContain('useSkillsNotification')
      expect(source).not.toContain('SkillsNotificationContext')
      expect(source).not.toContain('showGlobalBubble')
    }
  })
})
