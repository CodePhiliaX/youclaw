import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getMarketplaceSkills,
  type MarketplaceListRequest,
  type MarketplaceLocale,
  type MarketplaceOrder,
  type MarketplacePage,
  type MarketplaceSkill,
  type MarketplaceSort,
  type RegistrySelectableSource,
  type TencentMarketplaceCategory,
} from '@/api/client'
import { applyMarketplaceChangeToPage, type MarketplaceChangeEvent } from '@/lib/marketplace-updates'
import {
  createEmptyMarketplacePage,
  mergeMarketplaceItems,
  resolveMarketplaceLoadFailure,
  type MarketplaceFeedStatus,
  type MarketplaceLoadMode,
} from '@/lib/marketplace-feed'

export type { MarketplaceFeedStatus } from '@/lib/marketplace-feed'

interface UseMarketplaceFeedOptions {
  enabled: boolean
  query: string
  sort?: MarketplaceSort
  order?: MarketplaceOrder
  source?: RegistrySelectableSource
  locale?: MarketplaceLocale
  category?: TencentMarketplaceCategory
  limit?: number
  debounceMs?: number
  loadFailedMessage: string
}

export function useMarketplaceFeed({
  enabled,
  query,
  sort = 'downloads',
  order = 'desc',
  source,
  locale,
  category,
  limit = 24,
  debounceMs = 300,
  loadFailedMessage,
}: UseMarketplaceFeedOptions) {
  const normalizedQuery = query.trim()
  const [activeQuery, setActiveQuery] = useState(normalizedQuery)
  const [pageState, setPageState] = useState<MarketplacePage>(() => (
    createEmptyMarketplacePage(normalizedQuery, sort, order)
  ))
  const [statusState, setStatusState] = useState<MarketplaceFeedStatus>('idle')
  const [error, setError] = useState('')
  const [appendError, setAppendError] = useState('')

  const pageRef = useRef(pageState)
  const statusRef = useRef(statusState)
  const filtersRef = useRef({ query: normalizedQuery, sort, order, source, locale, category })
  const requestIdRef = useRef(0)
  const pendingCursorRef = useRef<string | null>(null)
  const wasEnabledRef = useRef(enabled)

  const setPage = useCallback((updater: MarketplacePage | ((current: MarketplacePage) => MarketplacePage)) => {
    setPageState((current) => {
      const next = typeof updater === 'function'
        ? updater(current)
        : updater
      pageRef.current = next
      return next
    })
  }, [])

  const setStatus = useCallback((next: MarketplaceFeedStatus) => {
    statusRef.current = next
    setStatusState(next)
  }, [])

  const load = useCallback(async (options: {
    mode?: MarketplaceLoadMode
    cursor?: string | null
    query?: string
    sort?: MarketplaceSort
    order?: MarketplaceOrder
    source?: RegistrySelectableSource
    locale?: MarketplaceLocale
    category?: TencentMarketplaceCategory
  } = {}) => {
    if (!enabled) return

    const mode = options.mode ?? 'replace'
    const append = mode === 'append'
    const nextQuery = options.query ?? filtersRef.current.query
    const nextSort = options.sort ?? filtersRef.current.sort
    const nextOrder = options.order ?? filtersRef.current.order
    const nextSource = options.source ?? filtersRef.current.source
    const nextLocale = options.locale ?? filtersRef.current.locale
    const nextCategory = options.category ?? filtersRef.current.category
    const cursor = append ? (options.cursor ?? pageRef.current.nextCursor) : null

    if (append) {
      if (
        !cursor
        || pendingCursorRef.current === cursor
        || statusRef.current === 'loading-more'
        || statusRef.current === 'loading'
      ) {
        return
      }
      pendingCursorRef.current = cursor
      setAppendError('')
      setStatus('loading-more')
    } else {
      pendingCursorRef.current = null
      setAppendError('')
      if (mode === 'replace') {
        const hasExistingItems = pageRef.current.items.length > 0
        if (!hasExistingItems) {
          setPage(createEmptyMarketplacePage(nextQuery, nextSort, nextOrder))
          setStatus('loading')
        } else {
          setStatus('refreshing')
        }
        setError('')
      } else {
        setStatus('refreshing')
      }
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    try {
      const request: MarketplaceListRequest = {
        source: nextSource,
        query: nextQuery,
        sort: nextSort,
        order: nextOrder,
        cursor,
        limit,
        locale: nextLocale,
        category: nextCategory,
      }

      const nextPage = await getMarketplaceSkills(request)

      if (requestId !== requestIdRef.current) {
        return
      }

      pendingCursorRef.current = null
      setPage((current) => ({
        ...nextPage,
        items: append ? mergeMarketplaceItems(current.items, nextPage.items) : nextPage.items,
      }))
      setStatus('idle')
      if (!append) {
        setError('')
      }
    } catch (nextError) {
      if (requestId !== requestIdRef.current) {
        return
      }

      pendingCursorRef.current = null

      if (!append) {
        const failure = resolveMarketplaceLoadFailure({
          mode,
          query: nextQuery,
          sort: nextSort,
          order: nextOrder,
          errorMessage: nextError instanceof Error && nextError.message ? nextError.message : loadFailedMessage,
        })

        if (failure.page) {
          setPage(failure.page)
        }
        setStatus(failure.status)
        setError(failure.error)
        setAppendError(failure.appendError)
        return
      }

      const failure = resolveMarketplaceLoadFailure({
        mode,
        query: nextQuery,
        sort: nextSort,
        order: nextOrder,
        errorMessage: nextError instanceof Error && nextError.message ? nextError.message : loadFailedMessage,
      })
      setStatus(failure.status)
      setAppendError(failure.appendError)
    }
  }, [enabled, limit, loadFailedMessage, setPage, setStatus])

  useEffect(() => {
    const delay = enabled && wasEnabledRef.current ? debounceMs : 0

    const timer = window.setTimeout(() => {
      filtersRef.current = { query: normalizedQuery, sort, order, source, locale, category }
      setActiveQuery(normalizedQuery)

      if (!enabled) {
        wasEnabledRef.current = false
        requestIdRef.current += 1
        pendingCursorRef.current = null
        return
      }

      wasEnabledRef.current = true
      void load({
        mode: 'replace',
        query: normalizedQuery,
        sort,
        order,
        source,
        locale,
        category,
      })
    }, delay)

    return () => window.clearTimeout(timer)
  }, [category, debounceMs, enabled, load, locale, normalizedQuery, order, sort, source])

  const loadMore = useCallback(() => load({ mode: 'append' }), [load])
  const refresh = useCallback(() => load({ mode: 'refresh' }), [load])

  const applyChange = useCallback((change?: MarketplaceChangeEvent) => {
    if (!change) return
    setPage((current) => applyMarketplaceChangeToPage(current, change))
  }, [setPage])

  const updateItems = useCallback((updater: (items: MarketplaceSkill[]) => MarketplaceSkill[]) => {
    setPage((current) => ({
      ...current,
      items: updater(current.items),
    }))
  }, [setPage])

  const listKey = useMemo(
    () => `${source ?? 'recommended'}:${locale ?? 'zh'}:${category ?? 'all'}:${pageState.sort}:${pageState.order}:${pageState.query}`,
    [category, locale, pageState.order, pageState.query, pageState.sort, source],
  )

  return {
    activeQuery,
    appendError,
    applyChange,
    error,
    listKey,
    loadMore,
    page: pageState,
    refresh,
    status: statusState,
    updateItems,
  }
}
