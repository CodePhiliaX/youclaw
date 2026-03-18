import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { MarketplaceSort, RegistryManager } from '../skills/registry.ts'
import { getLogger } from '../logger/index.ts'

function mapRegistryErrorStatus(message: string): ContentfulStatusCode {
  const normalized = message.toLowerCase()

  if (normalized.includes('missing slug')) return 400
  if (normalized.includes('not found')) return 404
  if (normalized.includes('is not installed')) return 404
  if (normalized.includes('already installed') || normalized.includes('already up to date')) return 409
  if (normalized.includes('was not installed from clawhub')) return 400
  if (
    normalized.includes('download failed') ||
    normalized.includes('marketplace request failed') ||
    normalized.includes('remote response')
  ) {
    return 502
  }

  return 500
}

export function createRegistryRoutes(registryManager: RegistryManager) {
  const api = new Hono()

  api.get('/registry/marketplace', async (c) => {
    const query = c.req.query('q') ?? ''
    const cursor = c.req.query('cursor') ?? null
    const sort = c.req.query('sort') as MarketplaceSort | undefined
    const limitRaw = c.req.query('limit')
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined

    const result = await registryManager.listMarketplace({
      query,
      cursor,
      sort,
      limit: Number.isFinite(limit) ? limit : undefined,
    })
    return c.json(result)
  })

  api.get('/registry/marketplace/:slug', async (c) => {
    const slug = c.req.param('slug')
    if (!slug) {
      return c.json({ error: 'Missing slug' }, 400)
    }

    try {
      const skill = await registryManager.getMarketplaceSkill(slug)
      return c.json(skill)
    } catch (error) {
      const logger = getLogger()
      const message = error instanceof Error ? error.message : String(error)
      logger.error({ slug, error: message }, 'Failed to load marketplace skill detail')
      return c.json({ error: message }, mapRegistryErrorStatus(message))
    }
  })

  api.get('/registry/recommended', (c) => {
    return c.json(registryManager.getRecommended())
  })

  // Search skills marketplace (with install status)
  api.get('/registry/search', async (c) => {
    const logger = getLogger()
    const q = c.req.query('q') || ''

    try {
      const results = await registryManager.searchSkills(q)
      return c.json(results)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error({ q, error: message }, 'Failed to search skills')
      return c.json({ error: message }, mapRegistryErrorStatus(message))
    }
  })

  api.post('/registry/install', async (c) => {
    const body = await c.req.json<{ slug: string }>()
    const { slug } = body

    if (!slug) {
      return c.json({ error: 'Missing slug' }, 400)
    }

    try {
      await registryManager.installSkill(slug)
      return c.json({ ok: true })
    } catch (error) {
      const logger = getLogger()
      const message = error instanceof Error ? error.message : String(error)
      logger.error({ slug, error: message }, 'Failed to install skill')
      return c.json({ ok: false, error: message }, mapRegistryErrorStatus(message))
    }
  })

  api.post('/registry/update', async (c) => {
    const body = await c.req.json<{ slug: string }>()
    const { slug } = body

    if (!slug) {
      return c.json({ error: 'Missing slug' }, 400)
    }

    try {
      await registryManager.updateSkill(slug)
      return c.json({ ok: true })
    } catch (error) {
      const logger = getLogger()
      const message = error instanceof Error ? error.message : String(error)
      logger.error({ slug, error: message }, 'Failed to update skill')
      return c.json({ ok: false, error: message }, mapRegistryErrorStatus(message))
    }
  })

  api.post('/registry/uninstall', async (c) => {
    const body = await c.req.json<{ slug: string }>()
    const { slug } = body

    if (!slug) {
      return c.json({ error: 'Missing slug' }, 400)
    }

    try {
      await registryManager.uninstallSkill(slug)
      return c.json({ ok: true })
    } catch (error) {
      const logger = getLogger()
      const message = error instanceof Error ? error.message : String(error)
      logger.error({ slug, error: message }, 'Failed to uninstall skill')
      return c.json({ ok: false, error: message }, mapRegistryErrorStatus(message))
    }
  })

  return api
}
