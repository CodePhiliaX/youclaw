import { describe, expect, test } from 'bun:test'
import { EventBus } from '../src/events/bus.ts'
import { RealtimeHub } from '../src/realtime/hub.ts'
import type { RealtimeEnvelope } from '../src/realtime/types.ts'

function createSocket() {
  const sent: RealtimeEnvelope[] = []
  return {
    readyState: 1 as const,
    send(data: string | ArrayBuffer | Uint8Array) {
      sent.push(JSON.parse(String(data)) as RealtimeEnvelope)
    },
    sent,
  }
}

describe('RealtimeHub', () => {
  test('tracks in-flight chat snapshots and clears them on completion', () => {
    const bus = new EventBus()
    const hub = new RealtimeHub(bus)
    const socket = createSocket()

    hub.register(socket as object & { send(data: string | ArrayBuffer | Uint8Array): void; readyState: number })

    bus.emit({ type: 'processing', agentId: 'agent-1', chatId: 'chat-1', isProcessing: true, turnId: 'turn-1' })
    bus.emit({ type: 'stream', agentId: 'agent-1', chatId: 'chat-1', text: 'hello ', turnId: 'turn-1' })
    bus.emit({ type: 'tool_use', agentId: 'agent-1', chatId: 'chat-1', tool: 'read_file', input: '{"path":"a"}', turnId: 'turn-1' })
    bus.emit({ type: 'document_status', agentId: 'agent-1', chatId: 'chat-1', documentId: 'doc-1', filename: 'spec.md', status: 'parsed', turnId: 'turn-1' })

    const snapshots = hub.getSnapshots()
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]?.chatId).toBe('chat-1')
    expect(snapshots[0]?.streamingText).toBe('hello ')
    expect(snapshots[0]?.pendingToolUse[0]?.name).toBe('read_file')
    expect(snapshots[0]?.documentStatuses[0]?.documentKey).toBe('doc-1')

    const eventKinds = socket.sent
      .filter((envelope) => envelope.kind === 'agent_event')
      .map((envelope) => envelope.kind === 'agent_event' ? envelope.event.type : 'unknown')
    expect(eventKinds).toEqual(['processing', 'stream', 'tool_use', 'document_status'])

    bus.emit({ type: 'complete', agentId: 'agent-1', chatId: 'chat-1', fullText: 'hello world', sessionId: 'session-1', turnId: 'turn-1' })
    expect(hub.getSnapshots()).toHaveLength(0)

    hub.destroy()
  })

  test('replays current snapshots to newly connected sockets', () => {
    const bus = new EventBus()
    const hub = new RealtimeHub(bus)

    bus.emit({ type: 'processing', agentId: 'agent-1', chatId: 'chat-2', isProcessing: true, turnId: 'turn-2' })
    bus.emit({ type: 'stream', agentId: 'agent-1', chatId: 'chat-2', text: 'restored', turnId: 'turn-2' })

    const socket = createSocket()
    hub.register(socket as object & { send(data: string | ArrayBuffer | Uint8Array): void; readyState: number })

    expect(socket.sent[0]).toEqual({
      kind: 'connected',
      timestamp: expect.any(String),
    })
    expect(socket.sent[1]).toEqual({
      kind: 'snapshot',
      chats: [
        expect.objectContaining({
          chatId: 'chat-2',
          streamingText: 'restored',
          isProcessing: true,
        }),
      ],
    })

    hub.destroy()
  })
})
