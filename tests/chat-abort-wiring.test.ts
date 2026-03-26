import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()

function read(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

describe('chat abort wiring', () => {
  test('stop keeps realtime delivery connected until backend finishes abort cleanup', () => {
    const useChat = read('web/src/hooks/useChat.ts')

    expect(useChat).toContain('abortChat(chatId).catch(() => {})')
    expect(useChat).not.toContain('socketManager.disconnect(')
  })
})
