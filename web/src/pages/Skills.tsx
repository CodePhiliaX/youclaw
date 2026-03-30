import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  deleteSkill,
  getMySkills,
  type MarketplaceSort,
  getSkillAgents,
  getSkills,
  toggleSkill,
  type ManagedSkill,
  type Skill,
} from '@/api/client'
import { AlertTriangle, Store } from 'lucide-react'
import { SkillUrlImportDialog } from '@/components/SkillImportPanel'
import { SkillUploadDialog } from '@/components/SkillUploadDialog'
import { SkillEditor } from '@/components/skills/SkillEditor'
import { InstalledSkillsView } from '@/components/skills/InstalledSkillsView'
import { MarketplaceView } from '@/components/skills/MarketplaceView'
import { getExternalSkillSourceLabel } from '@/components/skills/shared-utils'
import {
  compareByNewestThenName,
  type InstalledSkillListItem,
  type InstalledSkillSourceFilter,
} from '@/components/skills/skills-view-types'
import { type MarketplaceChangeEvent } from '@/lib/marketplace-updates'
import { toMarketplaceResultsViewModel } from '@/lib/marketplace-view-model'
import { type TencentMarketplaceCategoryFilter } from '@/lib/tencent-marketplace-category'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useMarketplaceFeed } from '@/hooks/useMarketplaceFeed'
import { cn } from '@/lib/utils'
import { useI18n } from '@/i18n'
import {
  getRegistrySourceInfo,
  resolveMarketplaceSort,
} from '@/lib/registry-source'
import { notify, useAppRuntimeStore } from '@/stores/app'

type TabType = 'installed' | 'marketplace'
type InstalledWorkspace =
  | { kind: 'detail'; skillName: string | null }
  | { kind: 'edit'; skillName: string }

export function Skills() {
  const { t, locale } = useI18n()
  const registrySource = useAppRuntimeStore((state) => state.registrySource)
  const registrySources = useAppRuntimeStore((state) => state.registrySources)
  const setRegistrySource = useAppRuntimeStore((state) => state.setRegistrySource)
  const refreshRegistrySources = useAppRuntimeStore((state) => state.refreshRegistrySources)
  const [tab, setTab] = useState<TabType>('installed')
  const [installedWorkspace, setInstalledWorkspace] = useState<InstalledWorkspace>({ kind: 'detail', skillName: null })

  const [skills, setSkills] = useState<Skill[]>([])
  const [mySkills, setMySkills] = useState<ManagedSkill[]>([])
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleteAffectedAgents, setDeleteAffectedAgents] = useState<Array<{ id: string; name: string }>>([])

  const [marketplaceSearchQuery, setMarketplaceSearchQuery] = useState('')
  const [marketplaceSort, setMarketplaceSort] = useState<MarketplaceSort | undefined>(undefined)
  const [marketplaceCategoryFilter, setMarketplaceCategoryFilter] = useState<TencentMarketplaceCategoryFilter>('all')
  const [installedSearchQuery, setInstalledSearchQuery] = useState('')
  const [installedSourceFilter, setInstalledSourceFilter] = useState<InstalledSkillSourceFilter>('all')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)

  const activeRegistrySourceInfo = useMemo(
    () => getRegistrySourceInfo(registrySource, registrySources),
    [registrySource, registrySources],
  )
  const activeMarketplaceSort = useMemo(
    () => resolveMarketplaceSort(registrySource, registrySources, marketplaceSort),
    [marketplaceSort, registrySource, registrySources],
  )
  const supportsMarketplaceCategoryFilter = registrySource === 'tencent' || registrySource === 'recommended'
  const activeMarketplaceCategoryFilter = supportsMarketplaceCategoryFilter
    ? marketplaceCategoryFilter
    : 'all'
  const activeMarketplaceOrder = 'desc' as const

  const marketplaceFeed = useMarketplaceFeed({
    enabled: tab === 'marketplace',
    query: marketplaceSearchQuery,
    order: activeMarketplaceOrder,
    sort: activeMarketplaceSort,
    source: registrySource,
    locale,
    category: activeMarketplaceCategoryFilter === 'all' ? undefined : activeMarketplaceCategoryFilter,
    loadFailedMessage: t.skills.marketplaceLoadFailed,
  })
  const {
    activeQuery: marketplaceActiveQuery,
    appendError: marketplaceAppendError,
    applyChange: applyMarketplaceChange,
    error: marketplaceError,
    listKey: marketplaceListKey,
    loadMore: loadMoreMarketplace,
    page: marketplacePage,
    refresh: refreshMarketplace,
    status: marketplaceStatus,
  } = marketplaceFeed

  const sourceLabels = useMemo<Record<Skill['source'], string>>(() => ({
    workspace: t.skills.workspace,
    builtin: t.skills.builtin,
    user: t.skills.user,
  }), [t.skills.builtin, t.skills.user, t.skills.workspace])
  const formatSkillMessage = useCallback((template: string, skillName: string) => (
    template.replace('{name}', skillName)
  ), [])

  const refreshInstalledData = useCallback(async () => {
    const [nextSkills, nextMySkills] = await Promise.all([getSkills(), getMySkills()])
    setSkills(nextSkills)
    setMySkills(nextMySkills)
    window.dispatchEvent(new CustomEvent('skills-changed'))
    return { nextSkills, nextMySkills }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refreshInstalledData().catch(() => {})
      void refreshRegistrySources()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [refreshInstalledData, refreshRegistrySources])

  useEffect(() => {
    if (!deleteTarget) return
    getSkillAgents(deleteTarget)
      .then((res) => setDeleteAffectedAgents(res.agents))
      .catch(() => setDeleteAffectedAgents([]))
  }, [deleteTarget])

  const selectedSkillName = installedWorkspace.kind === 'detail' ? installedWorkspace.skillName : null
  const selectedSkill = skills.find((skill) => skill.name === selectedSkillName)
  const runtimeSkillsByName = useMemo(() => new Map(skills.map((skill) => [skill.name, skill])), [skills])
  const managedSkillsByName = useMemo(() => new Map(mySkills.map((skill) => [skill.name, skill])), [mySkills])
  const selectedManagedSkill = selectedSkillName ? managedSkillsByName.get(selectedSkillName) ?? null : null
  const customManagedSkills = useMemo(
    () => mySkills.filter((skill) => skill.userSkillKind === 'custom'),
    [mySkills],
  )
  const customSkillNames = useMemo(
    () => new Set(customManagedSkills.map((skill) => skill.name)),
    [customManagedSkills],
  )

  const customSkillItems = useMemo<InstalledSkillListItem[]>(() => (
    [...customManagedSkills]
      .sort(compareByNewestThenName)
      .map((skill) => ({
        kind: 'editable' as const,
        name: skill.name,
        description: skill.description || runtimeSkillsByName.get(skill.name)?.frontmatter.description || t.skills.skillDescriptionFallback,
        sourceLabel: t.skills.sourceCustom,
        skill,
        section: 'custom',
        runtimeSkill: runtimeSkillsByName.get(skill.name) ?? null,
        managedSkill: skill,
        sortTimestamp: skill.sortTimestamp ?? runtimeSkillsByName.get(skill.name)?.sortTimestamp,
      }))
  ), [customManagedSkills, runtimeSkillsByName, t.skills.skillDescriptionFallback, t.skills.sourceCustom])

  const externalSkillItems = useMemo<InstalledSkillListItem[]>(() => (
    skills
      .filter((skill) => (
        skill.catalogGroup === 'user'
        && skill.userSkillKind === 'external'
        && !customSkillNames.has(skill.name)
      ))
      .sort(compareByNewestThenName)
      .map((skill) => ({
        kind: 'installed' as const,
        name: skill.name,
        description: skill.frontmatter.description || t.skills.skillDescriptionFallback,
        sourceLabel: getExternalSkillSourceLabel(skill, t),
        skill,
        section: 'external',
        runtimeSkill: skill,
        managedSkill: managedSkillsByName.get(skill.name) ?? null,
        sortTimestamp: skill.sortTimestamp,
      }))
  ), [customSkillNames, managedSkillsByName, skills, t])

  const builtinSkillItems = useMemo<InstalledSkillListItem[]>(() => (
    skills
      .filter((skill) => skill.catalogGroup === 'builtin' && !customSkillNames.has(skill.name))
      .sort(compareByNewestThenName)
      .map((skill) => ({
        kind: 'installed' as const,
        name: skill.name,
        description: skill.frontmatter.description || t.skills.skillDescriptionFallback,
        sourceLabel: sourceLabels[skill.source],
        skill,
        section: 'builtin',
        runtimeSkill: skill,
        managedSkill: managedSkillsByName.get(skill.name) ?? null,
        sortTimestamp: skill.sortTimestamp,
      }))
  ), [customSkillNames, managedSkillsByName, skills, sourceLabels, t.skills.skillDescriptionFallback])

  const marketplaceResultsViewModel = useMemo(
    () => toMarketplaceResultsViewModel(
      marketplacePage,
      marketplaceActiveQuery,
      marketplaceAppendError,
      t,
    ),
    [marketplacePage, marketplaceActiveQuery, marketplaceAppendError, t],
  )

  const openSkillBuilder = useCallback((skillName: string) => {
    setInstalledWorkspace({ kind: 'edit', skillName })
  }, [])

  const handleMarketplaceLoadMore = useCallback(() => {
    void loadMoreMarketplace()
  }, [loadMoreMarketplace])

  const handleMarketplaceChanged = useCallback((change?: MarketplaceChangeEvent) => {
    applyMarketplaceChange(change)
    refreshInstalledData().catch(() => {})
    if (tab === 'marketplace') {
      void refreshMarketplace()
    }
  }, [applyMarketplaceChange, refreshInstalledData, refreshMarketplace, tab])

  const handleMarketplaceSearchChange = useCallback((value: string) => {
    setMarketplaceSearchQuery(value)
  }, [])

  const handleMarketplaceSortChange = useCallback((value: MarketplaceSort) => {
    setMarketplaceSort(value)
  }, [])

  const handleImportSuccess = useCallback(async () => {
    const existingNames = new Set(skills.map((skill) => skill.name))
    const { nextSkills } = await refreshInstalledData()
    const importedSkill = nextSkills
      .filter((skill) => skill.catalogGroup === 'user' && !existingNames.has(skill.name))
      .sort(compareByNewestThenName)[0]

    setInstalledWorkspace({
      kind: 'detail',
      skillName: importedSkill?.name ?? selectedSkillName ?? null,
    })
  }, [refreshInstalledData, selectedSkillName, skills])

  const closeDeleteDialog = useCallback(() => {
    setDeleteTarget(null)
    setDeleteAffectedAgents([])
  }, [])

  const installedWorkspaceContent = useMemo(() => {
    if (installedWorkspace.kind === 'edit') {
      return (
        <SkillEditor
          mode="edit"
          skillName={installedWorkspace.skillName}
          onBack={() => {
            setInstalledWorkspace({ kind: 'detail', skillName: installedWorkspace.skillName })
          }}
          onSkillSelected={(skillName) => {
            if (skillName) {
              setInstalledWorkspace({ kind: 'edit', skillName })
              return
            }
            setInstalledWorkspace({ kind: 'detail', skillName: null })
          }}
          onSkillsChanged={() => {
            void refreshInstalledData()
          }}
        />
      )
    }

    return undefined
  }, [installedWorkspace, refreshInstalledData])

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4 pb-2">
        <div className="inline-flex items-center gap-1 rounded-xl bg-muted/60 p-1">
          <button
            data-testid="skills-installed-tab"
            onClick={() => setTab('installed')}
            className={cn(
              'rounded-lg px-4 py-1.5 text-sm font-medium transition-all',
              tab === 'installed'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.skills.installed}
          </button>
          <button
            data-testid="skills-marketplace-tab"
            onClick={() => setTab('marketplace')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-all',
              tab === 'marketplace'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Store className="h-3 w-3" />
            {t.skills.marketplace}
          </button>
        </div>
      </div>

      {tab === 'installed' && (
        <InstalledSkillsView
          builtinSkillItems={builtinSkillItems}
          externalSkillItems={externalSkillItems}
          customSkillItems={customSkillItems}
          selectedSkill={selectedSkill}
          selectedManagedSkill={selectedManagedSkill}
          selected={selectedSkillName}
          setSelected={(skillName) => setInstalledWorkspace({ kind: 'detail', skillName })}
          searchQuery={installedSearchQuery}
          onSearchChange={setInstalledSearchQuery}
          sourceFilter={installedSourceFilter}
          onSourceFilterChange={setInstalledSourceFilter}
          onEditSkill={openSkillBuilder}
          onCreateSkill={() => {
            setIsCreateDialogOpen(true)
          }}
          onUploadSkill={() => {
            setIsUploadDialogOpen(true)
          }}
          onImportFromUrl={() => {
            setIsImportDialogOpen(true)
          }}
          onToggleSkill={async (skillName, enabled) => {
            try {
              await toggleSkill(skillName, enabled)
              await refreshInstalledData()
              notify.success(
                formatSkillMessage(
                  enabled ? t.skills.skillEnabledSuccess : t.skills.skillDisabledSuccess,
                  skillName,
                ),
              )
            } catch (error) {
              notify.error(
                error instanceof Error && error.message
                  ? error.message
                  : formatSkillMessage(
                    enabled ? t.skills.skillEnableFailed : t.skills.skillDisableFailed,
                    skillName,
                  ),
              )
            }
          }}
          onDeleteSkill={(skillName) => setDeleteTarget(skillName)}
          onReloadSkills={() => {
            void refreshInstalledData()
          }}
          workspaceContent={installedWorkspaceContent}
        />
      )}

      {tab === 'marketplace' && (
        <MarketplaceView
          resultsViewModel={marketplaceResultsViewModel}
          marketplaceStatus={marketplaceStatus}
          marketplaceError={marketplaceError}
          marketplaceAppendError={marketplaceAppendError}
          registrySource={registrySource}
          registrySourceInfo={activeRegistrySourceInfo}
          registrySources={registrySources}
          onRegistrySourceChange={setRegistrySource}
          marketplaceSort={activeMarketplaceSort}
          onMarketplaceSortChange={handleMarketplaceSortChange}
          marketplaceCategoryFilter={activeMarketplaceCategoryFilter}
          onMarketplaceCategoryFilterChange={setMarketplaceCategoryFilter}
          searchQuery={marketplaceSearchQuery}
          handleSearchChange={handleMarketplaceSearchChange}
          onChanged={handleMarketplaceChanged}
          onLoadMore={handleMarketplaceLoadMore}
          onRetryLoadMore={() => {
            void loadMoreMarketplace()
          }}
          listKey={marketplaceListKey}
        />
      )}

      <SkillUploadDialog
        open={isUploadDialogOpen}
        onOpenChange={setIsUploadDialogOpen}
        onUploaded={handleImportSuccess}
      />

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent
          className="h-[min(92vh,960px)] w-[min(96vw,1200px)] max-w-6xl overflow-hidden rounded-[28px] border border-border/70 bg-background p-0 shadow-2xl"
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <SkillEditor
            mode="create"
            skillName={null}
            onBack={() => {
              setIsCreateDialogOpen(false)
            }}
            onSkillSelected={(skillName) => {
              setInstalledWorkspace({ kind: 'detail', skillName })
            }}
            onSkillsChanged={() => {
              void refreshInstalledData()
            }}
          />
        </DialogContent>
      </Dialog>

      <SkillUrlImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        onImported={handleImportSuccess}
        existingSkillNames={skills.map((skill) => skill.name)}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && closeDeleteDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.skills.deleteSkill}</AlertDialogTitle>
            <AlertDialogDescription>{t.skills.confirmDeleteSkill}</AlertDialogDescription>
          </AlertDialogHeader>
          {deleteAffectedAgents.length > 0 && (
            <div className="space-y-1 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-yellow-500">
                <AlertTriangle className="h-4 w-4" />
                <span>{t.skills.deleteAffectsAgents}</span>
              </div>
              <ul className="list-inside list-disc text-sm text-muted-foreground">
                {deleteAffectedAgents.map((agent) => (
                  <li key={agent.id}>{agent.name}</li>
                ))}
              </ul>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteTarget) return
                const skillName = deleteTarget
                try {
                  await deleteSkill(skillName)
                  setInstalledWorkspace({ kind: 'detail', skillName: null })
                  await refreshInstalledData()
                  notify.success(formatSkillMessage(t.skills.skillDeleteSuccess, skillName))
                } catch (error) {
                  notify.error(
                    error instanceof Error && error.message
                      ? error.message
                      : formatSkillMessage(t.skills.skillDeleteFailed, skillName),
                  )
                }
                closeDeleteDialog()
              }}
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
