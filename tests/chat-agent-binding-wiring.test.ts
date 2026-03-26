import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()

function read(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

describe('chat agent binding wiring', () => {
  test('chat context exposes bound-agent state for existing conversations', () => {
    const chatCtx = read('web/src/hooks/chatCtx.ts')
    const provider = read('web/src/hooks/useChatContext.tsx')

    expect(chatCtx).toContain('currentChatAgentId: string | null')
    expect(chatCtx).toContain('canChangeAgent: boolean')
    expect(provider).toContain('const currentChatAgentId =')
    expect(provider).toContain('const canChangeAgent = !activeChatId;')
  })

  test('send binds new chats to the selected agent and reuses the bound agent for existing chats', () => {
    const useChat = read('web/src/hooks/useChat.ts')

    expect(useChat).toContain("const effectiveAgentId = existingChat?.boundAgentId ?? selectedAgentId")
    expect(useChat).toContain('store.setChatAgent(effectiveChatId, effectiveAgentId)')
    expect(useChat).toContain('await sendMessage(')
    expect(useChat).toContain('effectiveAgentId,')
  })

  test('chat input disables agent switching for existing conversations', () => {
    const chatInput = read('web/src/components/chat/ChatInput.tsx')

    expect(chatInput).toContain('currentChatAgentId')
    expect(chatInput).toContain('canChangeAgent')
    expect(chatInput).toContain('const effectiveAgentId = currentChatAgentId ?? agentId;')
    expect(chatInput).toContain('disabled={!canChangeAgent}')
  })
})
