import type { ManagedSkill, Skill } from '@/api/client'
import { SkillDetailView } from '@/components/skills/SkillDetailView'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import {
  getInstalledSkillSourceLabel,
  getSkillDescription,
  isCustomEditableManagedSkill,
} from './shared-utils'
import {
  PencilLine,
  Puzzle,
  Trash2,
  X,
} from 'lucide-react'

interface InstalledSkillDetailDialogProps {
  open: boolean
  skill: Skill | null
  managedSkill?: ManagedSkill | null
  onOpenChange: (open: boolean) => void
  onEditSkill?: (skillName: string) => void
  onDeleteSkill: (skillName: string) => void
  onReloadSkills: () => void
  onToggleSkill: (skillName: string, enabled: boolean) => Promise<void>
}

export function InstalledSkillDetailDialog({
  open,
  skill,
  managedSkill,
  onOpenChange,
  onEditSkill,
  onDeleteSkill,
  onReloadSkills,
  onToggleSkill,
}: InstalledSkillDetailDialogProps) {
  const { t } = useI18n()

  if (!skill) {
    return null
  }

  const showEditButton = Boolean(isCustomEditableManagedSkill(managedSkill) && onEditSkill)
  const showDeleteButton = skill.source !== 'workspace'
  const description = getSkillDescription(skill, managedSkill, t)
  const isBuiltinSkill = skill.source === 'builtin'
  const hasTopMetaBadges = Boolean(!isBuiltinSkill || managedSkill?.hasDraft || managedSkill?.hasPublished)
  const sourceLabel = getInstalledSkillSourceLabel(skill, managedSkill, t)
  const hasMetaBadges = Boolean((skill.registryMeta?.version || skill.frontmatter.version) || !isBuiltinSkill)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(90vh,900px)] w-[min(96vw,1120px)] max-w-6xl overflow-hidden rounded-[28px] border border-border/70 bg-background p-0 shadow-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>{skill.name}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),transparent)] px-6 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-4">
                <div className="flex items-start gap-4">
                  <div className={cn(
                    'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border',
                    !skill.enabled
                      ? 'border-border/70 bg-muted text-muted-foreground'
                      : skill.usable
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300',
                  )}>
                    <Puzzle className="h-7 w-7" />
                  </div>

                  <div className="min-w-0 space-y-2">
                    {hasTopMetaBadges && (
                      <div className="flex flex-wrap items-center gap-2">
                        {!isBuiltinSkill && (
                          <Badge variant="outline" className="border-border/70 bg-background/80 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                            {managedSkill?.userSkillKind === 'custom' ? t.skills.groupCustom : t.skills.groupExternal}
                          </Badge>
                        )}
                        {managedSkill?.hasDraft && <Badge variant="outline" className="text-[10px]">{t.skills.draftBadge}</Badge>}
                        {managedSkill?.hasPublished && <Badge variant="secondary" className="text-[10px]">{t.skills.publishedBadge}</Badge>}
                      </div>
                    )}

                    <div className="space-y-1">
                      <h2 className="text-[1.85rem] font-semibold leading-tight tracking-tight">{skill.name}</h2>
                      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
                    </div>

                    {hasMetaBadges && (
                      <div className="flex flex-wrap items-center gap-2">
                      {(skill.registryMeta?.version || skill.frontmatter.version) && (
                        <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px] font-medium">
                          {skill.registryMeta?.version || skill.frontmatter.version}
                        </Badge>
                      )}
                      {!isBuiltinSkill && (
                        <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px] font-medium">
                          {sourceLabel}
                        </Badge>
                      )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 lg:max-w-[40%]">
                {showEditButton && onEditSkill && (
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => onEditSkill(skill.name)}
                  >
                    <PencilLine className="h-4 w-4" />
                    {t.common.edit}
                  </Button>
                )}
                <Button
                  data-testid="skill-toggle-btn"
                  variant={skill.enabled ? 'secondary' : 'default'}
                  className="rounded-xl"
                  onClick={() => void onToggleSkill(skill.name, !skill.enabled)}
                >
                  {skill.enabled ? t.skills.disable : t.skills.enable}
                </Button>
                {showDeleteButton && (
                  <Button
                    data-testid="skill-delete-btn"
                    variant="outline"
                    className="rounded-xl border-red-500/20 text-red-500 hover:bg-red-500/10 hover:text-red-500"
                    onClick={() => onDeleteSkill(skill.name)}
                  >
                    <Trash2 className="h-4 w-4" />
                    {t.common.delete}
                  </Button>
                )}
                <DialogClose className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-background/95 text-muted-foreground transition-colors hover:text-foreground">
                  <X className="h-4 w-4" />
                  <span className="sr-only">{t.common.close}</span>
                </DialogClose>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <SkillDetailView
              skill={skill}
              managedSkill={managedSkill}
              onEditSkill={onEditSkill}
              onDeleteSkill={onDeleteSkill}
              onReloadSkills={onReloadSkills}
              onToggleSkill={onToggleSkill}
              className="max-w-none"
              hideHeader
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
