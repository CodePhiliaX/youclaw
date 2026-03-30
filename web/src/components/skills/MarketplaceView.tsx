import { useMemo } from 'react'
import type { MarketplaceCardViewModel, MarketplaceResultsViewModel } from '@/lib/marketplace-view-model'
import type { MarketplaceSort, RegistrySelectableSource, RegistrySourceInfo } from '@/api/client'
import type { MarketplaceChangeEvent } from '@/lib/marketplace-updates'
import type { MarketplaceFeedStatus } from '@/hooks/useMarketplaceFeed'
import { MarketplaceCard } from '@/components/MarketplaceCard'
import { RegistrySourceSelect } from '@/components/RegistrySourceSelect'
import { MarketplaceFeedHeader } from '@/components/skills/MarketplaceFeedHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MarketplaceVirtualList } from '@/components/skills/MarketplaceVirtualList'
import {
  LayoutGrid,
  List,
  Loader2,
  Search,
  Store,
} from 'lucide-react'
import { useI18n } from '@/i18n'
import { type TencentMarketplaceCategoryFilter } from '@/lib/tencent-marketplace-category'
import type { SkillsViewMode } from '@/stores/app'

type MarketplaceViewRow = { key: string; type: 'card'; viewModel: MarketplaceCardViewModel }

function getMarketplaceSortLabel(
  sort: MarketplaceSort,
  registrySource: RegistrySelectableSource,
  t: ReturnType<typeof useI18n>['t'],
) {
  switch (sort) {
    case 'score':
      return t.skills.marketplaceSortScore
    case 'newest':
      return t.skills.marketplaceSortNewest
    case 'updated':
      return t.skills.marketplaceSortUpdated
    case 'downloads':
      return t.skills.marketplaceSortDownloads
    case 'installs':
      return t.skills.marketplaceSortInstalls
    case 'stars':
      return registrySource === 'tencent'
        ? t.skills.marketplaceSortFavorites
        : t.skills.marketplaceSortStars
    case 'name':
      return t.skills.marketplaceSortName
  }
}

interface MarketplaceViewProps {
  resultsViewModel: MarketplaceResultsViewModel
  marketplaceStatus: MarketplaceFeedStatus
  marketplaceError: string
  marketplaceAppendError: string
  registrySource: RegistrySelectableSource
  registrySourceInfo?: RegistrySourceInfo
  registrySources: RegistrySourceInfo[]
  onRegistrySourceChange: (source: RegistrySelectableSource) => void
  marketplaceSort?: MarketplaceSort
  onMarketplaceSortChange: (sort: MarketplaceSort) => void
  marketplaceCategoryFilter: TencentMarketplaceCategoryFilter
  onMarketplaceCategoryFilterChange: (filter: TencentMarketplaceCategoryFilter) => void
  searchQuery: string
  handleSearchChange: (value: string) => void
  onChanged: (change?: MarketplaceChangeEvent) => void
  onLoadMore: () => void
  onRetryLoadMore: () => void
  listKey: string
  viewMode: SkillsViewMode
  onViewModeChange: (viewMode: SkillsViewMode) => void
}

export function MarketplaceView({
  resultsViewModel,
  marketplaceStatus,
  marketplaceError,
  marketplaceAppendError,
  registrySource,
  registrySourceInfo,
  registrySources,
  onRegistrySourceChange,
  marketplaceSort,
  onMarketplaceSortChange,
  marketplaceCategoryFilter,
  onMarketplaceCategoryFilterChange,
  searchQuery,
  handleSearchChange,
  onChanged,
  onLoadMore,
  onRetryLoadMore,
  listKey,
  viewMode,
  onViewModeChange,
}: MarketplaceViewProps) {
  const { t } = useI18n()
  const availableSorts = useMemo(
    () => (registrySourceInfo?.capabilities.sorts ?? []).filter((sort) => sort !== 'name'),
    [registrySourceInfo],
  )
  const showSortControls = Boolean(availableSorts.length > 0 && marketplaceSort)

  const rows = useMemo<MarketplaceViewRow[]>(() => {
    return resultsViewModel.flatItems.map((viewModel) => ({
      key: `card:${viewModel.slug}`,
      type: 'card',
      viewModel,
    }))
  }, [resultsViewModel])

  const listHeader = (
    <MarketplaceFeedHeader
      registrySource={registrySource}
      marketplaceCategoryFilter={marketplaceCategoryFilter}
      onMarketplaceCategoryFilterChange={onMarketplaceCategoryFilterChange}
      t={t}
    />
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col p-6">
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                data-testid="marketplace-search-input"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={t.skills.marketplaceSearchPlaceholder}
                className="h-12 border-0 bg-transparent pl-11 pr-4 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>

            <div className="h-7 w-px bg-border/70" />

            <RegistrySourceSelect
              sources={registrySources}
              value={registrySource}
              onValueChange={onRegistrySourceChange}
              className="h-12 w-fit shrink-0 rounded-none border-0 bg-transparent px-3 shadow-none focus:ring-0 focus:ring-offset-0"
            />
          </div>

          <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row lg:items-center">
            {showSortControls && marketplaceSort && (
              <>
                <Select value={marketplaceSort} onValueChange={(next) => onMarketplaceSortChange(next as MarketplaceSort)}>
                  <SelectTrigger className="h-12 w-fit max-w-full gap-1.5 rounded-2xl px-2 pr-1.5 sm:w-fit" data-testid="marketplace-sort-select">
                    <SelectValue placeholder={t.skills.marketplaceSortLabel} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSorts.map((sort) => (
                      <SelectItem key={sort} value={sort}>
                        {getMarketplaceSortLabel(sort, registrySource, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
            <Button
              variant="outline"
              size="icon"
              className="hidden h-12 w-12 rounded-2xl border-border/70 shadow-sm lg:inline-flex"
              aria-label={viewMode === 'grid' ? t.skills.switchToListView : t.skills.switchToGridView}
              type="button"
              onClick={() => {
                onViewModeChange(viewMode === 'grid' ? 'list' : 'grid')
              }}
            >
              {viewMode === 'grid' ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            </Button>
          </div>
        </div>

      </div>

      <div className="relative mt-6 flex min-h-0 w-full flex-1">
        {viewMode === 'list' ? (
          <MarketplaceVirtualList
            rows={rows}
            listKey={listKey}
            rowKey={(row) => row.key}
            renderRow={(row) => {
              return (
                <div className="pb-3">
                  <MarketplaceCard
                    viewModel={row.viewModel}
                    onChanged={onChanged}
                    registrySource={registrySource}
                    viewMode="list"
                  />
                </div>
              )
            }}
            status={marketplaceStatus}
            hasMore={resultsViewModel.canLoadMore}
            appendError={marketplaceAppendError}
            loadingLabel={t.common.loading}
            retryLabel={t.common.retry}
            emptyState={(
              <div className="flex h-full flex-col items-center justify-center py-12 text-center text-muted-foreground text-sm">
                <Store className="mb-4 h-12 w-12 opacity-20" />
                <p>{resultsViewModel.isSearching ? t.skills.noMarketplaceSkills : t.skills.noSkills}</p>
              </div>
            )}
            errorState={(
              <div className="flex h-full flex-col items-center justify-center py-12 text-center text-muted-foreground text-sm">
                <Store className="mb-4 h-12 w-12 opacity-20" />
                <p>{marketplaceError || t.skills.marketplaceLoadFailed}</p>
              </div>
            )}
            onLoadMore={onLoadMore}
            onRetryLoadMore={onRetryLoadMore}
            header={listHeader}
            scrollerClassName="pr-1"
          />
        ) : (
          <div className="h-full w-full overflow-y-auto pr-1">
            {listHeader}

            {marketplaceStatus === 'loading' && rows.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : marketplaceStatus === 'error' && rows.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-12 text-center text-muted-foreground text-sm">
                <Store className="mb-4 h-12 w-12 opacity-20" />
                <p>{marketplaceError || t.skills.marketplaceLoadFailed}</p>
              </div>
            ) : rows.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-12 text-center text-muted-foreground text-sm">
                <Store className="mb-4 h-12 w-12 opacity-20" />
                <p>{resultsViewModel.isSearching ? t.skills.noMarketplaceSkills : t.skills.noSkills}</p>
                {resultsViewModel.canLoadMore && marketplaceStatus === 'idle' && !marketplaceAppendError && (
                  <Button className="mt-4" variant="outline" onClick={onLoadMore}>
                    {t.skills.marketplaceLoadMore}
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="grid items-start grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {rows.map((row) => (
                    <MarketplaceCard
                      key={row.key}
                      viewModel={row.viewModel}
                      onChanged={onChanged}
                      registrySource={registrySource}
                      viewMode="grid"
                    />
                  ))}
                </div>

                {marketplaceStatus === 'loading-more' && (
                  <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t.common.loading}</span>
                  </div>
                )}

                {marketplaceAppendError && (
                  <div className="flex flex-col items-center gap-2 py-4 text-sm text-muted-foreground">
                    <p>{marketplaceAppendError}</p>
                    <Button variant="secondary" onClick={onRetryLoadMore}>
                      {t.common.retry}
                    </Button>
                  </div>
                )}

                {resultsViewModel.canLoadMore && marketplaceStatus === 'idle' && !marketplaceAppendError && (
                  <div className="flex justify-center py-4">
                    <Button variant="outline" onClick={onLoadMore}>
                      {t.skills.marketplaceLoadMore}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {marketplaceStatus === 'refreshing' && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/40 backdrop-blur-[1.5px]">
            <div className="flex items-center gap-2 rounded-full border border-border bg-background/96 px-4 py-2 text-sm text-muted-foreground shadow-md">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t.common.loading}</span>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
