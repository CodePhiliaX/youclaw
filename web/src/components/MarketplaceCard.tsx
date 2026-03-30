import { useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import type { RegistrySelectableSource } from '../api/client'
import { getMarketplaceSkill, installRecommendedSkill, uninstallRecommendedSkill, updateMarketplaceSkill } from '../api/client'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { MarketplaceInstallDialog } from '../components/MarketplaceInstallDialog'
import { useI18n } from '../i18n'
import {
  type MarketplaceCardMetricViewModel,
  toMarketplaceInstallDialogFallbackViewModel,
  toMarketplaceInstallDialogViewModel,
  type MarketplaceCardViewModel,
  type MarketplaceInstallDialogViewModel,
} from '../lib/marketplace-view-model'
import type { MarketplaceChangeEvent } from '../lib/marketplace-updates'
import { resolveMarketplaceActionSource } from '../lib/registry-source'
import { cn } from '../lib/utils'
import { notify, useAppRuntimeStore } from '../stores/app'
import { CalendarDays, Download, Loader2, Package, Puzzle, RefreshCw, Star, Trash2 } from 'lucide-react'

type MarketplaceCardViewMode = 'list' | 'grid'

function normalizeMarketplaceActionError(message: string, fallback: string, skillNotFoundLabel: string) {
  if (!message) {
    return fallback
  }

  const skillNotFoundMatch = message.match(/^Skill "(.+)" was not found$/)
  if (skillNotFoundMatch) {
    return skillNotFoundLabel.replace('{name}', skillNotFoundMatch[1] ?? '')
  }

  return message
}

function formatMetricValue(metric: MarketplaceCardMetricViewModel, locale: 'zh' | 'en') {
  if (metric.kind === 'number' && typeof metric.value === 'number') {
    return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(metric.value)
  }

  if (metric.kind === 'date' && typeof metric.value === 'number') {
    return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(metric.value)
  }

  return String(metric.value)
}

function getMetricIcon(metric: MarketplaceCardMetricViewModel) {
  switch (metric.key) {
    case 'latestVersion':
    case 'installedVersion':
      return Package
    case 'downloads':
      return Download
    case 'stars':
      return Star
    case 'installs':
      return Package
    case 'updatedAt':
      return CalendarDays
  }
}

function MarketplaceMetricSection({
  metrics,
  locale,
  viewMode,
  className,
}: {
  metrics: MarketplaceCardMetricViewModel[]
  locale: 'zh' | 'en'
  viewMode: MarketplaceCardViewMode
  className?: string
}) {
  if (metrics.length === 0) {
    return null
  }

  return (
    <div
      className={cn(
        viewMode === 'grid' ? 'mt-3 flex flex-wrap items-center gap-x-4 gap-y-2' : 'mt-2 flex flex-wrap items-center gap-x-4 gap-y-2',
        className,
      )}
    >
      {metrics.map((metric) => {
        const Icon = getMetricIcon(metric)
        const value = formatMetricValue(metric, locale)

        return (
          <div
            key={metric.key}
            className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate leading-none" data-testid={metric.testId}>
              {value}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function MarketplaceCard({
  viewModel,
  onChanged,
  extraActions,
  hideInstalledBadge = false,
  statusBadges,
  onOpenInstallDialog,
  openInstallDialogDisabled = false,
  registrySource,
  viewMode = 'list',
}: {
  viewModel: MarketplaceCardViewModel
  onChanged: (change?: MarketplaceChangeEvent) => void
  extraActions?: ReactNode
  hideInstalledBadge?: boolean
  statusBadges?: ReactNode
  onOpenInstallDialog?: () => void | Promise<void>
  openInstallDialogDisabled?: boolean
  registrySource?: RegistrySelectableSource
  viewMode?: MarketplaceCardViewMode
}) {
  const { t, locale } = useI18n()
  const registrySources = useAppRuntimeStore((state) => state.registrySources)
  const [status, setStatus] = useState<'idle' | 'installing' | 'updating' | 'uninstalling'>('idle')
  const [confirmDetailViewModel, setConfirmDetailViewModel] = useState<MarketplaceInstallDialogViewModel | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const actionSource = useMemo<RegistrySelectableSource>(
    () => resolveMarketplaceActionSource(
      registrySource,
      registrySources,
      locale,
    ),
    [locale, registrySource, registrySources],
  )
  const buildMarketplaceMessage = useMemo(() => (
    (template: string, skillLabel: string) => template.replace('{name}', skillLabel)
  ), [])
  const formatActionError = useMemo(() => (
    (message: string | undefined, fallback: string) => normalizeMarketplaceActionError(
      message ?? '',
      fallback,
      t.skills.marketplaceSkillNotFound,
    )
  ), [t.skills.marketplaceSkillNotFound])

  const handleInstall = async () => {
    setStatus('installing')
    try {
      const result = await installRecommendedSkill({ slug: viewModel.slug, source: actionSource })
      if (result.ok) {
        setStatus('idle')
        onChanged({ type: 'install', slug: viewModel.slug, source: actionSource })
        notify.success(buildMarketplaceMessage(t.skills.marketplaceInstallSuccess, viewModel.displayName))
      } else {
        setStatus('idle')
        notify.error(formatActionError(result.error, t.skills.installFailed))
      }
    } catch (error) {
      setStatus('idle')
      notify.error(formatActionError(error instanceof Error ? error.message : undefined, t.skills.installFailed))
    }
  }

  const handleUpdate = async () => {
    setStatus('updating')
    try {
      const result = await updateMarketplaceSkill({ slug: viewModel.slug, source: actionSource })
      if (result.ok) {
        setStatus('idle')
        onChanged({ type: 'update', slug: viewModel.slug, source: actionSource })
        notify.success(buildMarketplaceMessage(t.skills.marketplaceUpdateSuccess, viewModel.displayName))
      } else {
        setStatus('idle')
        notify.error(formatActionError(result.error, t.skills.updateFailed))
      }
    } catch (error) {
      setStatus('idle')
      notify.error(formatActionError(error instanceof Error ? error.message : undefined, t.skills.updateFailed))
    }
  }

  const handleConfirmInstall = async () => {
    setLoadingDetail(true)
    try {
      const detail = await getMarketplaceSkill({ slug: viewModel.slug, source: actionSource, locale })
      setConfirmDetailViewModel(toMarketplaceInstallDialogViewModel(detail, t))
    } catch {
      setConfirmDetailViewModel(toMarketplaceInstallDialogFallbackViewModel(viewModel, t))
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleUninstall = async () => {
    setStatus('uninstalling')
    try {
      const result = await uninstallRecommendedSkill({ slug: viewModel.slug, source: actionSource })
      if (result.ok) {
        setStatus('idle')
        onChanged({ type: 'uninstall', slug: viewModel.slug, source: actionSource })
        notify.success(buildMarketplaceMessage(t.skills.marketplaceUninstallSuccess, viewModel.displayName))
      } else {
        setStatus('idle')
        notify.error(formatActionError(result.error, t.skills.uninstallFailed))
      }
    } catch (error) {
      setStatus('idle')
      notify.error(formatActionError(error instanceof Error ? error.message : undefined, t.skills.uninstallFailed))
    }
  }

  const canOpenInstallDialog = !viewModel.installed
    && !openInstallDialogDisabled
    && status !== 'installing'
    && !loadingDetail
    && (Boolean(onOpenInstallDialog) || !extraActions)

  const triggerInstallDialog = () => {
    if (!canOpenInstallDialog) return
    if (onOpenInstallDialog) {
      void onOpenInstallDialog()
      return
    }
    void handleConfirmInstall()
  }

  const isNestedInteractiveTarget = (target: EventTarget | null, currentTarget: HTMLDivElement) => {
    if (!(target instanceof HTMLElement)) {
      return false
    }
    const interactiveTarget = target.closest('button, a, input, select, textarea, summary, [role="button"], [role="link"]')
    return interactiveTarget !== null && interactiveTarget !== currentTarget
  }

  const handleCardClick = (event: MouseEvent<HTMLDivElement>) => {
    if (isNestedInteractiveTarget(event.target, event.currentTarget)) {
      return
    }
    triggerInstallDialog()
  }

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      triggerInstallDialog()
    }
  }

  const actionButtons = extraActions ?? (
    viewModel.installed
      ? (
        <>
          {viewModel.hasUpdate && (
            <Button
              data-testid={`marketplace-update-${viewModel.slug}`}
              size="sm"
              variant="secondary"
              className="text-xs"
              onClick={handleUpdate}
              disabled={status === 'updating'}
            >
              {status === 'updating' ? (
                <><RefreshCw className="h-3 w-3 animate-spin mr-1" />{t.skills.updating}</>
              ) : (
                <><RefreshCw className="h-3 w-3 mr-1" />{t.skills.update}</>
              )}
            </Button>
          )}
          <Button
            data-testid={`marketplace-uninstall-${viewModel.slug}`}
            size="sm"
            variant="ghost"
            className="text-xs text-muted-foreground hover:text-red-400"
            onClick={handleUninstall}
            disabled={status === 'uninstalling'}
          >
            {status === 'uninstalling' ? (
              <><Loader2 className="h-3 w-3 animate-spin mr-1" />{t.skills.uninstalling}</>
            ) : (
              <><Trash2 className="h-3 w-3 mr-1" />{t.skills.uninstall}</>
            )}
          </Button>
        </>
      )
      : null
  )
  const hasActionButtons = Boolean(extraActions) || viewModel.installed

  if (viewMode === 'grid') {
    return (
      <div
        data-testid={`marketplace-card-${viewModel.slug}`}
        className={`rounded-[24px] border border-border bg-background p-4 transition-all duration-200 ${
          canOpenInstallDialog ? 'cursor-pointer hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]' : ''
        }`}
        role={canOpenInstallDialog ? 'button' : undefined}
        tabIndex={canOpenInstallDialog ? 0 : undefined}
        onClick={canOpenInstallDialog ? handleCardClick : undefined}
        onKeyDown={canOpenInstallDialog ? handleCardKeyDown : undefined}
      >
        <div className="flex h-full flex-col">
          <div className="flex min-h-12 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-primary/10">
              <Puzzle className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <div className="truncate text-base font-semibold tracking-tight">{viewModel.displayName}</div>
                {!hideInstalledBadge && viewModel.installed && (
                  <Badge data-testid={`marketplace-installed-badge-${viewModel.slug}`} variant="secondary">
                    {t.skills.installed}
                  </Badge>
                )}
                {statusBadges}
                {viewModel.hasUpdate && (
                  <Badge
                    data-testid={`marketplace-update-badge-${viewModel.slug}`}
                    variant="outline"
                    className="border-amber-500/40 text-amber-500"
                  >
                    {t.skills.marketplaceUpdateAvailable}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 min-h-[4.5rem] line-clamp-3 text-sm leading-6 text-muted-foreground">
            {viewModel.summary}
          </div>

          <MarketplaceMetricSection metrics={viewModel.metrics} locale={locale} viewMode="grid" />

          {hasActionButtons && (
            <div className="mt-auto flex items-center justify-end gap-2 pt-4">
              {actionButtons}
            </div>
          )}
        </div>

        <MarketplaceInstallDialog
          open={!!confirmDetailViewModel}
          viewModel={confirmDetailViewModel}
          onOpenChange={(open) => {
            if (!open) setConfirmDetailViewModel(null)
          }}
          onConfirm={() => {
            setConfirmDetailViewModel(null)
            handleInstall()
          }}
        />
      </div>
    )
  }

  return (
    <div
      data-testid={`marketplace-card-${viewModel.slug}`}
      className={`rounded-xl border border-border p-4 transition-colors hover:bg-accent/20 ${
        canOpenInstallDialog ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]' : ''
      }`}
      role={canOpenInstallDialog ? 'button' : undefined}
      tabIndex={canOpenInstallDialog ? 0 : undefined}
      onClick={canOpenInstallDialog ? handleCardClick : undefined}
      onKeyDown={canOpenInstallDialog ? handleCardKeyDown : undefined}
    >
      <div className="flex gap-4">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Puzzle className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="min-w-0 space-y-2">
            <div className="flex min-h-10 flex-wrap items-center gap-2">
              <div className="font-medium text-sm">{viewModel.displayName}</div>
              {!hideInstalledBadge && viewModel.installed && (
                <Badge data-testid={`marketplace-installed-badge-${viewModel.slug}`} variant="secondary">
                  {t.skills.installed}
                </Badge>
              )}
              {statusBadges}
              {viewModel.hasUpdate && (
                <Badge
                  data-testid={`marketplace-update-badge-${viewModel.slug}`}
                  variant="outline"
                  className="text-amber-500 border-amber-500/40"
                >
                  {t.skills.marketplaceUpdateAvailable}
                </Badge>
              )}
            </div>

            <div className="text-sm leading-6 text-muted-foreground break-words">
              {viewModel.summary}
            </div>

            <div className="hidden lg:flex lg:items-center lg:justify-between lg:gap-4">
              <div className="min-w-0 flex-1" />
              <MarketplaceMetricSection
                metrics={viewModel.metrics}
                locale={locale}
                viewMode="list"
                className="mt-0 justify-end"
              />
              {hasActionButtons && (
                <div className="flex items-center gap-2">
                  {actionButtons}
                </div>
              )}
            </div>
          </div>

          <div className="lg:hidden">
            <MarketplaceMetricSection metrics={viewModel.metrics} locale={locale} viewMode="list" />
            {hasActionButtons && (
              <div className="mt-3 flex items-center gap-2">
                {actionButtons}
              </div>
            )}
          </div>
        </div>
      </div>

      <MarketplaceInstallDialog
        open={!!confirmDetailViewModel}
        viewModel={confirmDetailViewModel}
        onOpenChange={(open) => {
          if (!open) setConfirmDetailViewModel(null)
        }}
        onConfirm={() => {
          setConfirmDetailViewModel(null)
          handleInstall()
        }}
      />
    </div>
  )
}
