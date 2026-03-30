import type {
  MarketplaceOrder,
  MarketplacePage,
  MarketplaceSkill,
  MarketplaceSort,
} from '../api/client'

export type MarketplaceLoadMode = 'replace' | 'refresh' | 'append'
export type MarketplaceFeedStatus = 'idle' | 'loading' | 'refreshing' | 'loading-more' | 'error'

export function createEmptyMarketplacePage(
  query: string,
  sort: MarketplaceSort,
  order: MarketplaceOrder,
): MarketplacePage {
  return {
    items: [],
    nextCursor: null,
    query,
    sort,
    order,
  }
}

export function mergeMarketplaceItems(current: MarketplaceSkill[], next: MarketplaceSkill[]) {
  const items = new Map(current.map((item) => [item.slug, item]))
  for (const item of next) {
    items.set(item.slug, item)
  }
  return [...items.values()]
}

export function resolveMarketplaceLoadFailure(options: {
  mode: MarketplaceLoadMode
  query: string
  sort: MarketplaceSort
  order: MarketplaceOrder
  errorMessage: string
}) {
  const { mode, query, sort, order, errorMessage } = options

  if (mode === 'append') {
    return {
      page: null,
      status: 'idle' as const,
      error: '',
      appendError: errorMessage,
    }
  }

  if (mode === 'refresh') {
    return {
      page: null,
      status: 'idle' as const,
      error: '',
      appendError: '',
    }
  }

  return {
    page: createEmptyMarketplacePage(query, sort, order),
    status: 'error' as const,
    error: errorMessage,
    appendError: '',
  }
}
