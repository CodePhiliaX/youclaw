import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()

function read(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

describe('browser disable wiring', () => {
  test('chat input no longer forwards a chat-scoped browser profile override', () => {
    const chatInput = read('web/src/components/chat/ChatInput.tsx')
    expect(chatInput).toContain('send(text, attachments.length > 0 ? attachments : undefined);')
    expect(chatInput).not.toContain('chat-browser-profile-trigger')
  })

  test('messages route accepts nullable browserProfileId to represent explicit disable', () => {
    const messagesRoute = read('src/routes/messages.ts')
    expect(messagesRoute).toContain('browserProfileId: z.string().nullable().optional()')
  })
})
