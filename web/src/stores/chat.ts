import { create } from 'zustand'
import type { Attachment } from '../types/attachment'

export type ToolUseItem = {
  id: string
  name: string
  input?: string
  status: 'running' | 'done'
}

export type TimelineItem =
  | {
    id: string
    kind: 'message'
    role: 'user' | 'assistant'
    content: string
    timestamp: string
    toolUse?: ToolUseItem[]
    attachments?: Attachment[]
    errorCode?: string
  }
  | {
    id: string
    kind: 'assistant_stream'
    content: string
    timestamp: string
  }
  | {
    id: string
    kind: 'tool_use'
    name: string
    input?: string
    status: 'running' | 'done'
    timestamp: string
  }
  | {
    id: string
    kind: 'document_status'
    documentKey: string
    filename: string
    status: 'parsing' | 'parsed' | 'failed'
    error?: string
    timestamp: string
  }

export type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  toolUse?: ToolUseItem[]
  attachments?: Attachment[]
  errorCode?: string
  sessionId?: string
  turnId?: string
}

export type RealtimeDocumentStatus = {
  documentKey: string
  filename: string
  status: 'parsing' | 'parsed' | 'failed'
  error?: string
}

export type RealtimeChatSnapshot = {
  agentId: string
  chatId: string
  turnId?: string
  isProcessing: boolean
  streamingText: string
  pendingToolUse: ToolUseItem[]
  documentStatuses: RealtimeDocumentStatus[]
  updatedAt: string
}

export interface ChatState {
  chatId: string
  boundAgentId: string | null
  messages: Message[]
  timelineItems: TimelineItem[]
  streamingText: string
  isProcessing: boolean
  ignoreLateAssistantEvents: boolean
  pendingToolUse: ToolUseItem[]
  documentStatuses: Record<string, { filename: string; status: 'parsing' | 'parsed' | 'failed'; error?: string }>
  chatStatus: 'submitted' | 'streaming' | 'ready' | 'error'
  showInsufficientCredits: boolean
  sseErrorHandled: boolean
}

// Callback for notifying external subscribers (e.g. ChatProvider refreshChats)
type ChatUpdateListener = () => void
const chatUpdateListeners = new Set<ChatUpdateListener>()

export function onChatUpdate(listener: ChatUpdateListener): () => void {
  chatUpdateListeners.add(listener)
  return () => chatUpdateListeners.delete(listener)
}

function notifyChatUpdate() {
  for (const listener of chatUpdateListeners) {
    listener()
  }
}

function messageToTimelineItem(message: Message): TimelineItem {
  return {
    id: `message:${message.id}`,
    kind: 'message',
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    toolUse: message.toolUse,
    attachments: message.attachments,
    errorCode: message.errorCode,
  }
}

function buildTimelineFromMessages(messages: Message[]): TimelineItem[] {
  return messages.map(messageToTimelineItem)
}

function getDocumentTimelineItems(items: TimelineItem[]): Array<Extract<TimelineItem, { kind: 'document_status' }>> {
  return items.filter((item): item is Extract<TimelineItem, { kind: 'document_status' }> => item.kind === 'document_status')
}

function getLiveTimelineTail(items: TimelineItem[], messages: Message[]): TimelineItem[] {
  const persistedMessageIds = new Set(messages.map((message) => `message:${message.id}`))
  let tailStart = items.length

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]
    if (item?.kind === 'message' && !persistedMessageIds.has(item.id)) {
      tailStart = i
      break
    }
  }

  if (tailStart === items.length) {
    const lastPersistedMessageId = messages[messages.length - 1]?.id
    if (!lastPersistedMessageId) {
      tailStart = 0
    } else {
      for (let i = items.length - 1; i >= 0; i -= 1) {
        const item = items[i]
        if (item?.kind === 'message' && item.id === `message:${lastPersistedMessageId}`) {
          tailStart = i + 1
          break
        }
      }
    }
  }

  return items.slice(tailStart).filter((item) => item.kind !== 'document_status')
}

function getCurrentTurnBaseTimeline(items: TimelineItem[]): TimelineItem[] {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]
    if (item?.kind === 'message') {
      return items.slice(0, i + 1)
    }
  }
  return []
}

function buildDocumentStatusRecord(items: RealtimeDocumentStatus[]): Record<string, { filename: string; status: 'parsing' | 'parsed' | 'failed'; error?: string }> {
  return Object.fromEntries(items.map((item) => [
    item.documentKey,
    {
      filename: item.filename,
      status: item.status,
      error: item.error,
    },
  ]))
}

function buildLiveTimelineFromSnapshot(snapshot: RealtimeChatSnapshot): TimelineItem[] {
  const documentItems = snapshot.documentStatuses.map((document) => ({
    id: `document:${document.documentKey}:${snapshot.updatedAt}`,
    kind: 'document_status' as const,
    documentKey: document.documentKey,
    filename: document.filename,
    status: document.status,
    error: document.error,
    timestamp: snapshot.updatedAt,
  }))

  const toolItems = snapshot.pendingToolUse.map((tool) => ({
    id: `tool:${tool.id}`,
    kind: 'tool_use' as const,
    name: tool.name,
    input: tool.input,
    status: tool.status,
    timestamp: snapshot.updatedAt,
  }))

  const streamItem = snapshot.streamingText
    ? [{
      id: `assistant_stream:${snapshot.chatId}:${snapshot.turnId ?? snapshot.updatedAt}`,
      kind: 'assistant_stream' as const,
      content: snapshot.streamingText,
      timestamp: snapshot.updatedAt,
    }]
    : []

  return [...documentItems, ...toolItems, ...streamItem]
}

function buildMergedTimeline(
  messages: Message[],
  existingTimelineItems: TimelineItem[],
  preserveLiveTail: boolean,
): TimelineItem[] {
  const documentItems = getDocumentTimelineItems(existingTimelineItems)
  const liveItems = preserveLiveTail ? getLiveTimelineTail(existingTimelineItems, messages) : []
  return [...buildTimelineFromMessages(messages), ...documentItems, ...liveItems]
}

function defaultChatState(chatId: string): ChatState {
  return {
    chatId,
    boundAgentId: null,
    messages: [],
    timelineItems: [],
    streamingText: '',
    isProcessing: false,
    ignoreLateAssistantEvents: false,
    pendingToolUse: [],
    documentStatuses: {},
    chatStatus: 'ready',
    showInsufficientCredits: false,
    sseErrorHandled: false,
  }
}

// Helper to immutably update a specific chat in the record
function updateChat(
  chats: Record<string, ChatState>,
  chatId: string,
  updater: (chat: ChatState) => Partial<ChatState>,
): Record<string, ChatState> {
  const chat = chats[chatId]
  if (!chat) return chats
  return { ...chats, [chatId]: { ...chat, ...updater(chat) } }
}

interface ChatStore {
  chats: Record<string, ChatState>
  activeChatId: string | null

  initChat(chatId: string): void
  setChatAgent(chatId: string, agentId: string): void
  appendStreamText(chatId: string, text: string): void
  setProcessing(chatId: string, isProcessing: boolean): void
  addToolUse(chatId: string, tool: ToolUseItem): void
  setDocumentStatus(chatId: string, documentId: string, filename: string, status: 'parsing' | 'parsed' | 'failed', error?: string): void
  applyRealtimeSnapshot(chatId: string, snapshot: RealtimeChatSnapshot): void
  completeMessage(chatId: string, fullText: string, toolUse: ToolUseItem[], sessionId?: string, turnId?: string): void
  addUserMessage(chatId: string, message: Message): void
  setMessages(chatId: string, messages: Message[]): void
  handleError(chatId: string, error: string, errorCode?: string): void
  removeChat(chatId: string): void
  setShowInsufficientCredits(chatId: string, show: boolean): void
  markSseErrorHandled(chatId: string): void
  resetSseErrorHandled(chatId: string): void
  setActiveChatId(chatId: string | null): void
}

export const useChatStore = create<ChatStore>((set) => ({
  chats: {},
  activeChatId: null,

  initChat: (chatId) =>
    set((state) => {
      if (state.chats[chatId]) return state
      return { chats: { ...state.chats, [chatId]: defaultChatState(chatId) } }
    }),

  setChatAgent: (chatId, agentId) =>
    set((state) => ({
      chats: updateChat(state.chats, chatId, () => ({
        boundAgentId: agentId,
      })),
    })),

  appendStreamText: (chatId, text) =>
    set((state) => ({
      chats: updateChat(state.chats, chatId, (chat) => ({
        ...(() => {
          if (!chat.isProcessing || chat.ignoreLateAssistantEvents) {
            return {}
          }

          // Ignore late deltas that arrive after a completed/error turn.
          // The canonical full reply is already in `messages`, so rendering
          // trailing stream chunks creates duplicate assistant bubbles.
          return {
            streamingText: chat.streamingText + text,
            timelineItems: (() => {
              const timestamp = new Date().toISOString()
              const normalizedItems = chat.timelineItems.map((item) =>
                item.kind === 'tool_use' && item.status === 'running'
                  ? { ...item, status: 'done' as const }
                  : item,
              )
              const lastItem = normalizedItems[normalizedItems.length - 1]

              if (lastItem?.kind === 'assistant_stream') {
                return [
                  ...normalizedItems.slice(0, -1),
                  {
                    ...lastItem,
                    content: lastItem.content + text,
                  },
                ]
              }

              return [
                ...normalizedItems,
                {
                  id: `assistant_stream:${timestamp}:${crypto.randomUUID()}`,
                  kind: 'assistant_stream',
                  content: text,
                  timestamp,
                },
              ]
            })(),
            chatStatus: chat.isProcessing ? 'streaming' : chat.chatStatus,
          }
        })(),
      })),
    })),

  setProcessing: (chatId, isProcessing) =>
    set((state) => ({
      chats: updateChat(state.chats, chatId, () => {
        if (isProcessing) {
          return {
            isProcessing: true,
            ignoreLateAssistantEvents: false,
            chatStatus: 'submitted' as const,
          }
        }
        return {
          isProcessing: false,
          streamingText: '',
          pendingToolUse: [],
          chatStatus: 'ready' as const,
        }
      }),
    })),

  addToolUse: (chatId, tool) =>
    set((state) => ({
      chats: updateChat(state.chats, chatId, (chat) => {
        if (!chat.isProcessing || chat.ignoreLateAssistantEvents) {
          return {}
        }
        const timelineItems = chat.timelineItems.map((item) =>
          item.kind === 'tool_use' && item.status === 'running'
            ? { ...item, status: 'done' as const }
            : item,
        )
        const updated = chat.pendingToolUse.map((t) =>
          t.status === 'running' ? { ...t, status: 'done' as const } : t,
        )
        return {
          pendingToolUse: [...updated, tool],
          timelineItems: [
            ...timelineItems,
            {
              id: `tool:${tool.id}`,
              kind: 'tool_use',
              name: tool.name,
              input: tool.input,
              status: tool.status,
              timestamp: new Date().toISOString(),
            },
          ],
        }
      }),
    })),

  setDocumentStatus: (chatId, documentId, filename, status, error) =>
    set((state) => ({
      chats: updateChat(state.chats, chatId, (chat) => {
        const nextStatuses = { ...chat.documentStatuses }
        if (status !== 'parsing') {
          for (const [key, value] of Object.entries(nextStatuses)) {
            if (key.endsWith(':pending') && value.filename === filename) {
              delete nextStatuses[key]
            }
          }
        }
        nextStatuses[documentId === 'pending' ? `${filename}:pending` : documentId] = {
          filename,
          status,
          error,
        }
        const documentKey = documentId === 'pending' ? `${filename}:pending` : documentId
        const timelineItems = [...chat.timelineItems]
        const existingIndex = timelineItems.findIndex((item) =>
          item.kind === 'document_status'
          && (
            item.documentKey === documentKey
            || (item.documentKey === `${filename}:pending` && item.filename === filename)
          )
        )

        const nextItem: TimelineItem = {
          id: existingIndex >= 0
            ? timelineItems[existingIndex]!.id
            : `document:${documentKey}:${Date.now()}`,
          kind: 'document_status',
          documentKey,
          filename,
          status,
          error,
          timestamp: existingIndex >= 0
            ? timelineItems[existingIndex]!.timestamp
            : new Date().toISOString(),
        }

        if (existingIndex >= 0) {
          timelineItems[existingIndex] = nextItem
        } else {
          timelineItems.push(nextItem)
        }

        return {
          documentStatuses: nextStatuses,
          timelineItems,
        }
      }),
    })),

  applyRealtimeSnapshot: (chatId, snapshot) =>
    set((state) => ({
      chats: updateChat(state.chats, chatId, (chat) => {
        const baseTimelineItems = getCurrentTurnBaseTimeline(chat.timelineItems)
        return {
          isProcessing: snapshot.isProcessing,
          ignoreLateAssistantEvents: false,
          streamingText: snapshot.streamingText,
          pendingToolUse: snapshot.pendingToolUse.map((tool) => ({ ...tool })),
          documentStatuses: buildDocumentStatusRecord(snapshot.documentStatuses),
          timelineItems: [
            ...baseTimelineItems,
            ...buildLiveTimelineFromSnapshot(snapshot),
          ],
          chatStatus: snapshot.streamingText ? 'streaming' as const : 'submitted' as const,
        }
      }),
    })),

  completeMessage: (chatId, fullText, toolUse, sessionId, turnId) => {
    set((state) => ({
      chats: updateChat(state.chats, chatId, (chat) => {
        // Prefer turnId for per-turn deduplication; sessionId is a fallback.
        if (turnId && chat.messages.some((m) => m.turnId === turnId)) {
          return {}
        }
        if (!turnId && sessionId && chat.messages.some((m) => m.sessionId === sessionId)) {
          return {}
        }
        const timestamp = new Date().toISOString()
        const nextMessage: Message = {
          id: turnId ?? sessionId ?? Date.now().toString(),
          role: 'assistant' as const,
          content: fullText,
          timestamp,
          toolUse: toolUse.length > 0 ? toolUse : undefined,
          sessionId,
          turnId,
        }
        const messages = [...chat.messages, nextMessage]
        const currentTurnStartIndex = (() => {
          for (let i = chat.timelineItems.length - 1; i >= 0; i -= 1) {
            if (chat.timelineItems[i]?.kind === 'message') {
              return i
            }
          }
          return -1
        })()
        const baseTimelineItems = currentTurnStartIndex >= 0
          ? chat.timelineItems.slice(0, currentTurnStartIndex + 1)
          : buildTimelineFromMessages(chat.messages)
        const currentTurnDocumentItems = (currentTurnStartIndex >= 0
          ? chat.timelineItems.slice(currentTurnStartIndex + 1)
          : []
        ).filter((item): item is Extract<TimelineItem, { kind: 'document_status' }> => item.kind === 'document_status')
        const timelineItems = [
          ...baseTimelineItems,
          ...currentTurnDocumentItems,
          messageToTimelineItem(nextMessage),
        ]

        return {
          messages,
          timelineItems,
          streamingText: '',
          ignoreLateAssistantEvents: true,
          pendingToolUse: [],
        }
      }),
    }))
    // Notify after state is committed
    queueMicrotask(notifyChatUpdate)
  },

  addUserMessage: (chatId, message) => {
    set((state) => {
      const chat = state.chats[chatId]
      if (!chat || chat.messages.some((existing) => existing.id === message.id)) {
        return state
      }

      return {
        chats: {
          ...state.chats,
          [chatId]: {
            ...chat,
            messages: [...chat.messages, message],
            timelineItems: [...chat.timelineItems, messageToTimelineItem(message)],
          },
        },
      }
    })
    // Notify after state is committed
    queueMicrotask(notifyChatUpdate)
  },

  setMessages: (chatId, messages) =>
    set((state) => ({
      chats: updateChat(state.chats, chatId, () => ({
        messages,
        timelineItems: buildMergedTimeline(
          messages,
          state.chats[chatId]?.timelineItems ?? [],
          state.chats[chatId]?.isProcessing ?? false,
        ),
      })),
    })),

  handleError: (chatId, error, errorCode) =>
    set((state) => {
      const isCredits = errorCode === 'INSUFFICIENT_CREDITS'
      const chat = state.chats[chatId]
      if (!chat) return state

      let messages = chat.messages
      if (isCredits) {
        // Replace last assistant message if it was just added
        const last = messages[messages.length - 1]
        const base =
          last && last.role === 'assistant' && !last.errorCode
            ? messages.slice(0, -1)
            : messages
        messages = [
          ...base,
          {
            id: Date.now().toString(),
            role: 'assistant' as const,
            content: '',
            timestamp: new Date().toISOString(),
            errorCode: 'INSUFFICIENT_CREDITS',
          },
        ]
      } else if (error) {
        messages = [
          ...messages,
          {
            id: Date.now().toString(),
            role: 'assistant' as const,
            content: `⚠️ ${error}`,
            timestamp: new Date().toISOString(),
          },
        ]
      }

      const errorTimelineItems = buildMergedTimeline(messages, chat.timelineItems, false)

      // Reset error status after 2 seconds
      setTimeout(() => {
        set((s) => ({
          chats: updateChat(s.chats, chatId, (c) => ({
            chatStatus: c.chatStatus === 'error' ? ('ready' as const) : c.chatStatus,
          })),
        }))
      }, 2000)

      return {
        chats: {
          ...state.chats,
          [chatId]: {
            ...chat,
            messages,
            timelineItems: errorTimelineItems,
            streamingText: '',
            isProcessing: false,
            ignoreLateAssistantEvents: true,
            pendingToolUse: [],
            chatStatus: 'error' as const,
            sseErrorHandled: true,
            showInsufficientCredits: isCredits ? true : chat.showInsufficientCredits,
          },
        },
      }
    }),

  removeChat: (chatId) =>
    set((state) => {
      const rest = { ...state.chats }
      delete rest[chatId]
      return {
        chats: rest,
        activeChatId: state.activeChatId === chatId ? null : state.activeChatId,
      }
    }),

  setShowInsufficientCredits: (chatId, show) =>
    set((state) => ({
      chats: updateChat(state.chats, chatId, () => ({
        showInsufficientCredits: show,
      })),
    })),

  markSseErrorHandled: (chatId) =>
    set((state) => ({
      chats: updateChat(state.chats, chatId, () => ({
        sseErrorHandled: true,
      })),
    })),

  resetSseErrorHandled: (chatId) =>
    set((state) => ({
      chats: updateChat(state.chats, chatId, () => ({
        sseErrorHandled: false,
      })),
    })),

  setActiveChatId: (chatId) => set({ activeChatId: chatId }),
}))
