import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteSkill,
  getMarketplaceSkills,
  getMySkills,
  getRecommendedSkills,
  getSkillAgents,
  getSkills,
  toggleSkill,
  type ManagedSkill,
  type MarketplacePage,
  type MarketplaceSort,
  type Skill,
} from '@/api/client'
import { AlertTriangle, Store } from 'lucide-react'
import { SkillEditor } from '@/components/skills/SkillEditor'
import { InstalledSkillsView } from '@/components/skills/InstalledSkillsView'
import { MarketplaceView } from '@/components/skills/MarketplaceView'
import { compareByNewestThenName, type InstalledSkillListItem } from '@/components/skills/skills-view-types'
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
import { cn } from '@/lib/utils'
import { useI18n } from '@/i18n'

type TabType = 'installed' | 'marketplace'
type BuilderState =
  | { entity: 'skill'; mode: 'create' }
  | { entity: 'skill'; mode: 'edit'; skillName: string }

export function Skills() {
  const { t } = useI18n()
  const [tab, setTab] = useState<TabType>('installed')
  const [builderState, setBuilderState] = useState<BuilderState | null>(null)

  const [skills, setSkills] = useState<Skill[]>([])
  const [mySkills, setMySkills] = useState<ManagedSkill[]>([])

  const [selected, setSelected] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleteAffectedAgents, setDeleteAffectedAgents] = useState<Array<{ id: string; name: string }>>([])

  const [marketplace, setMarketplace] = useState<MarketplacePage>({
    items: [],
    nextCursor: null,
    source: 'fallback',
    query: '',
    sort: 'trending',
  })
  const [marketplaceStatus, setMarketplaceStatus] = useState<'idle' | 'loading' | 'loading-more' | 'error'>('idle')
  const [marketplaceError, setMarketplaceError] = useState('')
  const [marketplaceAppendError, setMarketplaceAppendError] = useState('')
  const [marketplaceSort, setMarketplaceSort] = useState<MarketplaceSort>('trending')
  const [searchQuery, setSearchQuery] = useState('')

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const marketplaceScrollRef = useRef<HTMLDivElement | null>(null)
  const marketplaceLoadMoreRef = useRef<HTMLDivElement | null>(null)
  const marketplacePendingCursorRef = useRef<string | null>(null)
  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const listScrollTopRef = useRef(0)

  const sourceLabels = useMemo<Record<Skill['source'], string>>(() => ({
    workspace: t.skills.workspace,
    builtin: t.skills.builtin,
    user: t.skills.user,
  }), [t.skills.builtin, t.skills.user, t.skills.workspace])

  const externalSourceLabels = useMemo<Record<NonNullable<Skill['externalSource']>, string>>(() => ({
    marketplace: t.skills.sourceMarketplace,
    imported: t.skills.sourceImported,
    manual: t.skills.sourceManual,
  }), [t.skills.sourceImported, t.skills.sourceManual, t.skills.sourceMarketplace])

  const loadSkills = useCallback(() => {
    getSkills().then((data) => {
      setSkills(data)
      window.dispatchEvent(new CustomEvent('skills-changed'))
    }).catch(() => {})
  }, [])

  const loadMySkills = useCallback(() => {
    getMySkills().then((data) => {
      setMySkills(data)
    }).catch(() => {})
  }, [])

  const loadMarketplace = useCallback(
    (options?: { append?: boolean; cursor?: string | null; query?: string; sort?: MarketplaceSort }) => {
      const append = Boolean(options?.append)
      const query = (options?.query ?? searchQuery).trim()
      const sort = options?.sort ?? marketplaceSort
      const cursor = append ? (options?.cursor ?? marketplace.nextCursor) : null

      if (append) {
        if (!cursor || marketplacePendingCursorRef.current === cursor) return
        marketplacePendingCursorRef.current = cursor
        setMarketplaceAppendError('')
      } else {
        marketplacePendingCursorRef.current = null
        setMarketplaceAppendError('')
      }

      setMarketplaceStatus(append ? 'loading-more' : 'loading')
      setMarketplaceError('')

      const request = query
        ? getMarketplaceSkills({ query, sort, cursor, limit: 24 })
        : getRecommendedSkills().then((items) => ({
            items,
            nextCursor: null,
            source: 'fallback' as const,
            query: '',
            sort,
          }))

      request
        .then((page) => {
          setMarketplace((current) => ({
            ...page,
            items: append ? [...current.items, ...page.items] : page.items,
          }))
          setMarketplaceStatus('idle')
          if (append) {
            marketplacePendingCursorRef.current = null
          }
        })
        .catch((error) => {
          if (!append) {
            setMarketplace((current) => ({ ...current, items: [], nextCursor: null }))
            marketplacePendingCursorRef.current = null
            setMarketplaceStatus('error')
            setMarketplaceError(error instanceof Error ? error.message : t.skills.marketplaceLoadFailed)
            return
          }
          marketplacePendingCursorRef.current = null
          setMarketplaceStatus('idle')
          setMarketplaceAppendError(error instanceof Error ? error.message : t.skills.marketplaceLoadFailed)
        })
    },
    [marketplace.nextCursor, marketplaceSort, searchQuery, t.skills.marketplaceLoadFailed],
  )

  useEffect(() => {
    loadSkills()
    loadMySkills()
  }, [loadMySkills, loadSkills])

  useEffect(() => {
    if (tab !== 'marketplace') return
    const timer = window.setTimeout(() => {
      loadMarketplace({ query: searchQuery })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadMarketplace, marketplaceSort, searchQuery, tab])

  useEffect(() => {
    if (!deleteTarget) return
    getSkillAgents(deleteTarget)
      .then((res) => setDeleteAffectedAgents(res.agents))
      .catch(() => setDeleteAffectedAgents([]))
  }, [deleteTarget])

  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
  }, [])

  const selectedSkill = skills.find((skill) => skill.name === selected)
  const editableSkills = mySkills.filter((skill) => skill.editable)
  const editableSkillNames = useMemo(() => new Set(editableSkills.map((skill) => skill.name)), [editableSkills])

  const customSkillItems = useMemo<InstalledSkillListItem[]>(() => (
    [...editableSkills]
      .sort(compareByNewestThenName)
      .map((skill) => ({
        kind: 'editable',
        name: skill.name,
        description: skill.description || t.skills.skillDescriptionFallback,
        sourceLabel: t.skills.sourceCustom,
        skill,
        sortTimestamp: skill.sortTimestamp,
      }))
  ), [editableSkills, t.skills.skillDescriptionFallback, t.skills.sourceCustom])

  const externalSkillItems = useMemo<InstalledSkillListItem[]>(() => (
    skills
      .filter((skill) => (
        skill.catalogGroup === 'user'
        && skill.userSkillKind === 'external'
        && !editableSkillNames.has(skill.name)
      ))
      .sort(compareByNewestThenName)
      .map((skill) => ({
        kind: 'installed',
        name: skill.name,
        description: skill.frontmatter.description || t.skills.skillDescriptionFallback,
        sourceLabel: skill.externalSource ? externalSourceLabels[skill.externalSource] : t.skills.user,
        skill,
        sortTimestamp: skill.sortTimestamp,
      }))
  ), [editableSkillNames, externalSourceLabels, skills, t.skills.skillDescriptionFallback, t.skills.user])

  const builtinSkillItems = useMemo<InstalledSkillListItem[]>(() => (
    skills
      .filter((skill) => skill.catalogGroup === 'builtin' && !editableSkillNames.has(skill.name))
      .sort(compareByNewestThenName)
      .map((skill) => ({
        kind: 'installed',
        name: skill.name,
        description: skill.frontmatter.description || t.skills.skillDescriptionFallback,
        sourceLabel: sourceLabels[skill.source],
        skill,
        sortTimestamp: skill.sortTimestamp,
      }))
  ), [editableSkillNames, skills, sourceLabels, t.skills.skillDescriptionFallback])

  const canLoadMore = searchQuery.trim().length > 0 && Boolean(marketplace.nextCursor)
  const canAutoLoadMore = canLoadMore && !marketplaceAppendError

  const openSkillBuilder = useCallback((skillName: string) => {
    listScrollTopRef.current = listScrollRef.current?.scrollTop ?? 0
    setBuilderState({ entity: 'skill', mode: 'edit', skillName })
  }, [])

  const handleMarketplaceLoadMore = useCallback(() => {
    if (!canAutoLoadMore || marketplaceStatus !== 'idle') return
    loadMarketplace({ append: true })
  }, [canAutoLoadMore, loadMarketplace, marketplaceStatus])

  const handleMarketplaceChanged = useCallback(() => {
    loadSkills()
    loadMySkills()
    if (tab === 'marketplace') {
      loadMarketplace({ query: searchQuery })
    }
  }, [loadMarketplace, loadMySkills, loadSkills, searchQuery, tab])

  useEffect(() => {
    const container = marketplaceScrollRef.current
    const sentinel = marketplaceLoadMoreRef.current
    if (!container || !sentinel || !canAutoLoadMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          handleMarketplaceLoadMore()
        }
      },
      {
        root: container,
        threshold: 0,
        rootMargin: '0px 0px 240px 0px',
      },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [canAutoLoadMore, handleMarketplaceLoadMore])

  useEffect(() => {
    if (builderState || tab !== 'installed') return
    const container = listScrollRef.current
    if (!container) return
    const restore = window.requestAnimationFrame(() => {
      container.scrollTop = listScrollTopRef.current
    })
    return () => window.cancelAnimationFrame(restore)
  }, [builderState, tab])

  const handleSearchChange = useCallback((value: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => setSearchQuery(value), 300)
  }, [])

  const closeDeleteDialog = useCallback(() => {
    setDeleteTarget(null)
    setDeleteAffectedAgents([])
  }, [])

  return (
    <div className="flex h-full flex-col">
      {builderState ? (
        <SkillEditor
          mode={builderState.mode}
          skillName={builderState.mode === 'edit' ? builderState.skillName : null}
          onBack={() => {
            setBuilderState(null)
            setTab('installed')
          }}
          onSkillSelected={(skillName) => {
            setSelected(null)
            if (skillName) {
              setBuilderState({ entity: 'skill', mode: 'edit', skillName })
            } else {
              setBuilderState(null)
            }
          }}
          onSkillsChanged={() => {
            void loadMySkills()
            void loadSkills()
          }}
        />
      ) : (
        <>
          <div className="border-b border-border px-4 py-3">
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
                <Store className="h-3.5 w-3.5" />
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
              selected={selected}
              setSelected={setSelected}
              onEditSkill={openSkillBuilder}
              onCreateSkill={() => {
                listScrollTopRef.current = listScrollRef.current?.scrollTop ?? 0
                setSelected(null)
                setBuilderState({ entity: 'skill', mode: 'create' })
              }}
              onToggleSkill={async (skillName, enabled) => {
                await toggleSkill(skillName, enabled)
                loadSkills()
              }}
              onDeleteSkill={(skillName) => setDeleteTarget(skillName)}
              onReloadSkills={loadSkills}
              listRef={listScrollRef}
              onListScroll={(top) => {
                listScrollTopRef.current = top
              }}
            />
          )}

          {tab === 'marketplace' && (
            <MarketplaceView
              marketplace={marketplace}
              marketplaceStatus={marketplaceStatus}
              marketplaceError={marketplaceError}
              marketplaceAppendError={marketplaceAppendError}
              marketplaceSort={marketplaceSort}
              setMarketplaceSort={setMarketplaceSort}
              searchQuery={searchQuery}
              handleSearchChange={handleSearchChange}
              onChanged={handleMarketplaceChanged}
              onLoadMore={handleMarketplaceLoadMore}
              onRetryLoadMore={() => {
                setMarketplaceAppendError('')
                loadMarketplace({ append: true })
              }}
              marketplaceScrollRef={marketplaceScrollRef}
              marketplaceLoadMoreRef={marketplaceLoadMoreRef}
            />
          )}
        </>
      )}

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
                try {
                  await deleteSkill(deleteTarget)
                  setSelected(null)
                  loadSkills()
                } catch (error) {
                  console.error('Failed to delete skill:', error)
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
