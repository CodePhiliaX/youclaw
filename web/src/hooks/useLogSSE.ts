import { useEffect, useRef } from 'react'
import { getBaseUrlSync } from '@/api/transport'
import type { LogEntry } from '@/api/client'

export function useLogSSE(
  enabled: boolean,
  onEntry: (entry: LogEntry) => void,
) {
  const onEntryRef = useRef(onEntry)
  onEntryRef.current = onEntry

  useEffect(() => {
    if (!enabled) return

    const baseUrl = getBaseUrlSync()
    const es = new EventSource(`${baseUrl}/api/logs/stream`)

    es.addEventListener('log', (e: MessageEvent) => {
      try {
        const entry = JSON.parse(e.data) as LogEntry
        onEntryRef.current(entry)
      } catch {
        // Ignore parse errors
      }
    })

    es.onerror = () => {
      // Auto-reconnect handled by EventSource
    }

    return () => {
      es.close()
    }
  }, [enabled])
}
