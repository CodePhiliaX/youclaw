import { getLogger } from '../logger/index.ts'
import type { EventBus } from '../events/bus.ts'
import type { Channel, InboundMessage, OnInboundMessage } from './types.ts'

const DINGTALK_API_BASE = 'https://api.dingtalk.com'
const DINGTALK_TEXT_CHUNK_LIMIT = 4000

export interface DingTalkChannelOpts {
  onMessage: OnInboundMessage
  eventBus?: EventBus
  _fetchFn?: typeof fetch
  _streamClient?: any
}

interface AccessToken {
  access_token: string
  expires_in: number
  fetchedAt: number
}

// ===== 纯函数（方便单元测试）=====

/**
 * 提取钉钉消息文本内容
 */
export function extractDingTalkTextContent(content: string): string {
  return content.trim()
}

/**
 * 去除 @机器人 提及
 */
export function stripDingTalkAtMention(content: string): string {
  // 钉钉 @机器人 格式通常为 @机器人名
  // atUsers 信息在 payload 中，此处去除所有 @xxx 开头的提及
  return content.replace(/@\S+/g, '').trim()
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
  return elapsed < token.expires_in * 1000 - bufferMs
}

export class DingTalkChannel implements Channel {
  name = 'dingtalk'

  private appKey: string
  private appSecret: string
  private opts: DingTalkChannelOpts
  private accessToken: AccessToken | null = null
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private streamClient: any = null
  private _connected = false
  private eventBus: EventBus | null = null
  private unsubscribeEvents: (() => void) | null = null
  private fetchFn: typeof fetch

  constructor(appKey: string, appSecret: string, opts: DingTalkChannelOpts) {
    this.appKey = appKey
    this.appSecret = appSecret
    this.opts = opts
    this.eventBus = opts.eventBus ?? null
    this.fetchFn = opts._fetchFn ?? globalThis.fetch.bind(globalThis)
  }

  async connect(): Promise<void> {
    const logger = getLogger()

    // 1. 获取 access_token
    await this.refreshToken()

    // 2. 调度 token 自动刷新
    this.scheduleTokenRefresh()

    // 3. 创建 Stream 客户端
    if (this.opts._streamClient) {
      this.streamClient = this.opts._streamClient
    } else {
      const { DWClient, EventAck, TOPIC_ROBOT } = await import('dingtalk-stream')
      const client = new DWClient({
        clientId: this.appKey,
        clientSecret: this.appSecret,
      })

      client.registerCallbackListener(TOPIC_ROBOT, (res: any) => {
        try {
          this.handleRobotMessage(res)
        } catch (err) {
          logger.error({ error: err }, '处理钉钉机器人消息失败')
        }
        // 确认消息已接收
        return { status: EventAck.SUCCESS }
      })

      this.streamClient = client
    }

    // 4. 启动 stream
    await this.streamClient.connect()
    await new Promise<void>((r) => setTimeout(r, 1000))

    // 5. 订阅 EventBus
    if (this.eventBus) {
      this.unsubscribeEvents = this.eventBus.subscribe(
        { types: ['complete', 'error'] },
        (_event) => {
          // 钉钉不需要特殊的完成清理
        },
      )
    }

    this._connected = true
    logger.info('钉钉 Stream 连接已建立')
  }

  private handleRobotMessage(res: any): void {
    const logger = getLogger()
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data

    const text = data.text?.content
    if (!text) return

    let content = extractDingTalkTextContent(text)
    const isGroup = data.conversationType === '2'

    // 群聊去除 @bot
    if (isGroup) {
      content = stripDingTalkAtMention(content)
    }

    if (!content) return

    let chatId: string
    if (isGroup) {
      chatId = `dingtalk:group:${data.conversationId}`
    } else {
      chatId = `dingtalk:user:${data.senderStaffId || data.senderId}`
    }

    const inbound: InboundMessage = {
      id: data.msgId || `dingtalk-${Date.now()}`,
      chatId,
      sender: data.senderStaffId || data.senderId || 'unknown',
      senderName: data.senderNick || data.senderStaffId || 'unknown',
      content,
      timestamp: new Date().toISOString(),
      isGroup,
      channel: 'dingtalk',
    }

    this.opts.onMessage(inbound)
    logger.debug({ chatId }, '钉钉消息已接收')
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    const logger = getLogger()

    try {
      // 确保 token 有效
      if (!isTokenValid(this.accessToken)) {
        await this.refreshToken()
      }

      const chunks = chunkText(text, DINGTALK_TEXT_CHUNK_LIMIT)

      for (const chunk of chunks) {
        if (chatId.startsWith('dingtalk:user:')) {
          const userId = chatId.slice('dingtalk:user:'.length)
          await this.sendUserMessage(userId, chunk)
        } else if (chatId.startsWith('dingtalk:group:')) {
          const conversationId = chatId.slice('dingtalk:group:'.length)
          await this.sendGroupMessage(conversationId, chunk)
        } else {
          logger.warn({ chatId }, '钉钉: 未知的 chatId 格式')
          return
        }
      }

      logger.debug({ chatId, length: text.length }, '钉钉消息已发送')
    } catch (err) {
      logger.error({ chatId, error: err }, '钉钉消息发送异常')
    }
  }

  private async sendUserMessage(userId: string, text: string): Promise<void> {
    const res = await this.fetchFn(`${DINGTALK_API_BASE}/v1.0/robot/oToMessages/batchSend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-acs-dingtalk-access-token': this.accessToken!.access_token,
      },
      body: JSON.stringify({
        robotCode: this.appKey,
        userIds: [userId],
        msgKey: 'sampleText',
        msgParam: JSON.stringify({ content: text }),
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      getLogger().error({ userId, status: res.status, body: errText }, '钉钉 1:1 消息发送失败')
    }
  }

  private async sendGroupMessage(conversationId: string, text: string): Promise<void> {
    const res = await this.fetchFn(`${DINGTALK_API_BASE}/v1.0/robot/groupMessages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-acs-dingtalk-access-token': this.accessToken!.access_token,
      },
      body: JSON.stringify({
        robotCode: this.appKey,
        openConversationId: conversationId,
        msgKey: 'sampleText',
        msgParam: JSON.stringify({ content: text }),
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      getLogger().error({ conversationId, status: res.status, body: errText }, '钉钉群聊消息发送失败')
    }
  }

  isConnected(): boolean {
    return this._connected
  }

  ownsChatId(chatId: string): boolean {
    return chatId.startsWith('dingtalk:')
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

    if (this.streamClient) {
      try {
        // DWClient 没有显式的 close 方法，置空即可
        this.streamClient = null
      } catch {
        // ignore close errors
      }
    }

    this._connected = false
    logger.info('钉钉 Channel 已断开')
  }

  private async refreshToken(): Promise<void> {
    const logger = getLogger()
    let lastError: Error | null = null

    for (let i = 0; i < 3; i++) {
      try {
        const res = await this.fetchFn(`${DINGTALK_API_BASE}/v1.0/oauth2/accessToken`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appKey: this.appKey, appSecret: this.appSecret }),
        })

        if (!res.ok) {
          throw new Error(`Token 请求失败: ${res.status} ${res.statusText}`)
        }

        const data = (await res.json()) as { accessToken: string; expireIn: number }
        this.accessToken = {
          access_token: data.accessToken,
          expires_in: data.expireIn,
          fetchedAt: Date.now(),
        }

        logger.debug({ expiresIn: data.expireIn }, '钉钉 access_token 已刷新')
        return
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        const delay = 5000 * Math.pow(2, i)
        logger.warn({ attempt: i + 1, delay, error: lastError.message }, '钉钉 token 刷新失败，重试中')
        if (i < 2) await new Promise((r) => setTimeout(r, delay))
      }
    }

    throw new Error(`钉钉 token 刷新失败（3 次重试）: ${lastError?.message}`)
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
        getLogger().error({ error: err instanceof Error ? err.message : String(err) }, '钉钉 token 自动刷新失败')
      }
    }, refreshIn)
  }
}
