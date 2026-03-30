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
          id: 'recommended',
          label: 'Recommended',
          description: 'Curated recommendations',
          capabilities: {
            search: true,
            list: true,
            detail: true,
            download: false,
            update: false,
            auth: 'none',
            cursorPagination: true,
            sortDirection: false,
            sorts: [],
          },
        },
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
            defaultSort: 'downloads',
            sortDirection: true,
            sorts: ['newest', 'updated', 'downloads', 'installs', 'stars', 'name'],
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
            defaultSort: 'score',
            sortDirection: true,
            sorts: ['score', 'downloads', 'stars', 'installs'],
          },
        },
      ],
    } as any)

    const res = await app.request('/registry/sources')
    const body = await res.json() as Array<{ id: string; label: string }>

    expect(res.status).toBe(200)
    expect(body.map((item) => item.id)).toEqual(['recommended', 'clawhub', 'tencent'])
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

  test('GET /registry/marketplace forwards source-aware query params including sort and order', async () => {
    let receivedLocale = ''
    let receivedCategory = ''
    const app = createRegistryRoutes({
      listMarketplace: async ({ source, query, cursor, sort, order, limit, locale, category }: any) => {
        receivedLocale = locale
        receivedCategory = category ?? ''
        return {
          items: [],
          nextCursor: cursor ?? 'next-page',
          query,
          sort,
          order,
          limit,
        }
      },
    } as any)

    const res = await app.request('/registry/marketplace?source=tencent&q=code&cursor=abc&sort=downloads&order=asc&limit=10&locale=en&category=communication-collaboration')
    const body = await res.json() as { query: string; sort: string; order: string; nextCursor: string }

    expect(res.status).toBe(200)
    expect(body.query).toBe('code')
    expect(body.sort).toBe('downloads')
    expect(body.order).toBe('asc')
    expect(body.nextCursor).toBe('abc')
    expect(receivedLocale).toBe('en')
    expect(receivedCategory).toBe('communication-collaboration')
  })

  test('GET /registry/marketplace defaults to clawhub when source is missing', async () => {
    let receivedSource = ''
    const app = createRegistryRoutes({
      listMarketplace: async ({ source }: any) => {
        receivedSource = source
        return { items: [], nextCursor: null, query: '', sort: 'downloads', order: 'desc' }
      },
    } as any)

    const res = await app.request('/registry/marketplace')

    expect(res.status).toBe(200)
    expect(receivedSource).toBe('clawhub')
  })

  test('GET /registry/marketplace rejects unknown sources', async () => {
    const app = createRegistryRoutes({
      listMarketplace: async () => ({ items: [], nextCursor: null, query: '', sort: 'downloads', order: 'desc' }),
    } as any)

    const res = await app.request('/registry/marketplace?source=unknown')
    const body = await res.json() as { error: string }

    expect(res.status).toBe(400)
    expect(body.error).toBe('Unknown registry source')
  })

  test('GET /registry/marketplace/:slug returns detail', async () => {
    let receivedSource = ''
    let receivedLocale = ''
    const app = createRegistryRoutes({
      listMarketplace: async () => ({ items: [], nextCursor: null, query: '', sort: 'downloads', order: 'desc' }),
      getMarketplaceSkill: async (_slug: string, source: string, locale: string) => {
        receivedSource = source
        receivedLocale = locale
        return {
          slug: 'coding',
          displayName: 'Coding',
          summary: 'Code better',
          installed: false,
          hasUpdate: false,
          latestVersion: '1.0.0',
          ownerName: 'jerry',
          url: 'https://clawhub.ai/jerry/coding',
          author: { handle: 'jerry' },
        }
      },
    } as any)

    const res = await app.request('/registry/marketplace/coding?source=tencent&locale=en')
    const body = await res.json() as { slug: string; url: string; author?: { handle?: string } }

    expect(res.status).toBe(200)
    expect(receivedSource).toBe('tencent')
    expect(receivedLocale).toBe('en')
    expect(body.slug).toBe('coding')
    expect(body.author?.handle).toBe('jerry')
    expect(body.url).toBe('https://clawhub.ai/jerry/coding')
  })

  test('POST /registry/install returns 400 when slug is missing', async () => {
    const app = createRegistryRoutes({
      listMarketplace: async () => ({ items: [], nextCursor: null, query: '', sort: 'downloads', order: 'desc' }),
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
      listMarketplace: async () => ({ items: [], nextCursor: null, query: '', sort: 'downloads', order: 'desc' }),
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
      listMarketplace: async () => ({ items: [], nextCursor: null, query: '', sort: 'downloads', order: 'desc' }),
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
      listMarketplace: async () => ({ items: [], nextCursor: null, query: '', sort: 'downloads', order: 'desc' }),
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
      listMarketplace: async () => ({ items: [], nextCursor: null, query: '', sort: 'downloads', order: 'desc' }),
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
    let receivedLocale = ''
    const app = createRegistryRoutes({
      searchSkills: async (_query: string, source: string, locale: string) => {
        receivedSource = source
        receivedLocale = locale
        return []
      },
    } as any)

    const res = await app.request('/registry/search?q=browser&source=tencent&locale=en')

    expect(res.status).toBe(200)
    expect(receivedSource).toBe('tencent')
    expect(receivedLocale).toBe('en')
  })
})
