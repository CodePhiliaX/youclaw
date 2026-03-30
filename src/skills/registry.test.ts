import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { loadEnv } from '../config/index.ts'
import { initLogger } from '../logger/index.ts'
import recommendedSkillsData, {
  recommendedCategoryOrder,
  recommendedShards,
} from './recommended/index.ts'
import { RegistryManager } from './registry.ts'
import type { SkillsLoader } from './loader.ts'
import type { Skill, SkillRegistryMeta } from './types.ts'

loadEnv()
initLogger()

const apiBaseUrl = 'https://clawhub.ai/api/v1'
const downloadUrl = `${apiBaseUrl}/download`
const convexQueryUrl = 'https://wry-manatee-359.convex.cloud/api/query'
const testUserSkillsDir = resolve('/tmp', `youclaw-registry-test-${process.pid}`)

function createMockLoader(skills: Partial<Skill>[] = []) {
  let refreshCount = 0
  const loader = {
    loadAllSkills: () => skills as Skill[],
    refresh: () => {
      refreshCount += 1
      return skills as Skill[]
    },
  } as unknown as SkillsLoader

  return {
    loader,
    getRefreshCount: () => refreshCount,
  }
}

function createClawhubMeta(slug: string, version?: string): SkillRegistryMeta {
  return {
    source: 'clawhub',
    slug,
    installedAt: '2024-01-01T00:00:00.000Z',
    displayName: slug,
    version,
  }
}

function createSkillZip(files: Record<string, string>) {
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([filePath, content]) => [filePath, strToU8(content)]),
    ),
  )
}

function getUserSkillDir(slug: string) {
  return resolve(testUserSkillsDir, slug)
}

function createRegistryManager(
  loader: SkillsLoader,
  fetchImpl: typeof fetch,
) {
  return new RegistryManager(loader, {
    userSkillsDir: testUserSkillsDir,
    tencentEnabled: true,
    fetchImpl,
    sleep: async () => {},
  })
}

describe('RegistryManager', () => {
  beforeEach(() => {
    rmSync(testUserSkillsDir, { recursive: true, force: true })
    mkdirSync(testUserSkillsDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testUserSkillsDir, { recursive: true, force: true })
  })

  describe('getRecommended', () => {
    test('returns recommended skills with normalized fields', () => {
      const { loader } = createMockLoader()
      const manager = createRegistryManager(loader, async () => new Response('nope', { status: 500 }))
      const list = manager.getRecommended()

      expect(list.length).toBeGreaterThanOrEqual(30)
      expect(list[0]).toMatchObject({
        slug: 'self-improving-agent',
        displayName: 'Self Improving Agent',
        summary: 'Capture failures and corrections to improve future task execution quality.',
        installed: false,
      })
    })

    test('bundled recommendations use unique slugs and supported categories', () => {
      const supportedCategories = new Set(recommendedCategoryOrder)
      const slugs = new Set<string>()

      for (const entry of recommendedSkillsData) {
        expect(entry.slug.length).toBeGreaterThan(0)
        expect(entry.displayName.length).toBeGreaterThan(0)
        expect(entry.summary.length).toBeGreaterThan(0)
        expect(Array.isArray(entry.tags)).toBe(true)
        expect(entry.tags.length).toBeGreaterThan(0)
        expect(supportedCategories.has(entry.category)).toBe(true)
        expect(slugs.has(entry.slug)).toBe(false)
        slugs.add(entry.slug)
      }
    })

    test('loads category shards in deterministic order', () => {
      const flattenedSlugs = recommendedCategoryOrder.flatMap((category) => (
        recommendedShards[category].map((entry) => {
          expect(entry.category).toBe(category)
          return entry.slug
        })
      ))

      expect(recommendedCategoryOrder).toEqual([
        'ai-intelligence',
        'developer-tools',
        'productivity',
        'data-analysis',
        'content-creation',
        'security-compliance',
        'communication-collaboration',
      ])
      expect(flattenedSlugs).toEqual(recommendedSkillsData.map((entry) => entry.slug))
      expect(flattenedSlugs[0]).toBe('self-improving-agent')
      expect(flattenedSlugs[flattenedSlugs.length - 1]).toBe('outlook-api')
    })

    test('omits installed skills from recommended results', () => {
      const skillDir = getUserSkillDir('find-skills')
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(resolve(skillDir, 'SKILL.md'), '---\nname: finder-local\ndescription: test\n---\n')
      writeFileSync(resolve(skillDir, '.registry.json'), JSON.stringify(createClawhubMeta('find-skills', '1.0.0')))

      const { loader } = createMockLoader()
      const manager = createRegistryManager(loader, async () => new Response('nope', { status: 500 }))
      const list = manager.getRecommended()

      expect(list.some((skill) => skill.slug === 'find-skills')).toBe(false)
    })

    test('recommended marketplace search matches recommendation tags', async () => {
      const { loader } = createMockLoader()
      const manager = createRegistryManager(loader, async () => new Response('boom', { status: 500 }))

      const result = await manager.listMarketplace({ source: 'recommended', query: 'discovery', limit: 50 })

      expect(result.items.some((skill) => skill.slug === 'find-skills')).toBe(true)
    })

    test('recommended marketplace search matches localized Chinese source summaries', async () => {
      const { loader } = createMockLoader()
      const manager = createRegistryManager(loader, async () => new Response('boom', { status: 500 }))

      const result = await manager.listMarketplace({
        source: 'recommended',
        query: '寻找可安装功能',
        locale: 'zh',
        limit: 50,
      })

      expect(result.items.some((skill) => skill.slug === 'find-skills')).toBe(true)
    })

    test('recommended marketplace search matches source English summaries', async () => {
      const { loader } = createMockLoader()
      const manager = createRegistryManager(loader, async () => new Response('boom', { status: 500 }))

      const result = await manager.listMarketplace({
        source: 'recommended',
        query: 'installable skill',
        locale: 'en',
        limit: 50,
      })

      expect(result.items.some((skill) => skill.slug === 'find-skills')).toBe(true)
    })

    test('recommended marketplace source supports Tencent category filters', async () => {
      const { loader } = createMockLoader()
      const manager = createRegistryManager(loader, async () => new Response('boom', { status: 500 }))

      const result = await manager.listMarketplace({
        source: 'recommended',
        query: '',
        category: 'ai-intelligence',
      })

      expect(result.items.length).toBeGreaterThan(0)
      expect(result.items.every((skill) => skill.category === 'ai-intelligence')).toBe(true)
      expect(result.items.some((skill) => skill.slug === 'ontology')).toBe(true)
      expect(result.items.some((skill) => skill.slug === 'weather')).toBe(false)
    })
  })

  describe('listMarketplace', () => {
    test('returns recommended items when the recommended source is selected', async () => {
      const { loader } = createMockLoader()
      const manager = createRegistryManager(loader, async () => {
        throw new Error('should not fetch remote marketplace for recommended source')
      })

      const result = await manager.listMarketplace({ source: 'recommended' })

      expect(result.query).toBe('')
      expect(result.nextCursor).toBe('recommended:24')
      expect(result.items.length).toBeGreaterThan(0)
    })

    test('exposes Tencent-style metadata for recommended items', async () => {
      const { loader } = createMockLoader()
      const manager = createRegistryManager(loader, async () => {
        throw new Error('should not fetch remote marketplace for recommended source')
      })

      const result = await manager.listMarketplace({
        source: 'recommended',
        query: 'find-skills',
        locale: 'en',
      })

      expect(result.items).toHaveLength(1)
      expect(result.items[0]).toMatchObject({
        slug: 'find-skills',
        latestVersion: '0.1.0',
        downloads: 227861,
        stars: 907,
        installs: 8075,
        ownerName: 'jimliuxinghai',
        url: 'https://clawhub.ai/jimliuxinghai/find-skills',
      })
    })

    test('supports Tencent-style sorting for recommended items', async () => {
      const { loader } = createMockLoader()
      const manager = createRegistryManager(loader, async () => {
        throw new Error('should not fetch remote marketplace for recommended source')
      })

      const result = await manager.listMarketplace({
        source: 'recommended',
        category: 'data-analysis',
        sort: 'stars',
        order: 'desc',
        limit: 5,
      })

      expect(result.items[0]).toMatchObject({
        slug: 'find-skills',
        stars: 907,
      })
    })

    test('uses Chinese recommendation descriptions for zh locale', async () => {
      const { loader } = createMockLoader()
      const manager = createRegistryManager(loader, async () => {
        throw new Error('should not fetch remote marketplace for recommended source')
      })

      const result = await manager.listMarketplace({
        source: 'recommended',
        query: 'find-skills',
        locale: 'zh',
      })

      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.summary).toContain('帮助发现并安装智能体技能')
    })

    test('omits installed skills from recommended marketplace results', async () => {
      const skillDir = getUserSkillDir('find-skills')
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(resolve(skillDir, 'SKILL.md'), '---\nname: finder-local\ndescription: test\n---\n')
      writeFileSync(resolve(skillDir, '.registry.json'), JSON.stringify(createClawhubMeta('find-skills', '1.0.0')))

      const { loader } = createMockLoader()
      const manager = createRegistryManager(loader, async () => {
        throw new Error('should not fetch remote marketplace for recommended source')
      })

      const result = await manager.listMarketplace({
        source: 'recommended',
        query: 'find-skills',
        locale: 'en',
      })

      expect(result.items).toHaveLength(0)
    })

    test('skips installed ClawHub skills and continues to the next remote page', async () => {
      const skillDir = getUserSkillDir('coding')
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(resolve(skillDir, 'SKILL.md'), '---\nname: coding-helper\ndescription: test\n---\n')
      writeFileSync(resolve(skillDir, '.registry.json'), JSON.stringify(createClawhubMeta('coding', '1.0.0')))

      const { loader } = createMockLoader()
      const requests: Array<{ url: string; init?: RequestInit }> = []
      const manager = createRegistryManager(loader, async (url, init) => {
        requests.push({ url: String(url), init })
        if (String(url) === convexQueryUrl && init?.method === 'POST') {
          const body = JSON.parse(String(init.body))
          const cursor = body.args?.[0]?.cursor

          if (!cursor) {
            return Response.json({
              status: 'success',
              value: {
                hasMore: true,
                nextCursor: 'next-page',
                page: [
                  {
                    latestVersion: { version: '1.2.0' },
                    owner: { handle: 'jerry', displayName: 'Jerry' },
                    ownerHandle: 'jerry',
                    skill: {
                      slug: 'coding',
                      displayName: 'Coding',
                      summary: 'Ship code',
                      tags: { latest: '1.2.0', coding: '1.2.0' },
                      stats: { downloads: 8, stars: 5, installsCurrent: 2, installsAllTime: 7 },
                      updatedAt: 20,
                    },
                  },
                ],
              },
            })
          }

          if (cursor === 'next-page') {
            return Response.json({
              status: 'success',
              value: {
                hasMore: false,
                nextCursor: null,
                page: [
                  {
                    latestVersion: { version: '3.0.0' },
                    owner: { handle: 'zoe', displayName: 'Zoe' },
                    ownerHandle: 'zoe',
                    skill: {
                      slug: 'browser',
                      displayName: 'Browser',
                      summary: 'Browse the web',
                      tags: { latest: '3.0.0', browser: '3.0.0' },
                      stats: { downloads: 11, stars: 6, installsCurrent: 4, installsAllTime: 9 },
                      updatedAt: 30,
                    },
                  },
                ],
              },
            })
          }
        }
        return new Response('not found', { status: 404 })
      })

      const result = await manager.listMarketplace()

      expect(requests).toHaveLength(2)
      expect(requests[0]?.url).toBe(convexQueryUrl)
      expect(requests[0]?.init?.method).toBe('POST')
      expect(requests[0]?.init?.headers).toEqual({ 'Content-Type': 'application/json' })
      expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
        path: 'skills:listPublicPageV4',
        format: 'convex_encoded_json',
        args: [
          {
            dir: 'desc',
            highlightedOnly: false,
            nonSuspiciousOnly: true,
            numItems: 24,
            sort: 'downloads',
          },
        ],
      })
      expect(result.nextCursor).toBeNull()
      expect(result.items[0]).toMatchObject({
        slug: 'browser',
        displayName: 'Browser',
        latestVersion: '3.0.0',
        installs: 4,
        ownerName: 'Zoe',
        url: 'https://clawhub.ai/zoe/browser',
        installed: false,
      })
    })

    test('throws when the Convex list payload is not successful', async () => {
      const { loader } = createMockLoader()
      const manager = createRegistryManager(loader, async (url, init) => {
        if (String(url) === convexQueryUrl && init?.method === 'POST') {
          return Response.json({
            status: 'error',
            value: null,
          })
        }
        return new Response('not found', { status: 404 })
      })

      await expect(manager.listMarketplace()).rejects.toThrow('Convex list returned status error')
    })

    test('throws when the Convex list payload is missing page data', async () => {
      const { loader } = createMockLoader()
      const manager = createRegistryManager(loader, async (url, init) => {
        if (String(url) === convexQueryUrl && init?.method === 'POST') {
          return Response.json({
            status: 'success',
            value: {
              hasMore: true,
              nextCursor: 'next-page',
            },
          })
        }
        return new Response('not found', { status: 404 })
      })

      await expect(manager.listMarketplace()).rejects.toThrow('Convex list response is missing page data')
    })

    test('skips installed Tencent skills and continues to the next remote page', async () => {
      const skillDir = getUserSkillDir('find-skills')
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(resolve(skillDir, 'SKILL.md'), '---\nname: finder-local\ndescription: test\n---\n')
      writeFileSync(resolve(skillDir, '.registry.json'), JSON.stringify({
        ...createClawhubMeta('find-skills', '1.0.0'),
        source: 'tencent',
      }))

      const { loader } = createMockLoader()
      const manager = new RegistryManager(loader, {
        userSkillsDir: testUserSkillsDir,
        tencentEnabled: true,
        tencentSearchUrl: 'https://tencent.test/skills',
        fetchImpl: async (url) => {
          if (String(url) === 'https://tencent.test/skills?page=1&pageSize=24&sortBy=score&order=desc') {
            return Response.json({
              code: 0,
              data: {
                skills: [
                  {
                    slug: 'find-skills',
                    name: 'Find Skills',
                    description_zh: '帮助用户发现并安装合适的技能。',
                    version: '1.0.0',
                    score: 100,
                  },
                ],
                total: 30,
              },
              message: 'success',
            })
          }
          if (String(url) === 'https://tencent.test/skills?page=2&pageSize=24&sortBy=score&order=desc') {
            return Response.json({
              code: 0,
              data: {
                skills: [
                  {
                    slug: 'browser',
                    name: 'Browser',
                    description: 'Browse the web.',
                    description_zh: '使用无头浏览器访问网页。',
                    version: '1.0.0',
                    installs: 12,
                    category: 'developer-tools',
                  },
                ],
                total: 30,
              },
              message: 'success',
            })
          }
          return new Response('not found', { status: 404 })
        },
        sleep: async () => {},
      })

      const result = await manager.listMarketplace({ source: 'tencent', query: '   ', locale: 'zh' })

      expect(result.query).toBe('')
      expect(result.nextCursor).toBeNull()
      expect(result.items[0]?.slug).toBe('browser')
      expect(result.items[0]?.summary).toBe('使用无头浏览器访问网页。')
      expect(result.items[0]?.category).toBe('developer-tools')
    })

    test('preserves ClawHub overflow items when backfilling marketplace pages', async () => {
      const skillDir = getUserSkillDir('installed-helper')
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(resolve(skillDir, 'SKILL.md'), '---\nname: installed-local\ndescription: test\n---\n')
      writeFileSync(resolve(skillDir, '.registry.json'), JSON.stringify(createClawhubMeta('installed-helper', '1.0.0')))

      const { loader } = createMockLoader()
      const cursors: Array<string | null> = []
      const manager = createRegistryManager(loader, async (url, init) => {
        if (String(url) === convexQueryUrl && init?.method === 'POST') {
          const body = JSON.parse(String(init.body))
          const cursor = body.args?.[0]?.cursor ?? null
          cursors.push(cursor)

          if (!cursor) {
            return Response.json({
              status: 'success',
              value: {
                hasMore: true,
                nextCursor: 'page-2',
                page: [
                  {
                    latestVersion: { version: '1.0.0' },
                    skill: {
                      slug: 'installed-helper',
                      displayName: 'Installed Helper',
                      summary: 'Already installed',
                      tags: { latest: '1.0.0' },
                      stats: { downloads: 1, stars: 1, installsCurrent: 1, installsAllTime: 1 },
                      updatedAt: 10,
                    },
                  },
                  {
                    latestVersion: { version: '1.1.0' },
                    owner: { handle: 'alice', displayName: 'Alice' },
                    skill: {
                      slug: 'assistant-a',
                      displayName: 'Assistant A',
                      summary: 'Page one visible item',
                      tags: { latest: '1.1.0' },
                      stats: { downloads: 2, stars: 1, installsCurrent: 1, installsAllTime: 2 },
                      updatedAt: 11,
                    },
                  },
                ],
              },
            })
          }

          if (cursor === 'page-2') {
            return Response.json({
              status: 'success',
              value: {
                hasMore: false,
                nextCursor: null,
                page: [
                  {
                    latestVersion: { version: '2.0.0' },
                    owner: { handle: 'bob', displayName: 'Bob' },
                    skill: {
                      slug: 'assistant-b',
                      displayName: 'Assistant B',
                      summary: 'First overflow item',
                      tags: { latest: '2.0.0' },
                      stats: { downloads: 3, stars: 2, installsCurrent: 2, installsAllTime: 3 },
                      updatedAt: 12,
                    },
                  },
                  {
                    latestVersion: { version: '3.0.0' },
                    owner: { handle: 'cory', displayName: 'Cory' },
                    skill: {
                      slug: 'assistant-c',
                      displayName: 'Assistant C',
                      summary: 'Second overflow item',
                      tags: { latest: '3.0.0' },
                      stats: { downloads: 4, stars: 3, installsCurrent: 3, installsAllTime: 4 },
                      updatedAt: 13,
                    },
                  },
                ],
              },
            })
          }
        }
        return new Response('not found', { status: 404 })
      })

      const first = await manager.listMarketplace({ source: 'clawhub', limit: 2 })
      const second = await manager.listMarketplace({ source: 'clawhub', limit: 2, cursor: first.nextCursor })

      expect(first.items.map((item) => item.slug)).toEqual(['assistant-a', 'assistant-b'])
      expect(first.nextCursor).not.toBeNull()
      expect(second.items.map((item) => item.slug)).toEqual(['assistant-c'])
      expect(second.nextCursor).toBeNull()
      expect(cursors).toEqual([null, 'page-2', 'page-2'])
    })

    test('preserves Tencent overflow items when backfilling marketplace pages', async () => {
      const skillDir = getUserSkillDir('installed-helper')
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(resolve(skillDir, 'SKILL.md'), '---\nname: installed-local\ndescription: test\n---\n')
      writeFileSync(resolve(skillDir, '.registry.json'), JSON.stringify({
        ...createClawhubMeta('installed-helper', '1.0.0'),
        source: 'tencent',
      }))

      const { loader } = createMockLoader()
      const requests: string[] = []
      const manager = new RegistryManager(loader, {
        userSkillsDir: testUserSkillsDir,
        tencentEnabled: true,
        tencentSearchUrl: 'https://tencent.test/skills',
        fetchImpl: async (url) => {
          requests.push(String(url))
          if (String(url) === 'https://tencent.test/skills?page=1&pageSize=2&sortBy=score&order=desc') {
            return Response.json({
              code: 0,
              data: {
                skills: [
                  {
                    slug: 'installed-helper',
                    name: 'Installed Helper',
                    description_zh: '已经安装的技能。',
                    version: '1.0.0',
                  },
                  {
                    slug: 'assistant-a',
                    name: 'Assistant A',
                    description_zh: '第一页可见技能。',
                    version: '1.1.0',
                  },
                ],
                total: 4,
              },
            })
          }
          if (String(url) === 'https://tencent.test/skills?page=2&pageSize=2&sortBy=score&order=desc') {
            return Response.json({
              code: 0,
              data: {
                skills: [
                  {
                    slug: 'assistant-b',
                    name: 'Assistant B',
                    description_zh: '第二页第一个可见技能。',
                    version: '2.0.0',
                  },
                  {
                    slug: 'assistant-c',
                    name: 'Assistant C',
                    description_zh: '第二页剩余技能。',
                    version: '3.0.0',
                  },
                ],
                total: 4,
              },
            })
          }
          return new Response('not found', { status: 404 })
        },
        sleep: async () => {},
      })

      const first = await manager.listMarketplace({ source: 'tencent', limit: 2, locale: 'zh' })
      const second = await manager.listMarketplace({ source: 'tencent', limit: 2, locale: 'zh', cursor: first.nextCursor })

      expect(first.items.map((item) => item.slug)).toEqual(['assistant-a', 'assistant-b'])
      expect(first.nextCursor).not.toBeNull()
      expect(second.items.map((item) => item.slug)).toEqual(['assistant-c'])
      expect(second.nextCursor).toBeNull()
      expect(requests).toEqual([
        'https://tencent.test/skills?page=1&pageSize=2&sortBy=score&order=desc',
        'https://tencent.test/skills?page=2&pageSize=2&sortBy=score&order=desc',
        'https://tencent.test/skills?page=2&pageSize=2&sortBy=score&order=desc',
      ])
    })

    test('falls back to Tencent score sorting when name sorting is requested', async () => {
      const { loader } = createMockLoader()
      let requestUrl = ''
      const manager = new RegistryManager(loader, {
        userSkillsDir: testUserSkillsDir,
        tencentEnabled: true,
        tencentSearchUrl: 'https://tencent.test/skills',
        fetchImpl: async (url) => {
          requestUrl = String(url)
          return Response.json({
            code: 0,
            data: {
              skills: [],
              total: 0,
            },
          })
        },
        sleep: async () => {},
      })

      await manager.listMarketplace({ source: 'tencent', sort: 'name' })

      expect(requestUrl).toBe('https://tencent.test/skills?page=1&pageSize=24&sortBy=score&order=desc')
    })

    test('remote search omits installed skills from ClawHub results', async () => {
      const skillDir = getUserSkillDir('coding')
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(resolve(skillDir, 'SKILL.md'), '---\nname: coding-helper\ndescription: test\n---\n')
      writeFileSync(resolve(skillDir, '.registry.json'), JSON.stringify(createClawhubMeta('coding', '1.0.0')))

      const { loader } = createMockLoader()
      const manager = createRegistryManager(loader, async (url) => {
        if (String(url) === `${apiBaseUrl}/search?q=coding&limit=50&nonSuspiciousOnly=true`) {
          return Response.json({
            results: [
              {
                slug: 'coding',
                displayName: 'Coding',
                summary: 'Ship code',
                score: 0.98,
                updatedAt: 2,
                version: '1.2.0',
              },
              {
                slug: 'browser',
                displayName: 'Browser',
                summary: 'Browse the web',
                score: 0.77,
                updatedAt: 3,
                version: '1.0.0',
              },
            ],
          })
        }
        return new Response('not found', { status: 404 })
      })

      const result = await manager.listMarketplace({ query: 'coding' })

      expect(result.query).toBe('coding')
      expect(result.items).toHaveLength(1)
      expect(result.items[0]).toMatchObject({
        slug: 'browser',
        displayName: 'Browser',
        latestVersion: '1.0.0',
        installed: false,
      })
    })

    test('throws when remote loading fails for non-empty queries', async () => {
      const { loader } = createMockLoader()
      const manager = createRegistryManager(loader, async () => new Response('boom', { status: 500 }))

      await expect(manager.listMarketplace({ query: 'coding', limit: 2 })).rejects.toThrow('500')
    })

    test('loads Tencent search results when the Tencent source is selected', async () => {
      const { loader } = createMockLoader()
      const manager = new RegistryManager(loader, {
        userSkillsDir: testUserSkillsDir,
        tencentEnabled: true,
        tencentSearchUrl: 'https://tencent.test/skills',
        fetchImpl: async (url) => {
          if (String(url) === 'https://tencent.test/skills?page=1&pageSize=24&sortBy=score&order=desc&keyword=browser') {
            return Response.json({
              code: 0,
              data: {
                skills: [
                  {
                    slug: 'browser',
                    name: 'Browser',
                    description: 'Browse the web.',
                    description_zh: '使用无头浏览器访问网页。',
                    version: '1.0.0',
                    installs: 12,
                    category: 'developer-tools',
                  },
                ],
                total: 1,
              },
            })
          }
          return new Response('not found', { status: 404 })
        },
        sleep: async () => {},
      })

      const result = await manager.listMarketplace({ source: 'tencent', query: 'browser', locale: 'zh' })

      expect(result.items[0]).toMatchObject({
        slug: 'browser',
        displayName: 'Browser',
        summary: '使用无头浏览器访问网页。',
        latestVersion: '1.0.0',
        installs: 12,
        category: 'developer-tools',
        url: null,
      })
    })

    test('returns the English Tencent summary when locale is en', async () => {
      const { loader } = createMockLoader()
      const manager = new RegistryManager(loader, {
        userSkillsDir: testUserSkillsDir,
        tencentEnabled: true,
        tencentSearchUrl: 'https://tencent.test/skills',
        fetchImpl: async (url) => {
          if (String(url) === 'https://tencent.test/skills?page=1&pageSize=24&sortBy=score&order=desc&keyword=mysql') {
            return Response.json({
              code: 0,
              data: {
                skills: [
                  {
                    slug: 'mysql',
                    name: 'MySQL',
                    description: 'Write correct MySQL queries.',
                    description_zh: '编写正确的 MySQL 查询。',
                    version: '1.0.0',
                  },
                ],
                total: 1,
              },
            })
          }
          return new Response('not found', { status: 404 })
        },
        sleep: async () => {},
      })

      const result = await manager.listMarketplace({ source: 'tencent', query: 'mysql', locale: 'en' })

      expect(result.items[0]?.summary).toBe('Write correct MySQL queries.')
    })

    test('keeps the original Tencent summary when no Chinese text is available', async () => {
      const { loader } = createMockLoader()
      const manager = new RegistryManager(loader, {
        userSkillsDir: testUserSkillsDir,
        tencentEnabled: true,
        tencentSearchUrl: 'https://tencent.test/skills',
        fetchImpl: async (url) => {
          if (String(url) === 'https://tencent.test/skills?page=1&pageSize=24&sortBy=score&order=desc&keyword=mysql') {
            return Response.json({
              code: 0,
              data: {
                skills: [
                  {
                    slug: 'mysql',
                    name: 'MySQL',
                    description: 'Write correct MySQL queries.',
                    version: '1.0.0',
                  },
                ],
                total: 1,
              },
            })
          }
          return new Response('not found', { status: 404 })
        },
        sleep: async () => {},
      })

      const result = await manager.listMarketplace({ source: 'tencent', query: 'mysql', locale: 'zh' })

      expect(result.items[0]?.summary).toBe('Write correct MySQL queries.')
    })

    test('encodes multi-word Tencent search queries as keyword params', async () => {
      const { loader } = createMockLoader()
      const manager = new RegistryManager(loader, {
        userSkillsDir: testUserSkillsDir,
        tencentEnabled: true,
        tencentSearchUrl: 'https://tencent.test/skills',
        fetchImpl: async (url) => {
          if (String(url) === 'https://tencent.test/skills?page=1&pageSize=24&sortBy=score&order=desc&keyword=find+skill') {
            return Response.json({
              code: 0,
              data: { skills: [], total: 0 },
            })
          }
          return new Response('not found', { status: 404 })
        },
        sleep: async () => {},
      })

      const result = await manager.listMarketplace({ source: 'tencent', query: 'find skill' })
      expect(result.items).toHaveLength(0)
    })

    test('forwards Tencent category filters to the remote search API', async () => {
      const { loader } = createMockLoader()
      let requestUrl = ''
      const manager = new RegistryManager(loader, {
        userSkillsDir: testUserSkillsDir,
        tencentEnabled: true,
        tencentSearchUrl: 'https://tencent.test/skills',
        fetchImpl: async (url) => {
          requestUrl = String(url)
          return Response.json({
            code: 0,
            data: { skills: [], total: 0 },
          })
        },
        sleep: async () => {},
      })

      await manager.listMarketplace({
        source: 'tencent',
        category: 'communication-collaboration',
        locale: 'zh',
      })

      expect(requestUrl).toBe('https://tencent.test/skills?page=1&pageSize=24&sortBy=score&order=desc&category=communication-collaboration')
    })
  })

  describe('getMarketplaceSkill', () => {
    test('reads recommended skill detail from the recommended source', async () => {
      const { loader } = createMockLoader()
      const manager = createRegistryManager(loader, async () => new Response('not used', { status: 500 }))

      const detail = await manager.getMarketplaceSkill('find-skills', 'recommended', 'en')

      expect(detail).toMatchObject({
        slug: 'find-skills',
        displayName: 'Find Skills',
        summary: 'Discover and install suitable skills for user goals and workflows.',
        latestVersion: '0.1.0',
        ownerName: 'jimliuxinghai',
        url: 'https://clawhub.ai/jimliuxinghai/find-skills',
      })
    })

    test('reads localized recommended skill detail when locale is zh', async () => {
      const { loader } = createMockLoader()
      const manager = createRegistryManager(loader, async () => new Response('not used', { status: 500 }))

      const detail = await manager.getMarketplaceSkill('find-skills', 'recommended', 'zh')

      expect(detail).toMatchObject({
        slug: 'find-skills',
        displayName: 'Find Skills',
      })
      expect(detail.summary).toContain('帮助发现并安装智能体技能')
    })

    test('includes the installed local skill name in marketplace detail', async () => {
      const skillDir = getUserSkillDir('coding')
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(resolve(skillDir, 'SKILL.md'), '---\nname: coding-helper\ndescription: test\n---\n')
      writeFileSync(resolve(skillDir, '.registry.json'), JSON.stringify(createClawhubMeta('coding', '1.0.0')))

      const { loader } = createMockLoader()
      const manager = createRegistryManager(loader, async (url) => {
        if (String(url) === `${apiBaseUrl}/skills/coding`) {
          return Response.json({
            skill: {
              slug: 'coding',
              displayName: 'Coding',
              summary: 'Ship code',
              tags: { latest: '2.0.0', coding: '2.0.0' },
              stats: { downloads: 8, stars: 5, installsCurrent: 2, installsAllTime: 7 },
              createdAt: 10,
              updatedAt: 20,
            },
            latestVersion: { version: '2.0.0' },
          })
        }
        return new Response('not found', { status: 404 })
      })

      const detail = await manager.getMarketplaceSkill('coding')

      expect(detail.installed).toBe(true)
      expect(detail.installedSkillName).toBe('coding-helper')
      expect(detail.installedVersion).toBe('1.0.0')
    })

    test('reads remote skill detail', async () => {
      const { loader } = createMockLoader()
      const manager = createRegistryManager(loader, async (url) => {
        if (String(url) === `${apiBaseUrl}/skills/coding`) {
          return Response.json({
            skill: {
              slug: 'coding',
              displayName: 'Coding',
              summary: 'Ship code',
              tags: { latest: '2.0.0', coding: '2.0.0' },
              stats: { downloads: 8, stars: 5, installsCurrent: 2, installsAllTime: 7 },
              createdAt: 10,
              updatedAt: 20,
            },
            latestVersion: { version: '2.0.0' },
            metadata: { os: ['linux'], systems: ['x86_64-linux'] },
            owner: { handle: 'jerry', displayName: 'Jerry' },
            moderation: { verdict: 'clean', isSuspicious: false, isMalwareBlocked: false },
          })
        }
        return new Response('not found', { status: 404 })
      })

      const detail = await manager.getMarketplaceSkill('coding')

      expect(detail).toMatchObject({
        slug: 'coding',
        displayName: 'Coding',
        latestVersion: '2.0.0',
        url: 'https://clawhub.ai/jerry/coding',
        ownerName: 'Jerry',
        author: {
          handle: 'jerry',
          name: 'Jerry',
        },
      })
      expect(detail.moderation).toEqual({
        verdict: 'clean',
        isSuspicious: false,
        isMalwareBlocked: false,
        summary: null,
      })
    })

    test('exposes Tencent homepage links in skill detail', async () => {
      const { loader } = createMockLoader()
      const manager = new RegistryManager(loader, {
        userSkillsDir: testUserSkillsDir,
        tencentEnabled: true,
        tencentSearchUrl: 'https://tencent.test/skills',
        fetchImpl: async (url) => {
          if (String(url) === 'https://tencent.test/skills?page=1&pageSize=50&sortBy=score&order=desc&keyword=find-skills') {
            return Response.json({
              code: 0,
              data: {
                skills: [
                  {
                    slug: 'find-skills',
                    name: 'Find Skills',
                    description_zh: '帮助用户发现并安装合适的技能。',
                    version: '1.0.0',
                    homepage: 'https://clawhub.ai/find-skills',
                    category: '其他',
                  },
                ],
                total: 1,
              },
            })
          }
          return new Response('not found', { status: 404 })
        },
        sleep: async () => {},
      })

      const detail = await manager.getMarketplaceSkill('find-skills', 'tencent', 'zh')

      expect(detail.summary).toBe('帮助用户发现并安装合适的技能。')
      expect(detail.url).toBe('https://clawhub.ai/find-skills')
      expect(detail.category).toBe('other')
    })

    test('exposes Tencent-hosted homepage links for Tencent skills', async () => {
      const { loader } = createMockLoader()
      const manager = new RegistryManager(loader, {
        userSkillsDir: testUserSkillsDir,
        tencentEnabled: true,
        tencentSearchUrl: 'https://tencent.test/skills',
        fetchImpl: async (url) => {
          if (String(url) === 'https://tencent.test/skills?page=1&pageSize=50&sortBy=score&order=desc&keyword=browser') {
            return Response.json({
              code: 0,
              data: {
                skills: [
                  {
                    slug: 'browser',
                    name: 'Browser',
                    description: 'Browse the web',
                    version: '1.0.0',
                    homepage: 'https://lightmake.site/skills/browser',
                    category: 'browser',
                  },
                ],
                total: 1,
              },
            })
          }
          return new Response('not found', { status: 404 })
        },
        sleep: async () => {},
      })

      const detail = await manager.getMarketplaceSkill('browser', 'tencent', 'en')

      expect(detail.url).toBe('https://lightmake.site/skills/browser')
      expect(detail.category).toBe('developer-tools')
    })

    test('reuses Tencent list results for subsequent detail lookups', async () => {
      const { loader } = createMockLoader()
      let requests = 0
      const manager = new RegistryManager(loader, {
        userSkillsDir: testUserSkillsDir,
        tencentEnabled: true,
        tencentSearchUrl: 'https://tencent.test/skills',
        fetchImpl: async (url) => {
          requests += 1
          if (String(url) === 'https://tencent.test/skills?page=1&pageSize=24&sortBy=score&order=desc&keyword=browser') {
            return Response.json({
              code: 0,
              data: {
                skills: [
                  {
                    slug: 'browser',
                    name: 'Browser',
                    description: 'Browse the web',
                    description_zh: '使用无头浏览器访问网页。',
                    version: '1.0.0',
                    homepage: 'https://lightmake.site/skills/browser',
                    category: 'browser',
                  },
                ],
                total: 1,
              },
            })
          }
          return new Response('not found', { status: 404 })
        },
        sleep: async () => {},
      })

      await manager.listMarketplace({ source: 'tencent', query: 'browser', locale: 'zh' })
      const detail = await manager.getMarketplaceSkill('browser', 'tencent', 'en')

      expect(requests).toBe(1)
      expect(detail).toMatchObject({
        slug: 'browser',
        displayName: 'Browser',
        summary: 'Browse the web',
        latestVersion: '1.0.0',
        url: 'https://lightmake.site/skills/browser',
      })
    })

    test('matches Tencent detail by exact slug from /api/skills results', async () => {
      const { loader } = createMockLoader()
      const manager = new RegistryManager(loader, {
        userSkillsDir: testUserSkillsDir,
        tencentEnabled: true,
        tencentSearchUrl: 'https://tencent.test/skills',
        fetchImpl: async (url) => {
          if (String(url) === 'https://tencent.test/skills?page=1&pageSize=50&sortBy=score&order=desc&keyword=find-skills-2') {
            return Response.json({
              code: 0,
              data: {
                skills: [
                  {
                    slug: 'find-skills',
                    name: 'Find Skills',
                    description_zh: '另一个技能。',
                    version: '0.1.0',
                  },
                  {
                    slug: 'find-skills-2',
                    name: 'Find Skills 2',
                    description_zh: '仅搜索返回的技能。',
                    version: '0.1.0',
                    updated_at: 42,
                  },
                ],
                total: 2,
              },
            })
          }
          return new Response('not found', { status: 404 })
        },
        sleep: async () => {},
      })

      const detail = await manager.getMarketplaceSkill('find-skills-2', 'tencent', 'zh')

      expect(detail).toMatchObject({
        slug: 'find-skills-2',
        displayName: 'Find Skills 2',
        summary: '仅搜索返回的技能。',
        latestVersion: '0.1.0',
        updatedAt: 42,
        url: null,
      })
    })

    test('searches Tencent detail beyond the first page before returning not found', async () => {
      const { loader } = createMockLoader()
      let requests = 0
      const manager = new RegistryManager(loader, {
        userSkillsDir: testUserSkillsDir,
        tencentEnabled: true,
        tencentSearchUrl: 'https://tencent.test/skills',
        fetchImpl: async (url) => {
          requests += 1
          if (String(url) === 'https://tencent.test/skills?page=1&pageSize=50&sortBy=score&order=desc&keyword=target-skill') {
            return Response.json({
              code: 0,
              data: {
                skills: [
                  {
                    slug: 'other-skill',
                    name: 'Other Skill',
                    description_zh: '第一页的其他技能。',
                    version: '0.1.0',
                  },
                ],
                total: 51,
              },
            })
          }
          if (String(url) === 'https://tencent.test/skills?page=2&pageSize=50&sortBy=score&order=desc&keyword=target-skill') {
            return Response.json({
              code: 0,
              data: {
                skills: [
                  {
                    slug: 'target-skill',
                    name: 'Target Skill',
                    description_zh: '第二页的目标技能。',
                    version: '2.0.0',
                  },
                ],
                total: 51,
              },
            })
          }
          return new Response('not found', { status: 404 })
        },
        sleep: async () => {},
      })

      const detail = await manager.getMarketplaceSkill('target-skill', 'tencent', 'zh')

      expect(requests).toBe(2)
      expect(detail).toMatchObject({
        slug: 'target-skill',
        displayName: 'Target Skill',
        summary: '第二页的目标技能。',
        latestVersion: '2.0.0',
      })
    })

    test('exhausts Tencent search pages before reporting a missing slug', async () => {
      const { loader } = createMockLoader()
      let requests = 0
      const manager = new RegistryManager(loader, {
        userSkillsDir: testUserSkillsDir,
        tencentEnabled: true,
        tencentSearchUrl: 'https://tencent.test/skills',
        fetchImpl: async (url) => {
          requests += 1
          if (String(url) === 'https://tencent.test/skills?page=1&pageSize=50&sortBy=score&order=desc&keyword=missing-skill') {
            return Response.json({
              code: 0,
              data: {
                skills: [
                  {
                    slug: 'other-skill',
                    name: 'Other Skill',
                    description_zh: '第一页的其他技能。',
                    version: '0.1.0',
                  },
                ],
                total: 51,
              },
            })
          }
          if (String(url) === 'https://tencent.test/skills?page=2&pageSize=50&sortBy=score&order=desc&keyword=missing-skill') {
            return Response.json({
              code: 0,
              data: {
                skills: [
                  {
                    slug: 'another-skill',
                    name: 'Another Skill',
                    description_zh: '第二页仍然没有目标技能。',
                    version: '0.2.0',
                  },
                ],
                total: 51,
              },
            })
          }
          return new Response('not found', { status: 404 })
        },
        sleep: async () => {},
      })

      await expect(manager.getMarketplaceSkill('missing-skill', 'tencent', 'zh'))
        .rejects.toThrow('Skill "missing-skill" was not found')
      expect(requests).toBe(2)
    })
  })

  describe('installSkill', () => {
    test('throws when the remote skill does not exist', async () => {
      const { loader } = createMockLoader()
      const manager = createRegistryManager(loader, async () => new Response('missing', { status: 404 }))

      await expect(manager.installSkill('unknown-skill')).rejects.toThrow('404')
    })

    test('downloads an archive and writes skill files plus registry metadata', async () => {
      const { loader, getRefreshCount } = createMockLoader()
      const zip = createSkillZip({
        'coding/SKILL.md': '---\nname: coding\ndescription: Search web\n---\n',
        'coding/README.txt': 'hello',
      })
      const manager = createRegistryManager(loader, async (url) => {
        if (String(url) === `${apiBaseUrl}/skills/coding`) {
          return Response.json({
            skill: {
              slug: 'coding',
              displayName: 'Coding',
              summary: 'Ship code',
              tags: { latest: '1.2.3' },
              stats: {},
              createdAt: 1,
              updatedAt: 2,
            },
            latestVersion: { version: '1.2.3' },
          })
        }
        if (String(url) === `${downloadUrl}?slug=coding`) {
          return new Response(zip, {
            status: 200,
            headers: { 'content-length': String(zip.byteLength) },
          })
        }
        return new Response('not found', { status: 404 })
      })

      await manager.installSkill('coding')

      const skillDir = getUserSkillDir('coding')
      expect(existsSync(resolve(skillDir, 'SKILL.md'))).toBe(true)
      expect(existsSync(resolve(skillDir, 'README.txt'))).toBe(true)
      const meta = JSON.parse(readFileSync(resolve(skillDir, '.registry.json'), 'utf-8')) as SkillRegistryMeta
      expect(meta.source).toBe('clawhub')
      expect(meta.slug).toBe('coding')
      expect(meta.version).toBe('1.2.3')
      expect(getRefreshCount()).toBe(1)
    })

    test('retries once after a 429 response', async () => {
      const { loader } = createMockLoader()
      const zip = createSkillZip({
        'SKILL.md': '---\nname: coding\ndescription: Coding skill\n---\n',
      })
      let attempts = 0
      const manager = createRegistryManager(loader, async (url) => {
        if (String(url) === `${apiBaseUrl}/skills/coding`) {
          return Response.json({
            skill: {
              slug: 'coding',
              displayName: 'Coding',
              summary: 'Ship code',
              tags: { latest: '1.0.0' },
              stats: {},
              createdAt: 1,
              updatedAt: 2,
            },
            latestVersion: { version: '1.0.0' },
          })
        }
        if (String(url) === `${downloadUrl}?slug=coding`) {
          attempts += 1
          if (attempts === 1) {
            return new Response('slow down', {
              status: 429,
              headers: { 'retry-after': '0' },
            })
          }
          return new Response(zip, {
            status: 200,
            headers: { 'content-length': String(zip.byteLength) },
          })
        }
        return new Response('not found', { status: 404 })
      })

      await manager.installSkill('coding')

      expect(attempts).toBe(2)
      expect(existsSync(resolve(getUserSkillDir('coding'), 'SKILL.md'))).toBe(true)
    })

    test('cleans up when the archive is missing a root SKILL.md', async () => {
      const { loader } = createMockLoader()
      const zip = createSkillZip({
        'docs/readme.txt': 'oops',
      })
      const manager = createRegistryManager(loader, async (url) => {
        if (String(url) === `${apiBaseUrl}/skills/coding`) {
          return Response.json({
            skill: {
              slug: 'coding',
              displayName: 'Coding',
              summary: 'Ship code',
              tags: { latest: '1.0.0' },
              stats: {},
            },
            latestVersion: { version: '1.0.0' },
          })
        }
        if (String(url) === `${downloadUrl}?slug=coding`) {
          return new Response(zip, { status: 200 })
        }
        return new Response('not found', { status: 404 })
      })

      await expect(manager.installSkill('coding')).rejects.toThrow('SKILL.md')
      expect(existsSync(getUserSkillDir('coding'))).toBe(false)
    })

    test('installs Tencent skills that are searchable and downloadable even when they are missing from the index', async () => {
      const { loader, getRefreshCount } = createMockLoader()
      const zip = createSkillZip({
        'find-skills-2/SKILL.md': '---\nname: find-skills-2\ndescription: Search-only Tencent skill\n---\n',
      })
      const manager = new RegistryManager(loader, {
        userSkillsDir: testUserSkillsDir,
        tencentEnabled: true,
        tencentSearchUrl: 'https://tencent.test/skills',
        tencentDownloadUrl: 'https://tencent.test/download',
        fetchImpl: async (url) => {
          if (String(url) === 'https://tencent.test/skills?page=1&pageSize=50&sortBy=score&order=desc&keyword=find-skills-2') {
            return Response.json({
              code: 0,
              data: {
                skills: [
                  {
                    slug: 'find-skills-2',
                    name: 'Find Skills 2',
                    description_zh: 'Search-only skill',
                    version: '0.1.0',
                  },
                ],
                total: 1,
              },
            })
          }
          if (String(url) === 'https://tencent.test/download?slug=find-skills-2') {
            return new Response(zip, {
              status: 200,
              headers: { 'content-length': String(zip.byteLength) },
            })
          }
          return new Response('not found', { status: 404 })
        },
        sleep: async () => {},
      })

      await manager.installSkill('find-skills-2', 'tencent')

      const skillDir = getUserSkillDir('find-skills-2')
      expect(existsSync(resolve(skillDir, 'SKILL.md'))).toBe(true)
      const meta = JSON.parse(readFileSync(resolve(skillDir, '.registry.json'), 'utf-8')) as SkillRegistryMeta
      expect(meta.source).toBe('tencent')
      expect(meta.slug).toBe('find-skills-2')
      expect(meta.version).toBe('0.1.0')
      expect(getRefreshCount()).toBe(1)
    })

    test('rejects path traversal entries and cleans up', async () => {
      const { loader } = createMockLoader()
      const zip = createSkillZip({
        'coding/SKILL.md': '---\nname: coding\ndescription: Coding skill\n---\n',
        'coding/../escape.txt': 'bad',
      })
      const manager = createRegistryManager(loader, async (url) => {
        if (String(url) === `${apiBaseUrl}/skills/coding`) {
          return Response.json({
            skill: {
              slug: 'coding',
              displayName: 'Coding',
              summary: 'Ship code',
              tags: { latest: '1.0.0' },
              stats: {},
            },
            latestVersion: { version: '1.0.0' },
          })
        }
        if (String(url) === `${downloadUrl}?slug=coding`) {
          return new Response(zip, { status: 200 })
        }
        return new Response('not found', { status: 404 })
      })

      await expect(manager.installSkill('coding')).rejects.toThrow('illegal file path')
      expect(existsSync(getUserSkillDir('coding'))).toBe(false)
    })
  })

  describe('updateSkill', () => {
    test('updates an installed ClawHub skill and writes the new version', async () => {
      const skillDir = getUserSkillDir('coding')
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(resolve(skillDir, 'SKILL.md'), '---\nname: coding\ndescription: old\n---\n')
      writeFileSync(resolve(skillDir, '.registry.json'), JSON.stringify(createClawhubMeta('coding', '1.0.0')))

      const { loader, getRefreshCount } = createMockLoader()
      const zip = createSkillZip({
        'coding/SKILL.md': '---\nname: coding\ndescription: new\n---\n',
        'coding/README.txt': 'updated',
      })
      const manager = createRegistryManager(loader, async (url) => {
        if (String(url) === `${apiBaseUrl}/skills/coding`) {
          return Response.json({
            skill: {
              slug: 'coding',
              displayName: 'Coding',
              summary: 'Ship code',
              tags: { latest: '1.1.0' },
              stats: {},
            },
            latestVersion: { version: '1.1.0' },
          })
        }
        if (String(url) === `${downloadUrl}?slug=coding`) {
          return new Response(zip, { status: 200 })
        }
        return new Response('not found', { status: 404 })
      })

      await manager.updateSkill('coding')

      const meta = JSON.parse(readFileSync(resolve(skillDir, '.registry.json'), 'utf-8')) as SkillRegistryMeta
      expect(meta.version).toBe('1.1.0')
      expect(readFileSync(resolve(skillDir, 'README.txt'), 'utf-8')).toBe('updated')
      expect(getRefreshCount()).toBe(1)
    })

    test('rejects an update when the installed version is already current', async () => {
      const skillDir = getUserSkillDir('coding')
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(resolve(skillDir, 'SKILL.md'), '---\nname: coding\ndescription: old\n---\n')
      writeFileSync(resolve(skillDir, '.registry.json'), JSON.stringify(createClawhubMeta('coding', '1.1.0')))

      const { loader } = createMockLoader()
      const manager = createRegistryManager(loader, async (url) => {
        if (String(url) === `${apiBaseUrl}/skills/coding`) {
          return Response.json({
            skill: {
              slug: 'coding',
              displayName: 'Coding',
              summary: 'Ship code',
              tags: { latest: '1.1.0' },
              stats: {},
            },
            latestVersion: { version: '1.1.0' },
          })
        }
        return new Response('not found', { status: 404 })
      })

      await expect(manager.updateSkill('coding')).rejects.toThrow('already up to date')
    })
  })

  describe('uninstallSkill', () => {
    test('throws when the skill is not installed', async () => {
      const { loader } = createMockLoader()
      const manager = createRegistryManager(loader, async () => new Response('nope', { status: 500 }))
      await expect(manager.uninstallSkill('coding')).rejects.toThrow('is not installed')
    })

    test('rejects uninstall for skills not installed from ClawHub', async () => {
      const skillDir = getUserSkillDir('coding')
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(resolve(skillDir, 'SKILL.md'), '---\nname: coding\ndescription: test\n---\n')

      const { loader } = createMockLoader()
      const manager = createRegistryManager(loader, async () => new Response('nope', { status: 500 }))

      await expect(manager.uninstallSkill('coding')).rejects.toThrow('was not installed from ClawHub')
    })

    test('uninstalls skills that were installed from ClawHub', async () => {
      const skillDir = getUserSkillDir('coding')
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(resolve(skillDir, 'SKILL.md'), '---\nname: coding\ndescription: test\n---\n')
      writeFileSync(resolve(skillDir, '.registry.json'), JSON.stringify(createClawhubMeta('coding', '1.0.0')))

      const { loader, getRefreshCount } = createMockLoader()
      const manager = createRegistryManager(loader, async () => new Response('nope', { status: 500 }))
      await manager.uninstallSkill('coding')

      expect(existsSync(skillDir)).toBe(false)
      expect(getRefreshCount()).toBe(1)
    })
  })
})
