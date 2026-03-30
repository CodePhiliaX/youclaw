import { Hono } from 'hono'
import { z } from 'zod/v4'
import type { AgentManager } from '../agent/index.ts'
import type { BrowserManager } from './manager.ts'
import { detectInstalledBrowsers } from './detect.ts'
import { buildBrowserExtensionZip, getBrowserExtensionPackageInfo } from './extension-package.ts'
import { BrowserRelayTokenError } from './relay.ts'
import {
  pollExtensionBridgeCommand,
  resolveExtensionBridgeCommand,
} from './extension-bridge.ts'

const CreateProfileSchema = z.object({
  name: z.string().min(1),
  driver: z.enum(['managed', 'remote-cdp', 'extension-relay']).optional(),
  executablePath: z.string().nullable().optional(),
  userDataDir: z.string().nullable().optional(),
  cdpPort: z.number().int().nullable().optional(),
  cdpUrl: z.string().nullable().optional(),
  headless: z.boolean().optional(),
  noSandbox: z.boolean().optional(),
  attachOnly: z.boolean().optional(),
  launchArgs: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
})

const UpdateProfileSchema = CreateProfileSchema.partial().extend({
  name: z.string().min(1).optional(),
})

const RelayConnectSchema = z.object({
  token: z.string().min(1),
  cdpUrl: z.string().min(1),
})

const MainBridgeSelectSchema = z.object({
  browserId: z.string().nullable().optional(),
})

const MainBridgeConnectSchema = z.object({
  token: z.string().min(1),
  cdpUrl: z.string().min(1),
  browserId: z.string().nullable().optional(),
  browserName: z.string().nullable().optional(),
  browserKind: z.enum(['chrome', 'edge', 'brave', 'chromium', 'vivaldi', 'arc']).nullable().optional(),
  tabId: z.string().nullable().optional(),
  tabUrl: z.string().nullable().optional(),
  tabTitle: z.string().nullable().optional(),
})

const ExtensionMainBridgeAttachSchema = z.object({
  pairingCode: z.string().min(1),
  browserId: z.string().nullable().optional(),
  browserName: z.string().nullable().optional(),
  browserKind: z.enum(['chrome', 'edge', 'brave', 'chromium', 'vivaldi', 'arc']).nullable().optional(),
  tabId: z.string().nullable().optional(),
  tabUrl: z.string().nullable().optional(),
  tabTitle: z.string().nullable().optional(),
  extensionVersion: z.string().nullable().optional(),
})

const ExtensionMainBridgePollSchema = z.object({
  profileId: z.string().min(1),
})

const ExtensionMainBridgeResultSchema = z.object({
  profileId: z.string().min(1),
  commandId: z.string().min(1),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().nullable().optional(),
})

const ExtensionMainBridgeSyncSchema = z.object({
  profileId: z.string().min(1),
  browserId: z.string().nullable().optional(),
  browserName: z.string().nullable().optional(),
  browserKind: z.enum(['chrome', 'edge', 'brave', 'chromium', 'vivaldi', 'arc']).nullable().optional(),
  tabId: z.string().nullable().optional(),
  tabUrl: z.string().nullable().optional(),
  tabTitle: z.string().nullable().optional(),
  extensionVersion: z.string().nullable().optional(),
})

function routeErrorStatus(err: unknown): 400 | 401 | 404 | 500 {
  if (err instanceof BrowserRelayTokenError) return 401
  const message = err instanceof Error ? err.message : String(err)
  if (message === 'Browser profile not found') return 404
  if (
    message.includes('extension-relay') ||
    message.includes('CDP URL') ||
    message.includes('loopback')
  ) {
    return 400
  }
  return 500
}

function extensionCorsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

export function createBrowserRoutes(browserManager: BrowserManager, _agentManager?: AgentManager) {
  const app = new Hono()
  void _agentManager

  app.get('/browser/discovery', (c) => {
    return c.json(detectInstalledBrowsers())
  })

  app.get('/browser/main-bridge/extension-package', (c) => {
    try {
      return c.json(getBrowserExtensionPackageInfo())
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, 500)
    }
  })

  app.get('/browser/main-bridge/extension-download', (c) => {
    try {
      const bundle = buildBrowserExtensionZip()
      c.header('Content-Type', 'application/zip')
      c.header('Content-Disposition', 'attachment; filename="youclaw-main-browser-chromium.zip"')
      return c.body(bundle)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, 500)
    }
  })

  app.get('/browser/profiles', (c) => {
    return c.json(browserManager.listProfiles())
  })

  app.post('/browser/profiles', async (c) => {
    const parsed = CreateProfileSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400)
    }

    const profile = browserManager.createProfile(parsed.data)
    return c.json(profile, 201)
  })

  app.patch('/browser/profiles/:id', async (c) => {
    const parsed = UpdateProfileSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400)
    }

    const profile = browserManager.updateProfile(c.req.param('id'), parsed.data)
    if (!profile) {
      return c.json({ error: 'not found' }, 404)
    }
    return c.json(profile)
  })

  app.delete('/browser/profiles/:id', async (c) => {
    const result = await browserManager.deleteProfile(c.req.param('id'))
    if (!result.deleted) {
      return c.json({ error: 'not found' }, 404)
    }
    return c.json({ ok: true, updatedAgents: result.updatedAgents })
  })

  app.post('/browser/profiles/:id/start', async (c) => {
    try {
      const runtime = await browserManager.startProfile(c.req.param('id'))
      return c.json({ ok: true, runtime })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, 500)
    }
  })

  app.post('/browser/profiles/:id/stop', async (c) => {
    try {
      const runtime = await browserManager.stopProfile(c.req.param('id'))
      return c.json({ ok: true, runtime })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, 500)
    }
  })

  app.post('/browser/profiles/:id/restart', async (c) => {
    try {
      const runtime = await browserManager.restartProfile(c.req.param('id'))
      return c.json({ ok: true, runtime })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, 500)
    }
  })

  app.get('/browser/profiles/:id/status', async (c) => {
    try {
      const runtime = await browserManager.getProfileStatus(c.req.param('id'))
      return c.json(runtime)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, 500)
    }
  })

  app.get('/browser/profiles/:id/tabs', async (c) => {
    try {
      const tabs = await browserManager.listTabs(c.req.param('id'))
      return c.json({ tabs })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, 500)
    }
  })

  app.get('/browser/profiles/:id/relay', (c) => {
    try {
      const relay = browserManager.getRelayState(c.req.param('id'))
      return c.json(relay)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, { status: routeErrorStatus(err) })
    }
  })

  app.get('/browser/profiles/:id/main-bridge', (c) => {
    try {
      const state = browserManager.getMainBridgeState(c.req.param('id'))
      return c.json(state)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, { status: routeErrorStatus(err) })
    }
  })

  app.post('/browser/profiles/:id/main-bridge/select', async (c) => {
    const parsed = MainBridgeSelectSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400)
    }

    try {
      const state = browserManager.selectMainBridgeBrowser(
        c.req.param('id'),
        parsed.data.browserId ?? null,
      )
      return c.json({ ok: true, state })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, { status: routeErrorStatus(err) })
    }
  })

  app.post('/browser/profiles/:id/main-bridge/pairing', async (c) => {
    try {
      const state = browserManager.createMainBridgePairing(c.req.param('id'))
      return c.json({ ok: true, state })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, { status: routeErrorStatus(err) })
    }
  })

  app.post('/browser/profiles/:id/main-bridge/connect', async (c) => {
    const parsed = MainBridgeConnectSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400)
    }

    try {
      const result = await browserManager.connectMainBridge(c.req.param('id'), parsed.data)
      return c.json({ ok: true, ...result })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, { status: routeErrorStatus(err) })
    }
  })

  app.post('/browser/profiles/:id/main-bridge/disconnect', async (c) => {
    try {
      const result = await browserManager.disconnectMainBridge(c.req.param('id'))
      return c.json({ ok: true, ...result })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, { status: routeErrorStatus(err) })
    }
  })

  app.options('/browser/main-bridge/extension-attach', () => {
    return new Response(null, { status: 204, headers: extensionCorsHeaders() })
  })

  app.post('/browser/main-bridge/extension-attach', async (c) => {
    const parsed = ExtensionMainBridgeAttachSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400, headers: extensionCorsHeaders() })
    }

    try {
      const state = browserManager.attachExtensionMainBridge(parsed.data)
      return c.json({ ok: true, state }, { headers: extensionCorsHeaders() })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, { status: routeErrorStatus(err), headers: extensionCorsHeaders() })
    }
  })

  app.options('/browser/main-bridge/extension-poll', () => {
    return new Response(null, { status: 204, headers: extensionCorsHeaders() })
  })

  app.post('/browser/main-bridge/extension-poll', async (c) => {
    const parsed = ExtensionMainBridgePollSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400, headers: extensionCorsHeaders() })
    }

    const command = pollExtensionBridgeCommand(parsed.data.profileId)
    return c.json({ command }, { headers: extensionCorsHeaders() })
  })

  app.options('/browser/main-bridge/extension-result', () => {
    return new Response(null, { status: 204, headers: extensionCorsHeaders() })
  })

  app.post('/browser/main-bridge/extension-result', async (c) => {
    const parsed = ExtensionMainBridgeResultSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400, headers: extensionCorsHeaders() })
    }

    resolveExtensionBridgeCommand(parsed.data)
    return c.json({ ok: true }, { headers: extensionCorsHeaders() })
  })

  app.options('/browser/main-bridge/extension-sync', () => {
    return new Response(null, { status: 204, headers: extensionCorsHeaders() })
  })

  app.post('/browser/main-bridge/extension-sync', async (c) => {
    const parsed = ExtensionMainBridgeSyncSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.issues }, { status: 400, headers: extensionCorsHeaders() })
    }

    try {
      const state = browserManager.syncExtensionMainBridge(parsed.data)
      return c.json({ ok: true, state }, { headers: extensionCorsHeaders() })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, { status: routeErrorStatus(err), headers: extensionCorsHeaders() })
    }
  })

  app.post('/browser/profiles/:id/relay/connect', async (c) => {
    const parsed = RelayConnectSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400)
    }

    try {
      const result = await browserManager.connectRelay(c.req.param('id'), parsed.data.token, parsed.data.cdpUrl)
      return c.json({ ok: true, ...result })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, { status: routeErrorStatus(err) })
    }
  })

  app.post('/browser/profiles/:id/relay/disconnect', async (c) => {
    try {
      const result = await browserManager.disconnectRelay(c.req.param('id'))
      return c.json({ ok: true, ...result })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, { status: routeErrorStatus(err) })
    }
  })

  app.post('/browser/profiles/:id/relay/rotate-token', async (c) => {
    try {
      const result = await browserManager.rotateRelayToken(c.req.param('id'))
      return c.json({ ok: true, ...result })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, { status: routeErrorStatus(err) })
    }
  })

  app.post('/browser/profiles/:id/manual-login', async (c) => {
    try {
      const runtime = await browserManager.startProfile(c.req.param('id'))
      return c.json({
        ok: true,
        runtime,
        message: 'Open the browser window and log in manually. Login state is stored in the profile.',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, 500)
    }
  })

  // Legacy compatibility routes
  app.get('/browser-profiles', (c) => {
    return c.json(browserManager.listProfiles())
  })

  app.post('/browser-profiles', async (c) => {
    const parsed = CreateProfileSchema.pick({ name: true }).safeParse(await c.req.json())
    if (!parsed.success) {
      return c.json({ error: 'name is required' }, 400)
    }

    const profile = browserManager.createProfile({ name: parsed.data.name, driver: 'managed' })
    return c.json(profile, 201)
  })

  app.delete('/browser-profiles/:id', async (c) => {
    const result = await browserManager.deleteProfile(c.req.param('id'))
    if (!result.deleted) {
      return c.json({ error: 'not found' }, 404)
    }
    return c.json({ ok: true })
  })

  app.post('/browser-profiles/:id/launch', async (c) => {
    try {
      const runtime = await browserManager.startProfile(c.req.param('id'))
      const profile = browserManager.getProfile(c.req.param('id'))
      return c.json({
        ok: true,
        profileDir: profile?.userDataDir,
        runtime,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, 500)
    }
  })

  return app
}
