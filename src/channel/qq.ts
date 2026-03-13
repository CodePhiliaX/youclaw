import { getLogger } from '../logger/index.ts'
import type { EventBus } from '../events/bus.ts'
import type { Channel, InboundMessage, OnInboundMessage } from './types.ts'

const QQ_TEXT_CHUNK_LIMIT = 4000
const QQ_API_BASE = 'https://api.sgroup.qq.com'
const QQ_TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken'

// WebSocket op codes
const OP_DISPATCH = 0
const OP_HEARTBEAT = 1
const OP_IDENTIFY = 2
const OP_RESUME = 6
const OP_RECONNECT = 7
const OP_INVALID_SESSION = 9
const OP_HELLO = 10
const OP_HEARTBEAT_ACK = 11

// intents: GROUP_AND_C2C_EVENT (1 << 25)
const INTENTS_GROUP_AND_C2C = 1 << 25

export interface QQChannelOpts {
  onMessage: OnInboundMessage
  eventBus?: EventBus
  _fetchFn?: typeof fetch
  _WebSocketClass?: typeof WebSocket
}

interface AccessToken {
  access_token: string
  expires_in: number
  fetchedAt: number
}

/**
 * 提取 QQ 消息文本内容
 */
export function extractQQTextContent(content: string): string {
  return content.trim()
}

/**
 * 去除 <@!botid> 格式的 @bot 提及
 */
export function stripQQBotMention(content: string): string {
  return content.replace(/<@!\w+>/g, '').trim()
}

/**
 * 文本分片
 */
export function chunkText(text: string, limit: number): string[] {
  if (text.length <= limit) return [text]
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += limit) {
    chunks.push(text.slice(i, i + limit))
  }
  return chunks
}

/**
 * 检查 token 是否仍在有效期内
 */
export function isTokenValid(token: AccessToken | null, bufferMs: number = 300000): boolean {
  if (!token) return false
  const elapsed = Date.now() - token.fetchedAt
  return elapsed < (token.expires_in * 1000 - bufferMs)
}

export class QQChannel implements Channel {
  name = 'qq'

  private botAppId: string
  private botSecret: string
  private opts: QQChannelOpts
  private accessToken: AccessToken | null = null
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private ws: WebSocket | null = null
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatInterval: number = 41250
  private lastSeq: number | null = null
  private sessionId: string | null = null
  private resumeGatewayUrl: string | null = null
  private _connected = false
  private reconnectAttempt = 0
  private recentMsgIds: Map<string, { msgId: string; msgSeq: number }> = new Map()
  private eventBus: EventBus | null = null
  private unsubscribeEvents: (() => void) | null = null
  private fetchFn: typeof fetch
  private WebSocketClass: typeof WebSocket

  constructor(botAppId: string, botSecret: string, opts: QQChannelOpts) {
    this.botAppId = botAppId
    this.botSecret = botSecret
    this.opts = opts
    this.eventBus = opts.eventBus ?? null
    this.fetchFn = opts._fetchFn ?? globalThis.fetch.bind(globalThis)
    this.WebSocketClass = opts._WebSocketClass ?? globalThis.WebSocket
  }

  async connect(): Promise<void> {
    const logger = getLogger()

    // 1. 获取 access_token
    await this.refreshToken()

    // 2. 调度 token 自动刷新
    this.scheduleTokenRefresh()

    // 3. 获取 WebSocket 网关
    const gatewayUrl = await this.getGatewayUrl()

    // 4. 建立 WebSocket 连接
    await this.connectWebSocket(gatewayUrl)

    // 5. 订阅 EventBus complete/error 事件（用于清理 recentMsgIds）
    if (this.eventBus) {
      this.unsubscribeEvents = this.eventBus.subscribe(
        { types: ['complete', 'error'] },
        (event) => {
          if ('chatId' in event && event.chatId?.startsWith('qq:')) {
            this.recentMsgIds.delete(event.chatId)
          }
        }
      )
    }

    this._connected = true
    logger.info('QQ WebSocket 连接已建立')
  }

  private async refreshToken(): Promise<void> {
    const logger = getLogger()
    let lastError: Error | null = null

    for (let i = 0; i < 3; i++) {
      try {
        const res = await this.fetchFn(QQ_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appId: this.botAppId, clientSecret: this.botSecret }),
        })

        if (!res.ok) {
          throw new Error(`Token 请求失败: ${res.status} ${res.statusText}`)
        }

        const data = await res.json() as { access_token: string; expires_in: string }
        this.accessToken = {
          access_token: data.access_token,
          expires_in: parseInt(data.expires_in, 10),
          fetchedAt: Date.now(),
        }

        logger.debug({ expiresIn: this.accessToken.expires_in }, 'QQ access_token 已刷新')
        return
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        const delay = 5000 * Math.pow(2, i)
        logger.warn({ attempt: i + 1, delay, error: lastError.message }, 'QQ token 刷新失败，重试中')
        if (i < 2) await new Promise(r => setTimeout(r, delay))
      }
    }

    throw new Error(`QQ token 刷新失败（3 次重试）: ${lastError?.message}`)
  }

  private scheduleTokenRefresh(): void {
    if (this.tokenRefreshTimer) clearTimeout(this.tokenRefreshTimer)

    if (!this.accessToken) return

    // 过期前 5 分钟刷新
    const refreshIn = Math.max((this.accessToken.expires_in - 300) * 1000, 60000)
    this.tokenRefreshTimer = setTimeout(async () => {
      try {
        await this.refreshToken()
        this.scheduleTokenRefresh()
      } catch (err) {
        getLogger().error({ error: err instanceof Error ? err.message : String(err) }, 'QQ token 自动刷新失败')
      }
    }, refreshIn)
  }

  private async getGatewayUrl(): Promise<string> {
    const res = await this.fetchFn(`${QQ_API_BASE}/gateway/bot`, {
      headers: {
        'Authorization': `QQBot ${this.accessToken!.access_token}`,
      },
    })

    if (!res.ok) {
      throw new Error(`获取 QQ WebSocket 网关失败: ${res.status}`)
    }

    const data = await res.json() as { url: string }
    return data.url
  }

  private connectWebSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const logger = getLogger()
      let resolved = false

      this.ws = new this.WebSocketClass(url)

      this.ws.onmessage = (event: MessageEvent) => {
        let payload: { op: number; d?: any; s?: number; t?: string }
        try {
          payload = JSON.parse(typeof event.data === 'string' ? event.data : '')
        } catch {
          logger.warn('QQ WebSocket 收到无效 JSON')
          return
        }

        // 更新序列号
        if (payload.s !== null && payload.s !== undefined) {
          this.lastSeq = payload.s
        }

        switch (payload.op) {
          case OP_HELLO: {
            // 收到 HELLO，获取心跳间隔
            this.heartbeatInterval = payload.d?.heartbeat_interval ?? 41250
            // 发送 IDENTIFY
            this.sendWsPayload(OP_IDENTIFY, {
              token: `QQBot ${this.accessToken!.access_token}`,
              intents: INTENTS_GROUP_AND_C2C,
              shard: [0, 1],
            })
            break
          }

          case OP_DISPATCH: {
            if (payload.t === 'READY') {
              this.sessionId = payload.d?.session_id
              this.resumeGatewayUrl = payload.d?.resume_gateway_url || url
              this.reconnectAttempt = 0
              this.startHeartbeat()
              if (!resolved) {
                resolved = true
                resolve()
              }
            } else if (payload.t === 'RESUMED') {
              this.reconnectAttempt = 0
              this.startHeartbeat()
              if (!resolved) {
                resolved = true
                resolve()
              }
            } else if (payload.t === 'C2C_MESSAGE_CREATE') {
              this.handleC2CMessage(payload.d)
            } else if (payload.t === 'GROUP_AT_MESSAGE_CREATE') {
              this.handleGroupMessage(payload.d)
            }
            break
          }

          case OP_HEARTBEAT_ACK: {
            // 心跳确认，无需额外处理
            break
          }

          case OP_RECONNECT: {
            logger.info('QQ WebSocket 收到 RECONNECT，正在重连')
            this.handleReconnect()
            break
          }

          case OP_INVALID_SESSION: {
            logger.warn('QQ WebSocket 收到 INVALID_SESSION，清除 session 后全量重连')
            this.sessionId = null
            this.lastSeq = null
            this.handleReconnect()
            break
          }
        }
      }

      this.ws.onerror = (event) => {
        logger.error({ error: event }, 'QQ WebSocket 错误')
        if (!resolved) {
          resolved = true
          reject(new Error('QQ WebSocket 连接错误'))
        }
      }

      this.ws.onclose = () => {
        logger.info('QQ WebSocket 连接已关闭')
        this.clearHeartbeat()
        if (this._connected) {
          this.handleReconnect()
        }
      }
    })
  }

  private sendWsPayload(op: number, d: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op, d }))
    }
  }

  private startHeartbeat(): void {
    this.clearHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      this.sendWsPayload(OP_HEARTBEAT, this.lastSeq)
    }, this.heartbeatInterval)
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private async handleReconnect(): Promise<void> {
    const logger = getLogger()

    this.clearHeartbeat()
    if (this.ws) {
      try { this.ws.close() } catch { /* ignore */ }
      this.ws = null
    }

    if (this.reconnectAttempt >= 10) {
      logger.error('QQ WebSocket 重连次数已用尽')
      this._connected = false
      return
    }

    const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempt), 300000)
    this.reconnectAttempt++

    logger.info({ attempt: this.reconnectAttempt, delayMs: delay }, 'QQ WebSocket 将在延迟后重连')
    await new Promise(r => setTimeout(r, delay))

    try {
      // 优先 RESUME
      if (this.sessionId && this.lastSeq !== null && this.resumeGatewayUrl) {
        await this.connectWebSocketForResume(this.resumeGatewayUrl)
      } else {
        // 全量重连
        await this.refreshToken()
        this.scheduleTokenRefresh()
        const gatewayUrl = await this.getGatewayUrl()
        await this.connectWebSocket(gatewayUrl)
      }
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'QQ WebSocket 重连失败')
      this.handleReconnect()
    }
  }

  private connectWebSocketForResume(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const logger = getLogger()
      let resolved = false

      this.ws = new this.WebSocketClass(url)

      this.ws.onmessage = (event: MessageEvent) => {
        let payload: { op: number; d?: any; s?: number; t?: string }
        try {
          payload = JSON.parse(typeof event.data === 'string' ? event.data : '')
        } catch {
          return
        }

        if (payload.s !== null && payload.s !== undefined) {
          this.lastSeq = payload.s
        }

        if (payload.op === OP_HELLO) {
          this.heartbeatInterval = payload.d?.heartbeat_interval ?? 41250
          // 发送 RESUME
          this.sendWsPayload(OP_RESUME, {
            token: `QQBot ${this.accessToken!.access_token}`,
            session_id: this.sessionId,
            seq: this.lastSeq,
          })
        } else if (payload.op === OP_DISPATCH) {
          if (payload.t === 'RESUMED') {
            this.reconnectAttempt = 0
            this.startHeartbeat()
            if (!resolved) { resolved = true; resolve() }
          } else if (payload.t === 'C2C_MESSAGE_CREATE') {
            this.handleC2CMessage(payload.d)
          } else if (payload.t === 'GROUP_AT_MESSAGE_CREATE') {
            this.handleGroupMessage(payload.d)
          }
        } else if (payload.op === OP_INVALID_SESSION) {
          logger.warn('QQ RESUME 失败，进行全量重连')
          this.sessionId = null
          this.lastSeq = null
          if (!resolved) { resolved = true; reject(new Error('RESUME 失败')) }
        } else if (payload.op === OP_HEARTBEAT_ACK) {
          // ignore
        }
      }

      this.ws.onerror = () => {
        if (!resolved) { resolved = true; reject(new Error('QQ WebSocket RESUME 连接错误')) }
      }

      this.ws.onclose = () => {
        this.clearHeartbeat()
        if (!resolved) { resolved = true; reject(new Error('QQ WebSocket RESUME 连接关闭')) }
        if (this._connected) {
          this.handleReconnect()
        }
      }
    })
  }

  private handleC2CMessage(d: any): void {
    const logger = getLogger()
    try {
      const chatId = `qq:c2c:${d.author.user_openid}`
      const content = extractQQTextContent(d.content || '')
      if (!content) return

      this.recentMsgIds.set(chatId, { msgId: d.id, msgSeq: 0 })

      const inbound: InboundMessage = {
        id: d.id,
        chatId,
        sender: d.author.user_openid,
        senderName: d.author.user_openid,
        content,
        timestamp: new Date(d.timestamp).toISOString(),
        isGroup: false,
        channel: 'qq',
      }

      this.opts.onMessage(inbound)
      logger.debug({ chatId }, 'QQ 私聊消息已接收')
    } catch (err) {
      logger.error({ error: err }, '处理 QQ 私聊消息失败')
    }
  }

  private handleGroupMessage(d: any): void {
    const logger = getLogger()
    try {
      const chatId = `qq:group:${d.group_openid}`
      let content = extractQQTextContent(d.content || '')
      content = stripQQBotMention(content)
      if (!content) return

      this.recentMsgIds.set(chatId, { msgId: d.id, msgSeq: 0 })

      const inbound: InboundMessage = {
        id: d.id,
        chatId,
        sender: d.author.member_openid,
        senderName: d.author.member_openid,
        content,
        timestamp: new Date(d.timestamp).toISOString(),
        isGroup: true,
        channel: 'qq',
      }

      this.opts.onMessage(inbound)
      logger.debug({ chatId }, 'QQ 群聊消息已接收')
    } catch (err) {
      logger.error({ error: err }, '处理 QQ 群聊消息失败')
    }
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    const logger = getLogger()

    try {
      // 确保 token 有效
      if (!isTokenValid(this.accessToken)) {
        await this.refreshToken()
      }

      const chunks = chunkText(text, QQ_TEXT_CHUNK_LIMIT)
      const recent = this.recentMsgIds.get(chatId)

      for (const chunk of chunks) {
        const msgSeq = recent ? ++recent.msgSeq : 1
        const body: Record<string, unknown> = {
          content: chunk,
          msg_type: 0,
          msg_seq: msgSeq,
        }

        if (recent?.msgId) {
          body.msg_id = recent.msgId
        }

        let url: string
        if (chatId.startsWith('qq:c2c:')) {
          const openid = chatId.slice('qq:c2c:'.length)
          url = `${QQ_API_BASE}/v2/users/${openid}/messages`
        } else if (chatId.startsWith('qq:group:')) {
          const groupOpenid = chatId.slice('qq:group:'.length)
          url = `${QQ_API_BASE}/v2/groups/${groupOpenid}/messages`
        } else {
          logger.warn({ chatId }, 'QQ: 未知的 chatId 格式')
          return
        }

        const res = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            'Authorization': `QQBot ${this.accessToken!.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          const errText = await res.text().catch(() => '')
          logger.error({ chatId, status: res.status, body: errText }, 'QQ 消息发送失败')
        }
      }

      logger.debug({ chatId, length: text.length }, 'QQ 消息已发送')
    } catch (err) {
      logger.error({ chatId, error: err }, 'QQ 消息发送异常')
    }
  }

  isConnected(): boolean {
    return this._connected
  }

  ownsChatId(chatId: string): boolean {
    return chatId.startsWith('qq:')
  }

  async disconnect(): Promise<void> {
    const logger = getLogger()

    if (this.unsubscribeEvents) {
      this.unsubscribeEvents()
      this.unsubscribeEvents = null
    }

    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer)
      this.tokenRefreshTimer = null
    }

    this.clearHeartbeat()

    if (this.ws) {
      try {
        this.ws.close()
      } catch {
        // ignore close errors
      }
      this.ws = null
    }

    this._connected = false
    logger.info('QQ Channel 已断开')
  }
}
