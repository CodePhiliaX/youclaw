import { useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import type { ManagedSkill, Skill } from '@/api/client'
import { InstalledSkillDetailDialog } from '@/components/skills/InstalledSkillDetailDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import {
  LayoutGrid,
  Link2,
  List,
  PencilLine,
  Plus,
  Puzzle,
  Search,
  Trash2,
  Upload,
  ChevronDown,
} from 'lucide-react'
import {
  isInstalledSkillDraftOnly,
  isInstalledSkillEditable,
  resolveInstalledSkillFilter,
  type InstalledSkillListItem,
  type InstalledSkillSourceFilter,
} from './skills-view-types'

interface InstalledSkillsViewProps {
  builtinSkillItems: InstalledSkillListItem[]
  externalSkillItems: InstalledSkillListItem[]
  customSkillItems: InstalledSkillListItem[]
  selected: string | null
  setSelected: (value: string | null) => void
  selectedSkill?: Skill
  selectedManagedSkill?: ManagedSkill | null
  searchQuery: string
  onSearchChange: (value: string) => void
  sourceFilter: InstalledSkillSourceFilter
  onSourceFilterChange: (value: InstalledSkillSourceFilter) => void
  onCreateSkill: () => void
  onUploadSkill: () => void
  onImportFromUrl: () => void
  onEditSkill: (skillName: string) => void
  onDeleteSkill: (skillName: string) => void
  onToggleSkill: (skillName: string, enabled: boolean) => Promise<void>
  onReloadSkills: () => void
  workspaceContent?: ReactNode
}

type InstalledSkillSectionViewModel = {
  key: 'custom' | 'external' | 'builtin'
  label: string
  items: InstalledSkillListItem[]
}

type InstalledSkillsViewMode = 'grid' | 'list'

function InstalledSkillCard({
  item,
  viewMode,
  onOpen,
  onEditSkill,
  onDeleteSkill,
  onToggleSkill,
}: {
  item: InstalledSkillListItem
  viewMode: InstalledSkillsViewMode
  onOpen: (skillName: string) => void
  onEditSkill: (skillName: string) => void
  onDeleteSkill: (skillName: string) => void
  onToggleSkill: (skillName: string, enabled: boolean) => Promise<void>
}) {
  const { t } = useI18n()
  const runtimeSkill = item.runtimeSkill
  const editable = isInstalledSkillEditable(item)
  const draftOnly = isInstalledSkillDraftOnly(item)
  const interactive = Boolean(runtimeSkill || editable)
  const canShowToggle = Boolean(runtimeSkill)
  const canShowDelete = Boolean(runtimeSkill && runtimeSkill.source !== 'workspace')
  let iconClassName = 'border-border/70 bg-muted/60 text-muted-foreground'

  if (draftOnly) {
    iconClassName = 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-200'
  } else if (runtimeSkill?.enabled && runtimeSkill.usable) {
    iconClassName = 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-200'
  } else if (runtimeSkill?.enabled) {
    iconClassName = 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-200'
  }

  const handleActivate = () => {
    if (draftOnly && editable) {
      onEditSkill(item.name)
      return
    }
    if (runtimeSkill) {
      onOpen(item.name)
    }
  }

  const stopCardEvent = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleActivate()
    }
  }

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? handleActivate : undefined}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative flex overflow-hidden rounded-[24px] border text-left shadow-sm transition-all duration-200 bg-background',
        viewMode === 'grid' ? 'h-[192px] flex-col px-4 py-3' : 'min-h-0 flex-col px-5 py-4',
        interactive && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
      data-testid={`installed-skill-card-${item.name}`}
    >
      <div className="relative">
        <div className="flex min-h-12 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border', iconClassName)}>
              <Puzzle className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="truncate text-base font-semibold tracking-tight" title={item.name}>{item.name}</h3>
                {item.sourceLabel && (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {item.sourceLabel}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div
            className={cn(
              'flex min-h-10 min-w-[6.75rem] shrink-0 items-center justify-end gap-2 transition-opacity',
              canShowToggle || canShowDelete
                ? 'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100'
                : 'opacity-0',
            )}
          >
            {canShowToggle && runtimeSkill && (
              <button
                type="button"
                onClick={(event) => {
                  stopCardEvent(event)
                  void onToggleSkill(item.name, !runtimeSkill.enabled)
                }}
                aria-label={runtimeSkill.enabled ? t.skills.disable : t.skills.enable}
                title={runtimeSkill.enabled ? t.skills.disable : t.skills.enable}
                className={cn(
                  'relative inline-flex h-9 w-16 shrink-0 items-center rounded-full border px-1 transition-colors shadow-sm',
                  runtimeSkill.enabled
                    ? 'border-emerald-500/30 bg-emerald-500'
                    : 'border-border/70 bg-muted/90',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-6 w-6 rounded-full bg-background shadow transition-transform',
                    runtimeSkill.enabled ? 'translate-x-8' : 'translate-x-0',
                  )}
                />
              </button>
            )}

            {canShowDelete && (
              <button
                type="button"
                onClick={(event) => {
                  stopCardEvent(event)
                  onDeleteSkill(item.name)
                }}
                aria-label={t.common.delete}
                title={t.common.delete}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background/95 text-muted-foreground shadow-sm transition-colors hover:text-red-500"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {(item.managedSkill?.hasDraft || item.managedSkill?.hasPublished) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-16">
            {item.managedSkill?.hasDraft && <Badge variant="outline" className="text-[10px]">{t.skills.draftBadge}</Badge>}
            {item.managedSkill?.hasPublished && <Badge variant="secondary" className="text-[10px]">{t.skills.publishedBadge}</Badge>}
          </div>
        )}
      </div>
      <p className={cn(
        'pl-16 text-sm leading-5 text-muted-foreground',
        viewMode === 'grid' ? 'mt-2 line-clamp-4' : 'mt-1.5 line-clamp-2',
      )}>{item.description}</p>
    </div>
  )
}

export function InstalledSkillsView({
  builtinSkillItems,
  externalSkillItems,
  customSkillItems,
  selected,
  setSelected,
  selectedSkill,
  selectedManagedSkill,
  searchQuery,
  onSearchChange,
  sourceFilter,
  onSourceFilterChange,
  onCreateSkill,
  onUploadSkill,
  onImportFromUrl,
  onEditSkill,
  onDeleteSkill,
  onToggleSkill,
  onReloadSkills,
  workspaceContent,
}: InstalledSkillsViewProps) {
  const { t } = useI18n()
  const [viewMode, setViewMode] = useState<InstalledSkillsViewMode>('grid')

  const sourceOptions = useMemo<Array<{ value: InstalledSkillSourceFilter; label: string }>>(() => ([
    { value: 'all', label: t.skills.installedSourceAll },
    { value: 'builtin', label: t.skills.groupBuiltin },
    { value: 'external', label: t.skills.groupExternal },
    { value: 'custom', label: t.skills.groupCustom },
  ]), [t.skills])

  const query = searchQuery.trim().toLowerCase()
  const filteredItems = useMemo<InstalledSkillListItem[]>(() => {
    const sections: InstalledSkillSectionViewModel[] = [
      { key: 'builtin', label: t.skills.groupBuiltin, items: builtinSkillItems },
      { key: 'external', label: t.skills.groupExternal, items: externalSkillItems },
      { key: 'custom', label: t.skills.groupCustom, items: customSkillItems },
    ]

    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          const matchesSource = sourceFilter === 'all' || resolveInstalledSkillFilter(item) === sourceFilter
          if (!matchesSource) return false

          if (!query) return true
          const haystack = [
            item.name,
            item.description,
          ].join(' ').toLowerCase()
          return haystack.includes(query)
        }),
      }))
      .flatMap((section) => section.items)
  }, [builtinSkillItems, customSkillItems, externalSkillItems, query, sourceFilter, t.skills.groupBuiltin, t.skills.groupCustom, t.skills.groupExternal])

  const totalItems = builtinSkillItems.length + externalSkillItems.length + customSkillItems.length

  if (workspaceContent) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {workspaceContent}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="px-6 pt-2 pb-4">
        <div className="flex w-full flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder={t.skills.installedSearchPlaceholder}
                  className="h-12 border-0 bg-transparent pl-11 pr-4 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>

              <div className="h-7 w-px bg-border/70" />

              <Select value={sourceFilter} onValueChange={(value) => onSourceFilterChange(value as InstalledSkillSourceFilter)}>
                <SelectTrigger className="h-12 w-fit shrink-0 rounded-none border-0 bg-transparent px-3 shadow-none focus:ring-0 focus:ring-offset-0">
                  <SelectValue placeholder={t.skills.installedSourceAll} />
                </SelectTrigger>
                <SelectContent>
                  {sourceOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex w-full shrink-0 items-center justify-end gap-3 sm:w-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="order-1 h-12 rounded-2xl border-border/70 px-4 font-normal shadow-sm"
                    type="button"
                  >
                    <Plus className="h-4 w-4" />
                    {t.skills.newSkill}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 rounded-2xl border-border/70 p-2">
                  <DropdownMenuItem className="rounded-xl px-3 py-2.5" onClick={onCreateSkill}>
                    <PencilLine className="h-4 w-4" />
                    {t.skills.newSkillCustom}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="rounded-xl px-3 py-2.5" onClick={onUploadSkill}>
                    <Upload className="h-4 w-4" />
                    {t.skills.newSkillUpload}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="rounded-xl px-3 py-2.5" onClick={onImportFromUrl}>
                    <Link2 className="h-4 w-4" />
                    {t.skills.newSkillImportUrl}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                size="icon"
                className="order-2 hidden h-12 w-12 rounded-2xl border-border/70 shadow-sm lg:inline-flex"
                aria-label={viewMode === 'grid' ? t.skills.switchToListView : t.skills.switchToGridView}
                title={viewMode === 'grid' ? t.skills.switchToListView : t.skills.switchToGridView}
                type="button"
                onClick={() => {
                  setViewMode((current) => current === 'grid' ? 'list' : 'grid')
                }}
              >
                {viewMode === 'grid' ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
              </Button>
            </div>
          </div>

        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="flex w-full flex-col gap-8">
          {filteredItems.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[28px] border border-dashed border-border/80 bg-muted/20 px-6 py-12 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
                {totalItems === 0 ? <Puzzle className="h-7 w-7" /> : <Search className="h-7 w-7" />}
              </div>
              <h3 className="text-lg font-semibold">
                {totalItems === 0 ? t.skills.noSkills : t.skills.installedNoResults}
              </h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                {totalItems === 0 ? t.skills.installedEmptyDescription : t.skills.installedFilteredHint}
              </p>
            </div>
          ) : (
            <div className={cn(
              'gap-4',
              viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
                : 'flex flex-col',
            )}>
              {filteredItems.map((item) => (
                <InstalledSkillCard
                  key={item.name}
                  item={item}
                  viewMode={viewMode}
                  onOpen={setSelected}
                  onEditSkill={onEditSkill}
                  onDeleteSkill={onDeleteSkill}
                  onToggleSkill={onToggleSkill}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <InstalledSkillDetailDialog
        open={Boolean(selectedSkill && selected)}
        skill={selectedSkill ?? null}
        managedSkill={selectedManagedSkill}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null)
          }
        }}
        onEditSkill={onEditSkill}
        onDeleteSkill={onDeleteSkill}
        onReloadSkills={onReloadSkills}
        onToggleSkill={onToggleSkill}
      />
    </div>
  )
}
