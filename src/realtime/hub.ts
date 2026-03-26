import { randomUUID } from 'node:crypto'
import type { EventBus, AgentEvent, Unsubscribe } from '../events/index.ts'
import type {
  RealtimeChatSnapshot,
  RealtimeDocumentStatusSnapshot,
  RealtimeEnvelope,
  RealtimeToolUseSnapshot,
} from './types.ts'

type RealtimeSocket = {
  send(data: string | ArrayBuffer | Uint8Array, compress?: boolean): void
  readyState: number
}

function cloneToolUse(items: RealtimeToolUseSnapshot[]): RealtimeToolUseSnapshot[] {
  return items.map((item) => ({ ...item }))
}

function cloneDocumentStatuses(items: RealtimeDocumentStatusSnapshot[]): RealtimeDocumentStatusSnapshot[] {
  return items.map((item) => ({ ...item }))
}

function cloneSnapshot(snapshot: RealtimeChatSnapshot): RealtimeChatSnapshot {
  return {
    ...snapshot,
    pendingToolUse: cloneToolUse(snapshot.pendingToolUse),
    documentStatuses: cloneDocumentStatuses(snapshot.documentStatuses),
  }
}

function emptySnapshot(event: Extract<AgentEvent, { chatId: string }>): RealtimeChatSnapshot {
  return {
    agentId: event.agentId,
    chatId: event.chatId,
    turnId: 'turnId' in event ? event.turnId : undefined,
    isProcessing: true,
    streamingText: '',
    pendingToolUse: [],
    documentStatuses: [],
    updatedAt: new Date().toISOString(),
  }
}

export class RealtimeHub {
  private readonly clients = new Map<string, RealtimeSocket>()
  private readonly socketIds = new WeakMap<object, string>()
  private readonly snapshots = new Map<string, RealtimeChatSnapshot>()
  private readonly unsubscribe: Unsubscribe

  constructor(eventBus: EventBus) {
    this.unsubscribe = eventBus.subscribe({}, (event) => {
      this.updateSnapshot(event)
      this.broadcast({ kind: 'agent_event', event })
    })
  }

  destroy(): void {
    this.unsubscribe()
    this.clients.clear()
    this.snapshots.clear()
  }

  register(rawSocket: object & RealtimeSocket): void {
    const id = randomUUID()
    this.socketIds.set(rawSocket, id)
    this.clients.set(id, rawSocket)
    this.send(rawSocket, {
      kind: 'connected',
      timestamp: new Date().toISOString(),
    })
    this.send(rawSocket, {
      kind: 'snapshot',
      chats: this.getSnapshots(),
    })
  }

  unregister(rawSocket: object): void {
    const id = this.socketIds.get(rawSocket)
    if (!id) return
    this.socketIds.delete(rawSocket)
    this.clients.delete(id)
  }

  sendPong(rawSocket: RealtimeSocket): void {
    this.send(rawSocket, {
      kind: 'pong',
      timestamp: new Date().toISOString(),
    })
  }

  getSnapshots(): RealtimeChatSnapshot[] {
    return Array.from(this.snapshots.values())
      .filter((snapshot) => snapshot.isProcessing)
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .map(cloneSnapshot)
  }

  private broadcast(envelope: RealtimeEnvelope): void {
    const payload = JSON.stringify(envelope)
    for (const [id, socket] of this.clients.entries()) {
      if (socket.readyState !== 1) {
        this.clients.delete(id)
        continue
      }

      try {
        socket.send(payload)
      } catch {
        this.clients.delete(id)
      }
    }
  }

  private send(socket: RealtimeSocket, envelope: RealtimeEnvelope): void {
    if (socket.readyState !== 1) return
    try {
      socket.send(JSON.stringify(envelope))
    } catch {
      // best-effort only
    }
  }

  private updateSnapshot(event: AgentEvent): void {
    if (!('chatId' in event)) {
      return
    }

    switch (event.type) {
      case 'processing':
        if (event.isProcessing) {
          const snapshot = this.ensureSnapshot(event)
          snapshot.isProcessing = true
          snapshot.turnId = event.turnId ?? snapshot.turnId
          snapshot.updatedAt = new Date().toISOString()
          this.snapshots.set(event.chatId, snapshot)
          return
        }
        this.snapshots.delete(event.chatId)
        return
      case 'stream': {
        const snapshot = this.ensureSnapshot(event)
        snapshot.turnId = event.turnId ?? snapshot.turnId
        snapshot.isProcessing = true
        snapshot.streamingText += event.text
        snapshot.updatedAt = new Date().toISOString()
        this.snapshots.set(event.chatId, snapshot)
        return
      }
      case 'tool_use': {
        const snapshot = this.ensureSnapshot(event)
        snapshot.turnId = event.turnId ?? snapshot.turnId
        snapshot.isProcessing = true
        snapshot.pendingToolUse = [
          ...snapshot.pendingToolUse.map((tool) =>
            tool.status === 'running' ? { ...tool, status: 'done' as const } : tool
          ),
          {
            id: `${Date.now()}:${randomUUID()}`,
            name: event.tool,
            input: event.input,
            status: 'running',
          },
        ]
        snapshot.updatedAt = new Date().toISOString()
        this.snapshots.set(event.chatId, snapshot)
        return
      }
      case 'document_status': {
        const snapshot = this.ensureSnapshot(event)
        snapshot.turnId = event.turnId ?? snapshot.turnId
        snapshot.isProcessing = true
        const documentKey = event.documentId === 'pending' ? `${event.filename}:pending` : event.documentId
        const nextStatuses = snapshot.documentStatuses.filter((status) => {
          if (status.documentKey === documentKey) return false
          if (event.status !== 'parsing' && status.documentKey === `${event.filename}:pending`) return false
          return true
        })
        nextStatuses.push({
          documentKey,
          filename: event.filename,
          status: event.status,
          error: event.error,
        })
        snapshot.documentStatuses = nextStatuses
        snapshot.updatedAt = new Date().toISOString()
        this.snapshots.set(event.chatId, snapshot)
        return
      }
      case 'complete':
      case 'error':
        this.snapshots.delete(event.chatId)
        return
      default:
        return
    }
  }

  private ensureSnapshot(event: Extract<AgentEvent, { chatId: string }>): RealtimeChatSnapshot {
    const existing = this.snapshots.get(event.chatId)
    if (existing) {
      return {
        ...existing,
        pendingToolUse: cloneToolUse(existing.pendingToolUse),
        documentStatuses: cloneDocumentStatuses(existing.documentStatuses),
      }
    }
    return emptySnapshot(event)
  }
}
