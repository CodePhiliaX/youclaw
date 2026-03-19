import type { RefObject } from 'react'
import type { Skill } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SidePanel } from '@/components/layout/SidePanel'
import { useI18n } from '@/i18n'
import { useDragRegion } from '@/hooks/useDragRegion'
import { cn } from '@/lib/utils'
import { AlertTriangle, CheckCircle, Cpu, Globe, Key, Plus, Puzzle, Terminal, Trash2, Wrench, XCircle } from 'lucide-react'
import {
  EnvConfigRow,
  InfoRow,
  InstallButton,
  InstallSectionHeader,
  PathValue,
  SectionTitle,
  SkillListItem,
} from './shared'
import type { InstalledSkillListItem } from './skills-view-types'
import { getSkillSourceBadges } from './shared-utils'

interface InstalledSkillsViewProps {
  listRef: RefObject<HTMLDivElement | null>
  onListScroll: (scrollTop: number) => void
  builtinSkillItems: InstalledSkillListItem[]
  externalSkillItems: InstalledSkillListItem[]
  customSkillItems: InstalledSkillListItem[]
  selected: string | null
  setSelected: (value: string | null) => void
  selectedSkill?: Skill
  onCreateSkill: () => void
  onEditSkill: (skillName: string) => void
  onDeleteSkill: (skillName: string) => void
  onToggleSkill: (skillName: string, enabled: boolean) => Promise<void>
  onReloadSkills: () => void
}

export function InstalledSkillsView({
  listRef,
  onListScroll,
  builtinSkillItems,
  externalSkillItems,
  customSkillItems,
  selected,
  setSelected,
  selectedSkill,
  onCreateSkill,
  onEditSkill,
  onDeleteSkill,
  onToggleSkill,
  onReloadSkills,
}: InstalledSkillsViewProps) {
  const { t } = useI18n()
  const drag = useDragRegion()

  return (
    <div className="flex flex-1 min-h-0">
      <SidePanel>
        <div className="h-12 shrink-0 px-3 border-b border-border flex items-center justify-between gap-2" {...drag}>
          <h2 className="font-semibold text-sm">{t.skills.title}</h2>
          <Button size="sm" variant="outline" onClick={onCreateSkill}>
            <Plus className="h-4 w-4" />
            {t.skills.newSkill}
          </Button>
        </div>
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-2"
          onScroll={(event) => onListScroll(event.currentTarget.scrollTop)}
        >
          {externalSkillItems.length === 0 && customSkillItems.length === 0 && builtinSkillItems.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8">{t.skills.noSkills}</div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.skills.groupBuiltin}</div>
                {builtinSkillItems.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">{t.skills.noSkills}</div>
                ) : (
                  builtinSkillItems.map((item) => (
                    <SkillListItem key={`${item.kind}-${item.name}`} item={item} selected={selected} setSelected={setSelected} onEditSkill={onEditSkill} t={t} />
                  ))
                )}
              </div>

              <div className="space-y-2">
                <div className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.skills.groupUser}</div>
                <div className="space-y-1">
                  <div className="px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">{t.skills.groupExternal}</div>
                  {externalSkillItems.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">{t.skills.noSkills}</div>
                  ) : (
                    externalSkillItems.map((item) => (
                      <SkillListItem key={`${item.kind}-${item.name}`} item={item} selected={selected} setSelected={setSelected} onEditSkill={onEditSkill} t={t} />
                    ))
                  )}
                </div>
                <div className="space-y-1">
                  <div className="px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">{t.skills.groupCustom}</div>
                  {customSkillItems.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">{t.skills.noCustomSkills}</div>
                  ) : (
                    customSkillItems.map((item) => (
                      <SkillListItem key={`${item.kind}-${item.name}`} item={item} selected={selected} setSelected={setSelected} onEditSkill={onEditSkill} t={t} />
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </SidePanel>

      <div className="flex-1 p-6 overflow-y-auto">
        {selectedSkill ? (
          <InstalledSkillDetail
            skill={selectedSkill}
            onDeleteSkill={onDeleteSkill}
            onReloadSkills={onReloadSkills}
            onToggleSkill={onToggleSkill}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Puzzle className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>{t.skills.selectSkill}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function InstalledSkillDetail({
  skill,
  onDeleteSkill,
  onReloadSkills,
  onToggleSkill,
}: {
  skill: Skill
  onDeleteSkill: (skillName: string) => void
  onReloadSkills: () => void
  onToggleSkill: (skillName: string, enabled: boolean) => Promise<void>
}) {
  const { t } = useI18n()

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <div className={cn(
          'w-12 h-12 rounded-full flex items-center justify-center',
          !skill.enabled ? 'bg-muted' : skill.usable ? 'bg-green-500/10' : 'bg-red-500/10'
        )}>
          <Puzzle className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{skill.name}</h1>
            {getSkillSourceBadges(skill, t).map((label) => (
              <Badge key={label} variant={label === t.skills.workspace ? 'default' : 'secondary'}>
                {label}
              </Badge>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">{skill.frontmatter.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            data-testid="skill-toggle-btn"
            variant={skill.enabled ? 'secondary' : 'default'}
            size="sm"
            onClick={() => void onToggleSkill(skill.name, !skill.enabled)}
          >
            {skill.enabled ? t.skills.disable : t.skills.enable}
          </Button>
          {skill.source !== 'workspace' && (
            <Button
              data-testid="skill-delete-btn"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-red-400"
              onClick={() => onDeleteSkill(skill.name)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-md border border-border p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          {!skill.enabled ? (
            <>
              <XCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t.skills.disabled}</span>
            </>
          ) : skill.usable ? (
            <>
              <CheckCircle className="h-4 w-4 text-green-400" />
              <span className="text-green-400">{t.skills.usable}</span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4 text-yellow-400" />
              <span className="text-yellow-400">{t.skills.enabledNotReady}</span>
            </>
          )}
        </div>

        {skill.eligibilityDetail?.env.results.length > 0 && (
          <div className="space-y-2">
            {skill.eligibilityDetail.env.results.map((result) => (
              <EnvConfigRow key={result.name} envName={result.name} configured={result.found} onSaved={onReloadSkills} />
            ))}
          </div>
        )}

        {skill.eligibilityDetail?.dependencies.passed === false && skill.frontmatter.install && Object.keys(skill.frontmatter.install).length > 0 && (
          <div className="pt-2 border-t border-border/50 space-y-2">
            <InstallSectionHeader onRefresh={onReloadSkills}>{t.skills.install}</InstallSectionHeader>
            {Object.entries(skill.frontmatter.install).map(([method, command]) => (
              <InstallButton key={method} method={method} command={command} skillName={skill.name} onInstalled={onReloadSkills} />
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4">
        {skill.frontmatter.version && <InfoRow label={t.skills.version} value={skill.frontmatter.version} />}
        <InfoRow label={t.skills.path} value={<PathValue value={skill.path} />} />
        {skill.frontmatter.os && skill.frontmatter.os.length > 0 && (
          <InfoRow
            label={t.skills.os}
            value={
              <span className="flex items-center gap-1.5">
                <Globe className="h-3 w-3 shrink-0" />
                {skill.frontmatter.os.map((os) => <Badge key={os} variant="outline" className="text-xs">{os}</Badge>)}
              </span>
            }
          />
        )}
        {skill.frontmatter.dependencies && skill.frontmatter.dependencies.length > 0 && (
          <InfoRow
            label={t.skills.dependencies}
            value={
              <span className="flex items-center gap-1.5 flex-wrap">
                <Terminal className="h-3 w-3 shrink-0" />
                {skill.frontmatter.dependencies.map((dep) => <Badge key={dep} variant="outline" className="text-xs font-mono">{dep}</Badge>)}
              </span>
            }
          />
        )}
        {skill.frontmatter.env && skill.frontmatter.env.length > 0 && (
          <InfoRow
            label={t.skills.envVars}
            value={
              <span className="flex items-center gap-1.5 flex-wrap">
                <Key className="h-3 w-3 shrink-0" />
                {skill.frontmatter.env.map((env) => <Badge key={env} variant="outline" className="text-xs font-mono">{env}</Badge>)}
              </span>
            }
          />
        )}
        {skill.frontmatter.tools && skill.frontmatter.tools.length > 0 && (
          <InfoRow
            label={t.skills.tools}
            value={
              <span className="flex items-center gap-1.5 flex-wrap">
                <Wrench className="h-3 w-3 shrink-0" />
                {skill.frontmatter.tools.map((tool) => <Badge key={tool} variant="outline" className="text-xs">{tool}</Badge>)}
              </span>
            }
          />
        )}
      </div>

      {skill.content && (
        <div className="space-y-2">
          <SectionTitle icon={<Cpu className="h-4 w-4" />}>{t.skills.content}</SectionTitle>
          <pre className="rounded-md border border-border bg-muted/30 p-4 text-sm overflow-x-auto whitespace-pre-wrap font-mono">{skill.content}</pre>
        </div>
      )}
    </div>
  )
}
