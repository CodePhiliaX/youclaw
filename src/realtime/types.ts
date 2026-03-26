import type { AgentEvent } from '../events/index.ts'

export type RealtimeToolUseSnapshot = {
  id: string
  name: string
  input?: string
  status: 'running' | 'done'
}

export type RealtimeDocumentStatusSnapshot = {
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
  pendingToolUse: RealtimeToolUseSnapshot[]
  documentStatuses: RealtimeDocumentStatusSnapshot[]
  updatedAt: string
}

export type RealtimeEnvelope =
  | { kind: 'connected'; timestamp: string }
  | { kind: 'agent_event'; event: AgentEvent }
  | { kind: 'snapshot'; chats: RealtimeChatSnapshot[] }
  | { kind: 'pong'; timestamp: string }
