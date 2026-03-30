import { describe, expect, test } from 'bun:test'
import {
  createEmptyMarketplacePage,
  mergeMarketplaceItems,
  resolveMarketplaceLoadFailure,
} from '../web/src/lib/marketplace-feed.ts'

describe('marketplace feed helpers', () => {
  test('replace failure clears stale results and enters error state', () => {
    const failure = resolveMarketplaceLoadFailure({
      mode: 'replace',
      query: 'browser',
      sort: 'downloads',
      order: 'desc',
      errorMessage: 'load failed',
    })

    expect(failure.status).toBe('error')
    expect(failure.error).toBe('load failed')
    expect(failure.appendError).toBe('')
    expect(failure.page).toEqual(createEmptyMarketplacePage('browser', 'downloads', 'desc'))
  })

  test('refresh failure keeps current items and stays idle', () => {
    const failure = resolveMarketplaceLoadFailure({
      mode: 'refresh',
      query: 'browser',
      sort: 'downloads',
      order: 'desc',
      errorMessage: 'refresh failed',
    })

    expect(failure.status).toBe('idle')
    expect(failure.error).toBe('')
    expect(failure.appendError).toBe('')
    expect(failure.page).toBeNull()
  })

  test('append failure keeps current items and only surfaces append error', () => {
    const failure = resolveMarketplaceLoadFailure({
      mode: 'append',
      query: 'browser',
      sort: 'downloads',
      order: 'desc',
      errorMessage: 'load more failed',
    })

    expect(failure.status).toBe('idle')
    expect(failure.error).toBe('')
    expect(failure.appendError).toBe('load more failed')
    expect(failure.page).toBeNull()
  })

  test('mergeMarketplaceItems keeps unique slugs and prefers the latest payload', () => {
    const merged = mergeMarketplaceItems(
      [{
        slug: 'browser',
        displayName: 'Browser',
        summary: 'Old summary',
        installed: false,
        hasUpdate: false,
      }],
      [{
        slug: 'browser',
        displayName: 'Browser',
        summary: 'New summary',
        installed: false,
        hasUpdate: true,
      }, {
        slug: 'search',
        displayName: 'Search',
        summary: 'Second item',
        installed: false,
        hasUpdate: false,
      }],
    )

    expect(merged).toEqual([
      {
        slug: 'browser',
        displayName: 'Browser',
        summary: 'New summary',
        installed: false,
        hasUpdate: true,
      },
      {
        slug: 'search',
        displayName: 'Search',
        summary: 'Second item',
        installed: false,
        hasUpdate: false,
      },
    ])
  })
})
