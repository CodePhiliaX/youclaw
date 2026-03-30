import type { ManagedSkill, Skill } from '@/api/client'
import { MarkdownAuthoringEditor } from '@/components/skills/MarkdownAuthoringEditor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  CheckCircle,
  Cpu,
  Globe,
  Key,
  Link,
  PencilLine,
  Puzzle,
  Terminal,
  Trash2,
  Wrench,
  XCircle,
} from 'lucide-react'
import {
  EnvConfigRow,
  EnvToolInstallButton,
  InfoRow,
  InstallButton,
  InstallSectionHeader,
  SectionTitle,
} from './shared'
import { resolveEnvTools } from './skill-install-utils'
import {
  canDeleteInstalledSkill,
  getSkillDescription,
  isCustomEditableManagedSkill,
  resolveRuntimeSkillAvailability,
} from './shared-utils'

interface SkillDetailViewProps {
  skill: Skill
  managedSkill?: ManagedSkill | null
  onEditSkill?: (skillName: string) => void
  onDeleteSkill: (skillName: string) => void
  onReloadSkills: () => void
  onToggleSkill: (skillName: string, enabled: boolean) => Promise<void>
  className?: string
  hideHeader?: boolean
}

function getSourceUrl(skill: Skill): string | null {
  const registryMeta = skill.registryMeta
  if (!registryMeta || !('sourceUrl' in registryMeta)) {
    return null
  }
  return registryMeta.sourceUrl
}

export function SkillDetailView({
  skill,
  managedSkill,
  onEditSkill,
  onDeleteSkill,
  onReloadSkills,
  onToggleSkill,
  className,
  hideHeader = false,
}: SkillDetailViewProps) {
  const { t } = useI18n()
  const showEditButton = Boolean(isCustomEditableManagedSkill(managedSkill) && onEditSkill)
  const showDeleteButton = canDeleteInstalledSkill(skill)
  const description = getSkillDescription(skill, managedSkill, t)
  const sourceUrl = getSourceUrl(skill)
  const availability = resolveRuntimeSkillAvailability(skill)
  const envResults = skill.eligibilityDetail?.env.results ?? []
  const dependencyResults = skill.eligibilityDetail?.dependencies.results ?? []
  const missingDependencies = dependencyResults.filter((result) => !result.found).map((result) => result.name)
  const envTools = resolveEnvTools(missingDependencies)
  const manualInstallEntries = Object.entries(skill.frontmatter.install ?? {})
  const showInstallActions = skill.eligibilityDetail?.dependencies.passed === false
    && (envTools.length > 0 || manualInstallEntries.length > 0)

  return (
    <div className={cn('max-w-2xl space-y-6', className)}>
      {!hideHeader && (
        <div className="flex items-center gap-4">
          <div className={cn(
            'w-12 h-12 rounded-full flex items-center justify-center',
            !skill.enabled ? 'bg-muted' : skill.usable ? 'bg-green-500/10' : 'bg-red-500/10'
          )}>
            <Puzzle className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold truncate">{skill.name}</h1>
              {managedSkill?.hasDraft && <Badge variant="outline" className="text-[10px]">{t.skills.draftBadge}</Badge>}
              {managedSkill?.hasPublished && <Badge variant="secondary" className="text-[10px]">{t.skills.publishedBadge}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="flex items-center gap-2">
            {showEditButton && onEditSkill && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEditSkill(skill.name)}
              >
                <PencilLine className="h-4 w-4" />
                {t.common.edit}
              </Button>
            )}
            <Button
              data-testid="skill-toggle-btn"
              variant={skill.enabled ? 'secondary' : 'default'}
              size="sm"
              onClick={() => void onToggleSkill(skill.name, !skill.enabled)}
            >
              {skill.enabled ? t.skills.disable : t.skills.enable}
            </Button>
            {showDeleteButton && (
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
      )}

      <div className="rounded-md border border-border p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          {availability === 'disabled' ? (
            <>
              <XCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t.skills.disabled}</span>
            </>
          ) : availability === 'usable' ? (
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

        {envResults.length > 0 && (
          <div className="space-y-2">
            {envResults.map((result) => (
              <EnvConfigRow key={result.name} envName={result.name} configured={result.found} onSaved={onReloadSkills} />
            ))}
          </div>
        )}

        {showInstallActions && (
          <div className="pt-2 border-t border-border/50 space-y-2">
            <InstallSectionHeader onRefresh={onReloadSkills}>{t.skills.install}</InstallSectionHeader>
            {envTools.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {envTools.map((tool) => (
                  <EnvToolInstallButton key={tool} tool={tool} onInstalled={onReloadSkills} />
                ))}
              </div>
            )}
            {manualInstallEntries.length > 0 && (
              <div className="space-y-1">
                {manualInstallEntries.map(([method, command]) => (
                  <InstallButton key={method} method={method} command={command} skillName={skill.name} onInstalled={onReloadSkills} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4">
        {skill.frontmatter.version && <InfoRow label={t.skills.version} value={skill.frontmatter.version} />}
        {sourceUrl && (
          <InfoRow
            label={t.skills.sourceUrlLabel}
            value={(
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full items-start gap-1.5 text-right text-xs text-primary hover:underline break-all"
              >
                <Link className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{sourceUrl}</span>
              </a>
            )}
          />
        )}
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
          {!hideHeader && (
            <SectionTitle icon={<Cpu className="h-4 w-4" />}>{t.skills.content}</SectionTitle>
          )}
          <MarkdownAuthoringEditor
            title={skill.name}
            version={skill.frontmatter.version}
            description={description}
            value={skill.content}
            readOnly
            defaultMode="preview"
            hideHeader
            bare
            contentScrollable={false}
          />
        </div>
      )}
    </div>
  )
}
