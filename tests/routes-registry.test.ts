import { describe, expect, test } from 'bun:test'
import { loadEnv } from '../src/config/index.ts'
import { initLogger } from '../src/logger/index.ts'
import { createRegistryRoutes } from '../src/routes/registry.ts'

loadEnv()
initLogger()

describe('registry routes', () => {
  test('GET /registry/sources returns source metadata', async () => {
    const app = createRegistryRoutes({
      listSources: () => [
        {
          id: 'clawhub',
          label: 'ClawHub',
          description: 'Official registry',
          capabilities: {
            search: true,
            list: true,
            detail: true,
            download: true,
            update: true,
            auth: 'optional',
            cursorPagination: true,
            sorts: ['trending', 'updated'],
          },
        },
        {
          id: 'tencent',
          label: 'Tencent',
          description: 'Tencent registry',
          capabilities: {
            search: true,
            list: true,
            detail: true,
            download: true,
            update: true,
            auth: 'none',
            cursorPagination: true,
            sorts: ['trending'],
          },
        },
      ],
    } as any)

    const res = await app.request('/registry/sources')
    const body = await res.json() as Array<{ id: string; label: string }>

    expect(res.status).toBe(200)
    expect(body.map((item) => item.id)).toEqual(['clawhub', 'tencent'])
  })

  test('GET /registry/recommended returns recommended list', async () => {
    const app = createRegistryRoutes({
      getRecommended: () => [
        {
          slug: 'coding',
          displayName: 'Coding',
          summary: 'Code better',
          installed: true,
          installedSkillName: 'coding-helper',
          hasUpdate: false,
          tags: [],
          source: 'fallback',
        },
      ],
    } as any)

    const res = await app.request('/registry/recommended')
    const body = await res.json() as Array<{ slug: string; installedSkillName?: string }>

    expect(res.status).toBe(200)
    expect(body).toHaveLength(1)
    expect(body[0]?.slug).toBe('coding')
    expect(body[0]?.installedSkillName).toBe('coding-helper')
  })

  test('GET /registry/marketplace forwards source-aware query params', async () => {
    const app = createRegistryRoutes({
      listMarketplace: async ({ source, query, cursor, sort, limit }: any) => ({
        items: [],
        nextCursor: cursor ?? 'next-page',
        source,
        query,
        sort,
        limit,
      }),
    } as any)

    const res = await app.request('/registry/marketplace?source=tencent&q=code&cursor=abc&sort=downloads&limit=10')
    const body = await res.json() as { source: string; query: string; sort: string; nextCursor: string }

    expect(res.status).toBe(200)
    expect(body.source).toBe('tencent')
    expect(body.query).toBe('code')
    expect(body.sort).toBe('downloads')
    expect(body.nextCursor).toBe('abc')
  })

  test('GET /registry/marketplace defaults to clawhub when source is missing', async () => {
    let receivedSource = ''
    const app = createRegistryRoutes({
      listMarketplace: async ({ source }: any) => {
        receivedSource = source
        return { items: [], nextCursor: null, source, query: '', sort: 'trending' }
      },
    } as any)

    const res = await app.request('/registry/marketplace')

    expect(res.status).toBe(200)
    expect(receivedSource).toBe('clawhub')
  })

  test('GET /registry/marketplace rejects unknown sources', async () => {
    const app = createRegistryRoutes({
      listMarketplace: async () => ({ items: [], nextCursor: null, source: 'clawhub', query: '', sort: 'trending' }),
    } as any)

    const res = await app.request('/registry/marketplace?source=unknown')
    const body = await res.json() as { error: string }

    expect(res.status).toBe(400)
    expect(body.error).toBe('Unknown registry source')
  })

  test('GET /registry/marketplace/:slug returns detail', async () => {
    let receivedSource = ''
    const app = createRegistryRoutes({
      listMarketplace: async () => ({ items: [], nextCursor: null, source: 'clawhub', query: '', sort: 'trending' }),
      getMarketplaceSkill: async (_slug: string, source: string) => {
        receivedSource = source
        return {
          slug: 'coding',
          displayName: 'Coding',
          summary: 'Code better',
          installed: false,
          hasUpdate: false,
          latestVersion: '1.0.0',
          tags: ['coding'],
          source: 'clawhub',
          detailUrl: 'https://clawhub.ai/jerry/coding',
          ownerHandle: 'jerry',
        }
      },
    } as any)

    const res = await app.request('/registry/marketplace/coding?source=tencent')
    const body = await res.json() as { slug: string; ownerHandle: string; detailUrl: string }

    expect(res.status).toBe(200)
    expect(receivedSource).toBe('tencent')
    expect(body.slug).toBe('coding')
    expect(body.ownerHandle).toBe('jerry')
    expect(body.detailUrl).toBe('https://clawhub.ai/jerry/coding')
  })

  test('POST /registry/install returns 400 when slug is missing', async () => {
    const app = createRegistryRoutes({
      listMarketplace: async () => ({ items: [], nextCursor: null, source: 'clawhub', query: '', sort: 'trending' }),
      installSkill: async () => {},
      updateSkill: async () => {},
      uninstallSkill: async () => {},
    } as any)

    const res = await app.request('/registry/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(400)
  })

  test('POST /registry/install returns ok on success', async () => {
    let installedSlug = ''
    let installedSource = ''
    const app = createRegistryRoutes({
      listMarketplace: async () => ({ items: [], nextCursor: null, source: 'clawhub', query: '', sort: 'trending' }),
      installSkill: async (slug: string, source: string) => {
        installedSlug = slug
        installedSource = source
      },
      updateSkill: async () => {},
      uninstallSkill: async () => {},
    } as any)

    const res = await app.request('/registry/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'coding', source: 'tencent' }),
    })
    const body = await res.json() as { ok: boolean }

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(installedSlug).toBe('coding')
    expect(installedSource).toBe('tencent')
  })

  test('POST /registry/install maps upstream download failures to 502', async () => {
    const app = createRegistryRoutes({
      listMarketplace: async () => ({ items: [], nextCursor: null, source: 'clawhub', query: '', sort: 'trending' }),
      installSkill: async () => {
        throw new Error('Download failed: 503 Service Unavailable')
      },
      updateSkill: async () => {},
      uninstallSkill: async () => {},
    } as any)

    const res = await app.request('/registry/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'coding' }),
    })
    const body = await res.json() as { ok: boolean; error: string }

    expect(res.status).toBe(502)
    expect(body.ok).toBe(false)
    expect(body.error).toBe('Download failed: 503 Service Unavailable')
  })

  test('POST /registry/update returns ok on success', async () => {
    let updatedSlug = ''
    let updatedSource = ''
    const app = createRegistryRoutes({
      listMarketplace: async () => ({ items: [], nextCursor: null, source: 'clawhub', query: '', sort: 'trending' }),
      installSkill: async () => {},
      updateSkill: async (slug: string, source: string) => {
        updatedSlug = slug
        updatedSource = source
      },
      uninstallSkill: async () => {},
    } as any)

    const res = await app.request('/registry/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'coding' }),
    })
    const body = await res.json() as { ok: boolean }

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(updatedSlug).toBe('coding')
    expect(updatedSource).toBe('clawhub')
  })

  test('POST /registry/uninstall returns ok on success', async () => {
    let uninstalledSlug = ''
    let uninstalledSource = ''
    const app = createRegistryRoutes({
      listMarketplace: async () => ({ items: [], nextCursor: null, source: 'clawhub', query: '', sort: 'trending' }),
      installSkill: async () => {},
      updateSkill: async () => {},
      uninstallSkill: async (slug: string, source: string) => {
        uninstalledSlug = slug
        uninstalledSource = source
      },
    } as any)

    const res = await app.request('/registry/uninstall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'coding' }),
    })
    const body = await res.json() as { ok: boolean }

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(uninstalledSlug).toBe('coding')
    expect(uninstalledSource).toBe('clawhub')
  })

  test('GET /registry/search forwards the selected source', async () => {
    let receivedSource = ''
    const app = createRegistryRoutes({
      searchSkills: async (_query: string, source: string) => {
        receivedSource = source
        return []
      },
    } as any)

    const res = await app.request('/registry/search?q=browser&source=tencent')

    expect(res.status).toBe(200)
    expect(receivedSource).toBe('tencent')
  })
})
