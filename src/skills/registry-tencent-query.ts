import { formatTencentListCursor } from './registry-cursors.ts'

export interface TencentSlugSearchPage<TItem extends { slug: string }> {
  items: TItem[]
  total: number
  page: number
}

interface FindExactTencentSlugOptions<TItem extends { slug: string }> {
  slug: string
  pageSize: number
  fetchPage: (cursor: string | null) => Promise<TencentSlugSearchPage<TItem>>
}

export async function findExactTencentSlug<TItem extends { slug: string }>({
  slug,
  pageSize,
  fetchPage,
}: FindExactTencentSlugOptions<TItem>): Promise<TItem | null> {
  let cursor: string | null = null
  const seenPages = new Set<number>()

  while (true) {
    const page = await fetchPage(cursor)
    const matched = page.items.find((item) => item.slug === slug)
    if (matched) {
      return matched
    }

    const nextPage = page.page + 1
    const hasMore = page.items.length > 0 && page.page * pageSize < page.total
    if (!hasMore || seenPages.has(nextPage)) {
      return null
    }

    seenPages.add(page.page)
    cursor = formatTencentListCursor(nextPage, 0)
  }
}
