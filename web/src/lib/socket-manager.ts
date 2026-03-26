import { getWebSocketUrlSync } from '@/api/transport'
import { getMessages } from '@/api/client'
import { useChatStore } from '@/stores/chat'
import type { RealtimeChatSnapshot, ToolUseItem } from '@/stores/chat'
import type { Attachment } from '@/types/attachment'

type AgentEvent = {
  type: string
  agentId: string
  chatId?: string
  turnId?: string
  toolUse?: Array<{ id: string; name: string; input?: string; status: 'done' }>
  documentId?: string
  filename?: string
  status?: 'parsing' | 'parsed' | 'failed'
  text?: string
  fullText?: string
  error?: string
  errorCode?: string
  isProcessing?: boolean
  tool?: string
  input?: string
  messageId?: string
  content?: string
  senderName?: string
  timestamp?: string
  sessionId?: string
  name?: string
  channel?: string
}

type RealtimeEnvelope =
  | { kind: 'connected'; timestamp: string }
  | { kind: 'agent_event'; event: AgentEvent }
  | { kind: 'snapshot'; chats: RealtimeChatSnapshot[] }
  | { kind: 'pong'; timestamp: string }

type EnvelopeListener = (envelope: RealtimeEnvelope) => void
type ChatListListener = () => void

class SocketManager {
  private socket: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempt = 0
  private manuallyDisconnected = false
  private readonly lastEventTime = new Map<string, number>()
  private readonly envelopeListeners = new Set<EnvelopeListener>()
  private readonly chatListListeners = new Set<ChatListListener>()
  private fallbackTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.disconnect())
      this.ensureFallbackTimer()
    }
  }

  connect(): void {
    this.manuallyDisconnected = false
    this.ensureFallbackTimer()
    this.ensureConnected()
  }

  ensureConnected(): void {
    if (typeof window === 'undefined') return
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return
    }

    const ws = new WebSocket(getWebSocketUrlSync('/api/ws'))
    this.socket = ws

    ws.onopen = () => {
      this.reconnectAttempt = 0
    }

    ws.onmessage = (message) => {
      try {
        const envelope = JSON.parse(message.data as string) as RealtimeEnvelope
        this.handleEnvelope(envelope)
      } catch {
        // Ignore malformed envelopes
      }
    }

    ws.onerror = () => {
      // Close handler schedules reconnect.
    }

    ws.onclose = () => {
      if (this.socket === ws) {
        this.socket = null
      }
      if (!this.manuallyDisconnected) {
        this.scheduleReconnect()
      }
    }
  }

  disconnect(): void {
    this.manuallyDisconnected = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer)
      this.fallbackTimer = null
    }
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  onEnvelope(cb: EnvelopeListener): () => void {
    this.envelopeListeners.add(cb)
    return () => {
      this.envelopeListeners.delete(cb)
    }
  }

  onNewChat(cb: ChatListListener): () => void {
    this.chatListListeners.add(cb)
    return () => {
      this.chatListListeners.delete(cb)
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.manuallyDisconnected) return
    const delayMs = Math.min(1000 * (2 ** this.reconnectAttempt), 10000)
    this.reconnectAttempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.ensureConnected()
    }, delayMs)
  }

  private emitEnvelope(envelope: RealtimeEnvelope): void {
    for (const listener of this.envelopeListeners) {
      listener(envelope)
    }
  }

  private emitChatListInvalidation(): void {
    for (const listener of this.chatListListeners) {
      listener()
    }
  }

  private handleEnvelope(envelope: RealtimeEnvelope): void {
    switch (envelope.kind) {
      case 'snapshot':
        for (const snapshot of envelope.chats) {
          this.lastEventTime.set(snapshot.chatId, Date.now())
          const store = useChatStore.getState()
          store.initChat(snapshot.chatId)
          store.applyRealtimeSnapshot(snapshot.chatId, snapshot)
        }
        break
      case 'agent_event':
        this.handleAgentEvent(envelope.event)
        break
      case 'connected':
      case 'pong':
        break
    }

    this.emitEnvelope(envelope)
  }

  private ensureFallbackTimer(): void {
    if (typeof window === 'undefined' || this.fallbackTimer) return
    this.fallbackTimer = setInterval(() => {
      void this.reconcileStaleChats()
    }, 5000)
  }

  private handleAgentEvent(event: AgentEvent): void {
    const store = useChatStore.getState()

    if (event.chatId) {
      this.lastEventTime.set(event.chatId, Date.now())
      store.initChat(event.chatId)
    }

    switch (event.type) {
      case 'new_chat':
        this.emitChatListInvalidation()
        break
      case 'inbound_message':
        if (event.chatId) {
          store.addUserMessage(event.chatId, {
            id: event.messageId ?? Date.now().toString(),
            role: 'user',
            content: event.content ?? '',
            timestamp: event.timestamp ?? new Date().toISOString(),
          })
        }
        this.emitChatListInvalidation()
        break
      case 'stream':
        if (event.chatId) {
          store.appendStreamText(event.chatId, event.text ?? '')
        }
        break
      case 'tool_use':
        if (event.chatId) {
          const tool: ToolUseItem = {
            id: Date.now().toString(),
            name: event.tool ?? 'unknown',
            input: event.input,
            status: 'running',
          }
          store.addToolUse(event.chatId, tool)
        }
        break
      case 'document_status':
        if (event.chatId && event.documentId && event.filename && event.status) {
          store.setDocumentStatus(event.chatId, event.documentId, event.filename, event.status, event.error)
        }
        break
      case 'complete':
        if (event.chatId) {
          const chatState = store.chats[event.chatId]
          const finalToolUse = event.toolUse ?? (chatState?.pendingToolUse ?? []).map((tool) => ({
            ...tool,
            status: 'done' as const,
          }))
          store.completeMessage(event.chatId, event.fullText ?? '', finalToolUse, event.sessionId, event.turnId)
        }
        this.emitChatListInvalidation()
        break
      case 'processing':
        if (event.chatId) {
          if (!event.isProcessing) {
            void this.finalizeChat(event.chatId)
            break
          }
          store.setProcessing(event.chatId, true)
        }
        break
      case 'error':
        if (event.chatId) {
          store.markSseErrorHandled(event.chatId)
          store.handleError(event.chatId, event.error ?? '', event.errorCode)
        }
        break
    }
  }

  private mapApiMessages(chatId: string, messages: Awaited<ReturnType<typeof getMessages>>) {
    const store = useChatStore.getState()
    store.setMessages(
      chatId,
      messages.map((message) => ({
        id: message.id,
        role: message.is_bot_message
          ? ('assistant' as const)
          : ('user' as const),
        content: message.content,
        timestamp: message.timestamp,
        toolUse: message.toolUse ?? undefined,
        attachments:
          (message as { attachments?: Attachment[] | null }).attachments
          ?? undefined,
        errorCode: message.errorCode ?? undefined,
        sessionId: message.sessionId ?? undefined,
        turnId: message.turnId ?? undefined,
      })),
    )
  }

  private async finalizeChat(chatId: string): Promise<void> {
    try {
      const messages = await getMessages(chatId)
      this.mapApiMessages(chatId, messages)
    } catch {
      // Keep local state if the final sync fails.
    } finally {
      const store = useChatStore.getState()
      store.setProcessing(chatId, false)
    }
  }

  private async reconcileStaleChats(): Promise<void> {
    const store = useChatStore.getState()
    const candidates = Object.values(store.chats).filter((chat) => {
      if (!chat.isProcessing) return false
      const lastTime = this.lastEventTime.get(chat.chatId) ?? 0
      return Date.now() - lastTime >= 8000
    })

    for (const chat of candidates) {
      try {
        const messages = await getMessages(chat.chatId)
        const lastMessage = messages[messages.length - 1]
        if (lastMessage && lastMessage.is_bot_message) {
          this.mapApiMessages(chat.chatId, messages)
          store.setProcessing(chat.chatId, false)
        }
      } catch {
        // Retry on the next reconciliation tick.
      }
    }
  }
}

export const socketManager = new SocketManager()
