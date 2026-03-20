import { beforeEach, describe, expect, test } from 'bun:test'
import { useChatStore } from '../web/src/stores/chat'

describe('chat store completion flow', () => {
  beforeEach(() => {
    useChatStore.setState({
      chats: {},
      activeChatId: null,
    })
  })

  test('completeMessage keeps the chat processing until processing=false arrives', () => {
    const store = useChatStore.getState()

    store.initChat('chat-1')
    store.setProcessing('chat-1', true)
    store.completeMessage('chat-1', 'first reply', [])

    const chat = useChatStore.getState().chats['chat-1']
    expect(chat).toBeDefined()
    expect(chat?.messages).toHaveLength(1)
    expect(chat?.messages[0]?.content).toBe('first reply')
    expect(chat?.isProcessing).toBe(true)
    expect(chat?.chatStatus).toBe('submitted')

    useChatStore.getState().setProcessing('chat-1', false)

    const completed = useChatStore.getState().chats['chat-1']
    expect(completed?.isProcessing).toBe(false)
    expect(completed?.chatStatus).toBe('ready')
  })

  test('addUserMessage ignores duplicate message ids', () => {
    const store = useChatStore.getState()

    store.initChat('chat-1')
    store.addUserMessage('chat-1', {
      id: 'user-1',
      role: 'user',
      content: 'hello',
      timestamp: '2026-03-20T10:00:00.000Z',
    })
    store.addUserMessage('chat-1', {
      id: 'user-1',
      role: 'user',
      content: 'hello',
      timestamp: '2026-03-20T10:00:00.000Z',
    })

    const chat = useChatStore.getState().chats['chat-1']
    expect(chat?.messages).toHaveLength(1)
    expect(chat?.timelineItems).toHaveLength(1)
  })

  test('completeMessage deduplicates by sessionId', () => {
    const store = useChatStore.getState()

    store.initChat('chat-1')
    store.setProcessing('chat-1', true)

    // First complete with sessionId
    store.completeMessage('chat-1', 'reply text', [], 'session-abc')
    const after1 = useChatStore.getState().chats['chat-1']
    expect(after1?.messages).toHaveLength(1)
    expect(after1?.messages[0]?.content).toBe('reply text')
    expect(after1?.messages[0]?.sessionId).toBe('session-abc')
    expect(after1?.messages[0]?.id).toBe('session-abc')

    // Second complete with same sessionId should be ignored
    store.completeMessage('chat-1', 'reply text', [], 'session-abc')
    const after2 = useChatStore.getState().chats['chat-1']
    expect(after2?.messages).toHaveLength(1)
  })

  test('completeMessage without sessionId does not deduplicate', () => {
    const store = useChatStore.getState()

    store.initChat('chat-1')
    store.setProcessing('chat-1', true)

    store.completeMessage('chat-1', 'reply 1', [])
    store.completeMessage('chat-1', 'reply 2', [])
    const chat = useChatStore.getState().chats['chat-1']
    expect(chat?.messages).toHaveLength(2)
  })
})
