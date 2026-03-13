import { Hono } from 'hono'
import { getLogger } from '../logger/index.ts'
import type { ChannelManager } from '../channel/manager.ts'
import { WeComChannel } from '../channel/wecom.ts'

export function createWebhooksRoutes(channelManager: ChannelManager): Hono {
  const webhooks = new Hono()

  // 企业微信 URL 验证（GET）
  webhooks.get('/webhooks/wecom/:channelId', async (c) => {
    const logger = getLogger()
    const channelId = c.req.param('channelId')

    const instance = channelManager.getChannelInstance(channelId)
    if (!instance || !(instance instanceof WeComChannel)) {
      logger.warn({ channelId }, 'Webhook: 未找到企业微信 channel 实例')
      return c.text('Channel not found', 404)
    }

    const { msg_signature, timestamp, nonce, echostr } = c.req.query()
    if (!msg_signature || !timestamp || !nonce || !echostr) {
      return c.text('Missing parameters', 400)
    }

    const result = instance.handleWebhookVerification({ msg_signature, timestamp, nonce, echostr })
    if (result.success) {
      return c.text(result.echostr!)
    }

    logger.warn({ channelId, error: result.error }, 'Webhook 验证失败')
    return c.text('Verification failed', 403)
  })

  // 企业微信消息回调（POST）
  webhooks.post('/webhooks/wecom/:channelId', async (c) => {
    const logger = getLogger()
    const channelId = c.req.param('channelId')

    const instance = channelManager.getChannelInstance(channelId)
    if (!instance || !(instance instanceof WeComChannel)) {
      logger.warn({ channelId }, 'Webhook: 未找到企业微信 channel 实例')
      return c.text('Channel not found', 404)
    }

    const { msg_signature, timestamp, nonce } = c.req.query()
    if (!msg_signature || !timestamp || !nonce) {
      return c.text('Missing parameters', 400)
    }

    const body = await c.req.text()
    const result = instance.handleWebhookMessage({ msg_signature, timestamp, nonce }, body)

    if (result.success) {
      return c.text('success')
    }

    logger.warn({ channelId, error: result.error }, 'Webhook 消息处理失败')
    return c.text('Failed', 400)
  })

  return webhooks
}
