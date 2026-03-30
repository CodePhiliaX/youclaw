import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

function readSourceFile(pathname: string) {
  return readFileSync(new URL(`../src/${pathname}`, import.meta.url), 'utf8')
}

describe('Skills page hover hints', () => {
  test('keeps marketplace metrics free of native title tooltips', () => {
    const source = readSourceFile('components/MarketplaceCard.tsx')

    expect(source).not.toContain('title={bubbleLabel}')
  })

  test('keeps marketplace view wiring free of hover bubble wrappers', () => {
    const source = readSourceFile('components/skills/MarketplaceView.tsx')

    expect(source).not.toContain('SkillsBubble')
    expect(source).not.toContain('showMetricBubble')
  })

  test('keeps installed skills view free of hover bubble wrappers', () => {
    const source = readSourceFile('components/skills/InstalledSkillsView.tsx')

    expect(source).not.toContain('SkillsBubble')
    expect(source).not.toContain('shouldShowInstalledSkillToggleBubble')
  })

  test('keeps skill install actions free of hover bubble wrappers', () => {
    const source = readSourceFile('components/skills/shared.tsx')

    expect(source).not.toContain('SkillsBubble')
  })

  test('keeps markdown editor mode buttons free of native title tooltips', () => {
    const source = readSourceFile('components/skills/MarkdownAuthoringEditor.tsx')

    expect(source).not.toContain('title={t.skills.tabPreview}')
    expect(source).not.toContain('title={t.skills.tabMarkdown}')
  })

  test('keeps marketplace card metrics free of hover bubble wrappers', () => {
    const source = readSourceFile('components/MarketplaceCard.tsx')

    expect(source).not.toContain('SkillsBubble')
    expect(source).not.toContain('showMetricBubble')
  })
})
