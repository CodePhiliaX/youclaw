import { Hono } from 'hono'
import { z } from 'zod/v4'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type {
  MarketplaceLocale,
  MarketplaceOrder,
  MarketplaceSkillDetail,
  MarketplaceSort,
  RegistryManager,
  RegistrySelectableSource,
  TencentMarketplaceCategory,
} from '../skills/registry.ts'
import { getLogger } from '../logger/index.ts'

const registryMarketplaceDetailParamsSchema = z.object({
  slug: z.string().trim().min(1),
})

const registrySkillMutationBodySchema = z.object({
  slug: z.string().trim().min(1),
  source: z.string().optional(),
})

export interface RegistryMarketplaceDetailRequest {
  slug: string
  source?: string
  locale?: string
}

export interface RegistryMarketplaceListRequest {
  source?: string
  query?: string
  cursor?: string | null
  limit?: number
  sort?: string
  order?: string
  locale?: string
  category?: string
}

export type RegistryMarketplaceDetailResponse = MarketplaceSkillDetail

export interface RegistryMarketplaceErrorResponse {
  error: string
}

export type RegistrySkillMutationRequest = z.infer<typeof registrySkillMutationBodySchema>

export interface RegistrySkillMutationResponse {
  ok: boolean
  error?: string
}

function mapRegistryErrorStatus(message: string): ContentfulStatusCode {
  const normalized = message.toLowerCase()

  if (normalized.includes('missing slug')) return 400
  if (normalized.includes('unknown registry source')) return 400
  if (normalized.includes('recommended skills must be installed from a marketplace source')) return 400
  if (normalized.includes('not found')) return 404
  if (normalized.includes('is not installed')) return 404
  if (normalized.includes('already installed') || normalized.includes('already up to date')) return 409
  if (normalized.includes('was not installed from')) return 400
  if (
    normalized.includes('download failed') ||
    normalized.includes('marketplace request failed') ||
    normalized.includes('remote response') ||
    normalized.includes('github archive download failed') ||
    normalized.includes('tencent archive download failed')
  ) {
    return 502
  }

  return 500
}

function readSource(input: string | undefined | null): RegistrySelectableSource | null {
  if (input == null || input === '') {
    return 'clawhub'
  }
  if (input === 'clawhub' || input === 'recommended' || input === 'tencent') {
    return input
  }
  return null
}

function readSort(input: string | undefined | null, source: RegistrySelectableSource): MarketplaceSort | undefined {
  if (!input) {
    return undefined
  }

  const normalized = input.trim()
  switch (normalized) {
    case 'score':
    case 'newest':
    case 'updated':
    case 'downloads':
    case 'installs':
    case 'stars':
    case 'name':
      return normalized
    case 'trending':
      return source === 'tencent' ? 'score' : 'downloads'
    case 'installsCurrent':
    case 'installsAllTime':
      return 'installs'
    default:
      return undefined
  }
}

function readOrder(input: string | undefined | null): MarketplaceOrder | undefined {
  return input === 'asc' || input === 'desc' ? input : undefined
}

function readLocale(input: string | undefined | null): MarketplaceLocale {
  return input === 'en' ? 'en' : 'zh'
}

function readTencentCategory(input: string | undefined | null): TencentMarketplaceCategory | undefined {
  switch (input) {
    case 'ai-intelligence':
    case 'developer-tools':
    case 'productivity':
    case 'data-analysis':
    case 'content-creation':
    case 'security-compliance':
    case 'communication-collaboration':
      return input
    default:
      return undefined
  }
}

export function createRegistryRoutes(registryManager: RegistryManager) {
  const api = new Hono()

  api.get('/registry/sources', (c) => c.json(registryManager.listSources()))

  api.get('/registry/marketplace', async (c) => {
    const source = readSource(c.req.query('source'))
    if (!source) {
      return c.json({ error: 'Unknown registry source' }, 400)
    }
    const request: RegistryMarketplaceListRequest = {
      source: c.req.query('source') ?? undefined,
      query: c.req.query('q') ?? '',
      cursor: c.req.query('cursor') ?? null,
      limit: c.req.query('limit') ? Number.parseInt(c.req.query('limit') as string, 10) : undefined,
      sort: c.req.query('sort') ?? undefined,
      order: c.req.query('order') ?? undefined,
      locale: c.req.query('locale') ?? undefined,
      category: c.req.query('category') ?? undefined,
    }
    const query = request.query ?? ''
    const cursor = request.cursor ?? null
    const limit = request.limit
    const sort = readSort(request.sort, source)
    const order = readOrder(request.order)
    const locale = readLocale(request.locale)
    const category = source === 'tencent' || source === 'recommended'
      ? readTencentCategory(request.category)
      : undefined

    try {
      const result = await registryManager.listMarketplace({
        source,
        query,
        cursor,
        limit: Number.isFinite(limit) ? limit : undefined,
        sort,
        order,
        locale,
        category,
      })
      return c.json(result)
    } catch (error) {
      const logger = getLogger()
      const message = error instanceof Error ? error.message : String(error)
      logger.error({ source, query, cursor, sort, order, locale, category, error: message }, 'Failed to load marketplace skills')
      return c.json({ error: message }, mapRegistryErrorStatus(message))
    }
  })

  api.get('/registry/marketplace/:slug', async (c) => {
    const parsedParams = registryMarketplaceDetailParamsSchema.safeParse({ slug: c.req.param('slug') })
    if (!parsedParams.success) {
      return c.json<RegistryMarketplaceErrorResponse>({ error: 'Missing slug' }, 400)
    }

    const request: RegistryMarketplaceDetailRequest = {
      slug: parsedParams.data.slug,
      source: c.req.query('source') ?? undefined,
      locale: c.req.query('locale') ?? undefined,
    }

    const source = readSource(request.source)
    const locale = readLocale(request.locale)
    if (!source) {
      return c.json<RegistryMarketplaceErrorResponse>({ error: 'Unknown registry source' }, 400)
    }

    try {
      const skill = await registryManager.getMarketplaceSkill(request.slug, source, locale)
      return c.json<RegistryMarketplaceDetailResponse>(skill)
    } catch (error) {
      const logger = getLogger()
      const message = error instanceof Error ? error.message : String(error)
      logger.error({ slug: request.slug, source, locale, error: message }, 'Failed to load marketplace skill detail')
      return c.json<RegistryMarketplaceErrorResponse>({ error: message }, mapRegistryErrorStatus(message))
    }
  })

  api.get('/registry/recommended', (c) => {
    return c.json(registryManager.getRecommended())
  })

  // Search skills marketplace (with install status)
  api.get('/registry/search', async (c) => {
    const logger = getLogger()
    const source = readSource(c.req.query('source'))
    if (!source) {
      return c.json({ error: 'Unknown registry source' }, 400)
    }
    const q = c.req.query('q') || ''
    const locale = readLocale(c.req.query('locale'))

    try {
      const results = await registryManager.searchSkills(q, source, locale)
      return c.json(results)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error({ q, source, locale, error: message }, 'Failed to search skills')
      return c.json({ error: message }, mapRegistryErrorStatus(message))
    }
  })

  api.post('/registry/install', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = registrySkillMutationBodySchema.safeParse(body)
    if (!parsed.success) {
      return c.json<RegistrySkillMutationResponse>({ ok: false, error: 'Missing slug' }, 400)
    }

    const request: RegistrySkillMutationRequest = parsed.data
    const source = readSource(request.source)
    if (!source) {
      return c.json<RegistrySkillMutationResponse>({ ok: false, error: 'Unknown registry source' }, 400)
    }

    try {
      await registryManager.installSkill(request.slug, source)
      return c.json<RegistrySkillMutationResponse>({ ok: true })
    } catch (error) {
      const logger = getLogger()
      const message = error instanceof Error ? error.message : String(error)
      logger.error({ slug: request.slug, source, error: message }, 'Failed to install skill')
      return c.json<RegistrySkillMutationResponse>({ ok: false, error: message }, mapRegistryErrorStatus(message))
    }
  })

  api.post('/registry/update', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = registrySkillMutationBodySchema.safeParse(body)
    if (!parsed.success) {
      return c.json<RegistrySkillMutationResponse>({ ok: false, error: 'Missing slug' }, 400)
    }

    const request: RegistrySkillMutationRequest = parsed.data
    const source = readSource(request.source)
    if (!source) {
      return c.json<RegistrySkillMutationResponse>({ ok: false, error: 'Unknown registry source' }, 400)
    }

    try {
      await registryManager.updateSkill(request.slug, source)
      return c.json<RegistrySkillMutationResponse>({ ok: true })
    } catch (error) {
      const logger = getLogger()
      const message = error instanceof Error ? error.message : String(error)
      logger.error({ slug: request.slug, source, error: message }, 'Failed to update skill')
      return c.json<RegistrySkillMutationResponse>({ ok: false, error: message }, mapRegistryErrorStatus(message))
    }
  })

  api.post('/registry/uninstall', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = registrySkillMutationBodySchema.safeParse(body)
    if (!parsed.success) {
      return c.json<RegistrySkillMutationResponse>({ ok: false, error: 'Missing slug' }, 400)
    }

    const request: RegistrySkillMutationRequest = parsed.data
    const source = readSource(request.source)
    if (!source) {
      return c.json<RegistrySkillMutationResponse>({ ok: false, error: 'Unknown registry source' }, 400)
    }

    try {
      await registryManager.uninstallSkill(request.slug, source)
      return c.json<RegistrySkillMutationResponse>({ ok: true })
    } catch (error) {
      const logger = getLogger()
      const message = error instanceof Error ? error.message : String(error)
      logger.error({ slug: request.slug, source, error: message }, 'Failed to uninstall skill')
      return c.json<RegistrySkillMutationResponse>({ ok: false, error: message }, mapRegistryErrorStatus(message))
    }
  })

  return api
}
