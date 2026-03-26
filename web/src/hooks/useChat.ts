import { useCallback } from 'react'
import { sendMessage, getMessages, abortChat } from '../api/client'
import { useChatStore, onChatUpdate } from '../stores/chat'
import { socketManager } from '../lib/socket-manager'
import type { Attachment } from '../types/attachment'
import type { ChatState, Message, TimelineItem, ToolUseItem } from '../stores/chat'

// Re-export types for consumers (chatCtx.ts imports these)
export type { Message, TimelineItem, ToolUseItem }

/**
 * Read active chat's state. Returns null when no chat is active (new chat screen).
 */
export function useActiveChatState(): ChatState | null {
  const activeChatId = useChatStore((s) => s.activeChatId)
  const chat = useChatStore((s) =>
    activeChatId ? s.chats[activeChatId] ?? null : null,
  )
  return chat
}

/**
 * Read a specific chat's isProcessing status (for sidebar indicators).
 * Each component calling this only re-renders when its specific chatId changes.
 */
export function useChatProcessing(chatId: string): boolean {
  return useChatStore((s) => s.chats[chatId]?.isProcessing ?? false)
}

/**
 * Chat actions. selectedAgentId is used for new chats; existing chats use their bound agent.
 * Browser selection is handled by agent/runtime configuration, not by chat UI.
 */
export function useChatActions(selectedAgentId: string) {
  const send = useCallback(
    async (
      prompt: string,
      attachments?: Attachment[],
    ) => {
      const store = useChatStore.getState()
      const currentChatId = store.activeChatId
      const effectiveChatId = currentChatId ?? `web:${crypto.randomUUID()}`
      const existingChat = currentChatId ? store.chats[currentChatId] : null
      const effectiveAgentId = existingChat?.boundAgentId ?? selectedAgentId
      const messageId = crypto.randomUUID()

      // Initialize chat entry in store
      store.initChat(effectiveChatId)
      store.setChatAgent(effectiveChatId, effectiveAgentId)
      store.setActiveChatId(effectiveChatId)

      // Reset SSE error flag for this send
      store.resetSseErrorHandled(effectiveChatId)

      // Add user message
      store.addUserMessage(effectiveChatId, {
        id: messageId,
        role: 'user',
        content: prompt,
        timestamp: new Date().toISOString(),
        attachments,
      })

      // Set processing
      store.setProcessing(effectiveChatId, true)

      socketManager.ensureConnected()

      try {
        await sendMessage(
          effectiveAgentId,
          prompt,
          effectiveChatId,
          undefined,
          attachments,
          messageId,
        )
      } catch (err) {
        // Check if SSE already handled error
        const latest = useChatStore.getState().chats[effectiveChatId]
        if (latest?.sseErrorHandled) {
          return
        }
        const errorMsg = err instanceof Error ? err.message : String(err)
        const isCredits =
          /insufficient|credit|balance|quota/i.test(errorMsg)
        const errorStore = useChatStore.getState()
        if (isCredits) {
          errorStore.setShowInsufficientCredits(effectiveChatId, true)
          errorStore.handleError(effectiveChatId, '', 'INSUFFICIENT_CREDITS')
        } else {
          errorStore.handleError(effectiveChatId, errorMsg)
        }
      }
    },
    [selectedAgentId],
  )

  const loadChat = useCallback(async (chatId: string, agentId?: string) => {
    const store = useChatStore.getState()
    store.initChat(chatId)
    if (agentId) {
      store.setChatAgent(chatId, agentId)
    }
    store.setActiveChatId(chatId)

    const existing = store.chats[chatId]
    if (existing?.isProcessing && !socketManager.isConnected()) {
      socketManager.ensureConnected()
    }

    const msgs = await getMessages(chatId)
    if (msgs.length === 0) {
      if (!existing || existing.messages.length === 0) {
        throw new Error('Chat not found or empty')
      }
      return
    }

    store.setMessages(
      chatId,
      msgs.map((m) => ({
        id: m.id,
        role: m.is_bot_message
          ? ('assistant' as const)
          : ('user' as const),
        content: m.content,
        timestamp: m.timestamp,
        toolUse: m.toolUse ?? undefined,
        attachments:
          (m as { attachments?: Attachment[] | null }).attachments ??
          undefined,
        errorCode: m.errorCode ?? undefined,
        sessionId: m.sessionId ?? undefined,
        turnId: m.turnId ?? undefined,
      })),
    )
  }, [])

  const newChat = useCallback(() => {
    useChatStore.getState().setActiveChatId(null)
  }, [])

  const stop = useCallback(() => {
    const store = useChatStore.getState()
    const chatId = store.activeChatId
    if (!chatId) return

    // Keep the realtime socket connected so the backend can deliver the final
    // partial assistant reply and processing=false after abort.
    abortChat(chatId).catch(() => {})
  }, [])

  const setShowInsufficientCredits = useCallback((show: boolean) => {
    const store = useChatStore.getState()
    const chatId = store.activeChatId
    if (chatId) {
      store.setShowInsufficientCredits(chatId, show)
    }
  }, [])

  return { send, loadChat, newChat, stop, setShowInsufficientCredits }
}

// Re-export onChatUpdate for ChatProvider
export { onChatUpdate }
