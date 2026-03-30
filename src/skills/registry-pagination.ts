export interface MarketplacePageSliceResult<TItem> {
  items: TItem[]
  nextOffset: number | null
}

export function takeMarketplacePageSlice<TInput, TOutput>(
  pageItems: TInput[],
  offset: number,
  limit: number,
  isVisible: (item: TInput) => boolean,
  mapItem: (item: TInput) => TOutput,
): MarketplacePageSliceResult<TOutput> {
  const safeOffset = Math.max(0, Math.min(offset, pageItems.length))
  const items: TOutput[] = []
  let index = safeOffset

  while (index < pageItems.length && items.length < limit) {
    const item = pageItems[index]
    if (item === undefined) {
      break
    }
    index += 1
    if (!isVisible(item)) {
      continue
    }
    items.push(mapItem(item))
  }

  return {
    items,
    nextOffset: index < pageItems.length ? index : null,
  }
}
