import { describe, expect, test } from 'bun:test'
import type { MarketplacePage, MarketplaceSkill } from '../web/src/api/client.ts'
import { applyMarketplaceChangeToPage, getVisibleMarketplaceItems } from '../web/src/lib/marketplace-updates.ts'

function createMarketplaceSkill(overrides: Partial<MarketplaceSkill> = {}): MarketplaceSkill {
  return {
    slug: 'browser',
    displayName: 'Browser',
    summary: 'Drive the web',
    installed: false,
    installedSkillName: undefined,
    installedVersion: undefined,
    latestVersion: '1.2.0',
    hasUpdate: false,
    updatedAt: null,
    downloads: 12,
    stars: 3,
    installs: 6,
    ownerName: null,
    url: null,
    ...overrides,
  }
}

function createMarketplacePage(items: MarketplaceSkill[]): MarketplacePage {
  return {
    items,
    nextCursor: null,
    query: '',
    sort: 'downloads',
    order: 'desc',
  }
}

describe('marketplace optimistic updates', () => {
  test('marks a skill installed using the active registry source', () => {
    const page = createMarketplacePage([createMarketplaceSkill()])

    const nextPage = applyMarketplaceChangeToPage(page, {
      type: 'install',
      slug: 'browser',
      source: 'tencent',
    })

    expect(nextPage.items[0]?.installed).toBe(true)
    expect(nextPage.items[0]?.installedVersion).toBe('1.2.0')
    expect(nextPage.items[0]?.hasUpdate).toBe(false)
  })

  test('clears update badges after an optimistic update', () => {
    const page = createMarketplacePage([
      createMarketplaceSkill({
        installed: true,
        installedVersion: '1.0.0',
        latestVersion: '1.2.0',
        hasUpdate: true,
      }),
    ])

    const nextPage = applyMarketplaceChangeToPage(page, {
      type: 'update',
      slug: 'browser',
      source: 'tencent',
    })

    expect(nextPage.items[0]?.installed).toBe(true)
    expect(nextPage.items[0]?.installedVersion).toBe('1.2.0')
    expect(nextPage.items[0]?.hasUpdate).toBe(false)
  })

  test('clears local install metadata after an optimistic uninstall', () => {
    const page = createMarketplacePage([
      createMarketplaceSkill({
        installed: true,
        installedSkillName: 'browser',
        installedVersion: '1.2.0',
      }),
    ])

    const nextPage = applyMarketplaceChangeToPage(page, {
      type: 'uninstall',
      slug: 'browser',
      source: 'tencent',
    })

    expect(nextPage.items[0]?.installed).toBe(false)
    expect(nextPage.items[0]?.installedSkillName).toBeUndefined()
    expect(nextPage.items[0]?.installedVersion).toBeUndefined()
  })

  test('filters an optimistically installed skill out of marketplace results', () => {
    const page = createMarketplacePage([createMarketplaceSkill()])
    const nextPage = applyMarketplaceChangeToPage(page, {
      type: 'install',
      slug: 'browser',
      source: 'tencent',
    })

    expect(getVisibleMarketplaceItems(nextPage)).toHaveLength(0)
  })
})
