import { Hono } from 'hono'
import { z } from 'zod/v4'
import { CHANNEL_TYPE_REGISTRY, maskSecretFields } from '../channel/config-schema.ts'
import type { ChannelManager } from '../channel/manager.ts'
import { getChannelRecords, getChannelRecord } from '../db/index.ts'

const createChannelSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/).optional(),
  type: z.string().min(1),
  label: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
  enabled: z.boolean().optional(),
})

const updateChannelSchema = z.object({
  label: z.string().min(1).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
})

export function createChannelsRoutes(channelManager: ChannelManager) {
  const channels = new Hono()

  // GET /api/channels — list all channel instances (with runtime status)
  channels.get('/channels', async (c) => {
    const statuses = channelManager.getStatuses()
    const records = getChannelRecords()

    const result = await Promise.all(records.map(async (record) => {
      const status = statuses.find((s) => s.id === record.id)
      const config = JSON.parse(record.config) as Record<string, unknown>
      const { masked, configuredFields } = maskSecretFields(record.type, config)
      const typeInfo = CHANNEL_TYPE_REGISTRY[record.type]
      const authStatus = await channelManager.getChannelAuthStatus(record.id).catch(() => ({
        supportsQrLogin: false,
        loggedIn: false,
        connected: status?.connected ?? false,
        accountLabel: undefined,
      }))

      return {
        id: record.id,
        type: record.type,
        label: record.label,
        chatIdPrefix: typeInfo?.chatIdPrefix ?? '',
        docsUrl: typeInfo?.docsUrl ?? '',
        connected: status?.connected ?? false,
        enabled: !!record.enabled,
        config: masked,
        configuredFields,
        error: status?.error,
        supportsQrLogin: authStatus.supportsQrLogin,
        loggedIn: authStatus.loggedIn,
        accountLabel: authStatus.accountLabel,
        created_at: record.created_at,
        updated_at: record.updated_at,
      }
    }))

    return c.json(result)
  })

  // GET /api/channels/types — list supported channel types (metadata)
  channels.get('/channels/types', (c) => {
    const types = Object.values(CHANNEL_TYPE_REGISTRY).map((info) => ({
      type: info.type,
      label: info.label,
      description: info.description,
      chatIdPrefix: info.chatIdPrefix,
      configFields: info.configFields,
      docsUrl: info.docsUrl,
      hidden: info.hidden ?? false,
    }))
    return c.json(types)
  })

  // POST /api/channels — create a channel instance
  channels.post('/channels', async (c) => {
    const body = await c.req.json()
    const parsed = createChannelSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400)
    }

    try {
      const record = await channelManager.createChannel(parsed.data)
      return c.json(record, 201)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: msg }, 400)
    }
  })

  // PUT /api/channels/:id — update config (triggers hot reconnect)
  channels.put('/channels/:id', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json()
    const parsed = updateChannelSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400)
    }

    try {
      const record = await channelManager.updateChannel(id, parsed.data)
      return c.json(record)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const status = msg.includes('not found') ? 404 : 400
      return c.json({ error: msg }, status)
    }
  })

  // DELETE /api/channels/:id — delete (disconnect first)
  channels.delete('/channels/:id', async (c) => {
    const id = c.req.param('id')

    if (!getChannelRecord(id)) {
      return c.json({ error: `Channel "${id}" not found` }, 404)
    }

    try {
      await channelManager.deleteChannel(id)
      return c.json({ ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: msg }, 500)
    }
  })

  // POST /api/channels/:id/connect — manually connect
  channels.post('/channels/:id/connect', async (c) => {
    const id = c.req.param('id')
    try {
      await channelManager.connectChannel(id)
      return c.json({ ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: msg }, 400)
    }
  })

  // POST /api/channels/:id/disconnect — manually disconnect
  channels.post('/channels/:id/disconnect', async (c) => {
    const id = c.req.param('id')
    try {
      await channelManager.disconnectChannel(id)
      return c.json({ ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ error: msg }, 400)
    }
  })

  // GET /api/channels/:id/auth-status — login/auth state for QR-capable channels
  channels.get('/channels/:id/auth-status', async (c) => {
    const id = c.req.param('id')
    try {
      const status = await channelManager.getChannelAuthStatus(id)
      return c.json(status)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const status = msg.includes('does not exist') ? 404 : 400
      return c.json({ error: msg }, status)
    }
  })

  // POST /api/channels/:id/login/start — start QR login for a channel
  channels.post('/channels/:id/login/start', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json().catch(() => ({})) as {
      force?: boolean
      timeoutMs?: number
      verbose?: boolean
    }

    try {
      const result = await channelManager.startQrLogin(id, {
        force: body.force,
        timeoutMs: body.timeoutMs,
        verbose: body.verbose,
      })
      return c.json(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const status = msg.includes('does not exist') ? 404 : 400
      return c.json({ error: msg }, status)
    }
  })

  // POST /api/channels/:id/login/wait — wait for QR login completion
  channels.post('/channels/:id/login/wait', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json().catch(() => ({})) as { timeoutMs?: number }

    try {
      const result = await channelManager.waitQrLogin(id, {
        timeoutMs: body.timeoutMs,
      })
      return c.json(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const status = msg.includes('does not exist') ? 404 : 400
      return c.json({ error: msg }, status)
    }
  })

  // POST /api/channels/:id/logout — clear login state for QR-capable channels
  channels.post('/channels/:id/logout', async (c) => {
    const id = c.req.param('id')
    try {
      const result = await channelManager.logoutChannel(id)
      return c.json(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const status = msg.includes('does not exist') ? 404 : 400
      return c.json({ error: msg }, status)
    }
  })

  return channels
}
