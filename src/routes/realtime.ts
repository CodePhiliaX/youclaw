import { Hono } from 'hono'
import { upgradeWebSocket } from 'hono/bun'
import type { RealtimeHub } from '../realtime/hub.ts'

export function createRealtimeRoutes(realtimeHub: RealtimeHub) {
  const realtime = new Hono()

  realtime.get('/ws', upgradeWebSocket(() => ({
    onOpen(_event, ws) {
      realtimeHub.register(ws.raw as object & {
        send(data: string | ArrayBuffer | Uint8Array, compress?: boolean): void
        readyState: number
      })
    },
    onClose(_event, ws) {
      realtimeHub.unregister(ws.raw as object)
    },
    onError(_event, ws) {
      realtimeHub.unregister(ws.raw as object)
    },
    onMessage(event, ws) {
      if (typeof event.data === 'string' && event.data === 'ping') {
        realtimeHub.sendPong(ws.raw as {
          send(data: string | ArrayBuffer | Uint8Array, compress?: boolean): void
          readyState: number
        })
      }
    },
  })))

  return realtime
}
