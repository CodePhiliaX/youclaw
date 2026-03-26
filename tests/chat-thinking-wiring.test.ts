import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()

function read(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

describe('chat thinking indicator wiring', () => {
  test('suppresses thinking placeholder after a final assistant message has rendered', () => {
    const chatMessages = read('web/src/components/chat/ChatMessages.tsx')

    expect(chatMessages).toContain("const showThinkingState = isProcessing")
    expect(chatMessages).toContain("latestRenderableItem?.kind === 'message' && latestRenderableItem.role === 'assistant'")
    expect(chatMessages).toContain('{showThinkingState && (')
  })
})
