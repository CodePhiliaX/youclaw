import type { PinoLogEntry } from './reader.ts'

type LogHandler = (entry: PinoLogEntry) => void

// Lightweight pub/sub singleton for broadcasting log lines
// Separate from EventBus which is for Agent events with chatId/agentId filtering
class LogBroadcaster {
  private handlers = new Set<LogHandler>()

  subscribe(handler: LogHandler): () => void {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  emit(entry: PinoLogEntry): void {
    for (const handler of this.handlers) {
      try {
        handler(entry)
      } catch {
        // Subscriber errors should not affect other subscribers
      }
    }
  }

  get subscriberCount(): number {
    return this.handlers.size
  }
}

export const logBroadcaster = new LogBroadcaster()
