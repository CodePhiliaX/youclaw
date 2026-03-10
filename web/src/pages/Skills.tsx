import { useState, useEffect } from 'react'
import { getSkills } from '../api/client'
import type { Skill } from '../api/client'
import { Puzzle, CheckCircle, AlertTriangle, XCircle, FolderOpen, Globe, Cpu, Terminal, Key, Wrench } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { cn } from '../lib/utils'
import { useI18n } from '../i18n'

const sourceOrder: Skill['source'][] = ['workspace', 'project', 'user']

function EligibilityIcon({ skill }: { skill: Skill }) {
  if (skill.eligible) {
    return <CheckCircle className="h-4 w-4 text-green-400" />
  }
  if (skill.eligibilityErrors.length > 0) {
    return <XCircle className="h-4 w-4 text-red-400" />
  }
  return <AlertTriangle className="h-4 w-4 text-yellow-400" />
}

export function Skills() {
  const { t } = useI18n()
  const [skills, setSkills] = useState<Skill[]>([])
  const [selected, setSelected] = useState<string | null>(null)

  const sourceLabels: Record<Skill['source'], string> = {
    workspace: t.skills.workspace,
    project: t.skills.project,
    user: t.skills.user,
  }

  useEffect(() => {
    getSkills().then(setSkills).catch(() => {})
  }, [])

  const selectedSkill = skills.find(s => s.name === selected)

  // 按来源分组
  const grouped = sourceOrder
    .map(source => ({
      source,
      skills: skills.filter(s => s.source === source),
    }))
    .filter(g => g.skills.length > 0)

  return (
    <div className="flex h-full">
      {/* 左侧：Skill 列表 */}
      <div className="w-[260px] border-r border-border flex flex-col">
        <div className="p-3 border-b border-border">
          <h2 className="font-semibold text-sm">{t.skills.title}</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {grouped.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8">
              {t.skills.noSkills}
            </div>
          )}
          {grouped.map(group => (
            <div key={group.source}>
              <div className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {sourceLabels[group.source]}
              </div>
              <div className="space-y-0.5">
                {group.skills.map(skill => (
                  <button
                    key={skill.name}
                    onClick={() => setSelected(skill.name)}
                    className={cn(
                      'flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md text-left transition-colors',
                      selected === skill.name ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'
                    )}
                  >
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0',
                      skill.eligible ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    )}>
                      <Puzzle className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{skill.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{skill.frontmatter.description}</div>
                    </div>
                    <EligibilityIcon skill={skill} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧：Skill 详情 */}
      <div className="flex-1 p-6 overflow-y-auto">
        {selectedSkill ? (
          <div className="max-w-2xl space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
              <div className={cn(
                'w-12 h-12 rounded-full flex items-center justify-center',
                selectedSkill.eligible ? 'bg-green-500/10' : 'bg-red-500/10'
              )}>
                <Puzzle className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold">{selectedSkill.name}</h1>
                  <Badge variant={selectedSkill.source === 'workspace' ? 'default' : 'secondary'}>
                    {sourceLabels[selectedSkill.source]}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{selectedSkill.frontmatter.description}</p>
              </div>
            </div>

            {/* Eligibility status */}
            <div className="rounded-md border border-border p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                {selectedSkill.eligible ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    <span className="text-green-400">{t.skills.eligible}</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-red-400" />
                    <span className="text-red-400">{t.skills.notEligible}</span>
                  </>
                )}
              </div>
              {selectedSkill.eligibilityErrors.length > 0 && (
                <ul className="space-y-1">
                  {selectedSkill.eligibilityErrors.map((err, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-yellow-400 shrink-0" />
                      {err}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Metadata */}
            <div className="grid gap-4">
              {selectedSkill.frontmatter.version && (
                <InfoRow label={t.skills.version} value={selectedSkill.frontmatter.version} />
              )}
              <InfoRow label={t.skills.path} value={
                <span className="flex items-center gap-1 font-mono text-xs">
                  <FolderOpen className="h-3 w-3 shrink-0" />
                  <span className="truncate">{selectedSkill.path}</span>
                </span>
              } />
              {selectedSkill.frontmatter.os && selectedSkill.frontmatter.os.length > 0 && (
                <InfoRow label={t.skills.os} value={
                  <span className="flex items-center gap-1.5">
                    <Globe className="h-3 w-3 shrink-0" />
                    {selectedSkill.frontmatter.os.map(os => (
                      <Badge key={os} variant="outline" className="text-xs">{os}</Badge>
                    ))}
                  </span>
                } />
              )}
              {selectedSkill.frontmatter.dependencies && selectedSkill.frontmatter.dependencies.length > 0 && (
                <InfoRow label={t.skills.dependencies} value={
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <Terminal className="h-3 w-3 shrink-0" />
                    {selectedSkill.frontmatter.dependencies.map(dep => (
                      <Badge key={dep} variant="outline" className="text-xs font-mono">{dep}</Badge>
                    ))}
                  </span>
                } />
              )}
              {selectedSkill.frontmatter.env && selectedSkill.frontmatter.env.length > 0 && (
                <InfoRow label={t.skills.envVars} value={
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <Key className="h-3 w-3 shrink-0" />
                    {selectedSkill.frontmatter.env.map(env => (
                      <Badge key={env} variant="outline" className="text-xs font-mono">{env}</Badge>
                    ))}
                  </span>
                } />
              )}
              {selectedSkill.frontmatter.tools && selectedSkill.frontmatter.tools.length > 0 && (
                <InfoRow label={t.skills.tools} value={
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <Wrench className="h-3 w-3 shrink-0" />
                    {selectedSkill.frontmatter.tools.map(tool => (
                      <Badge key={tool} variant="outline" className="text-xs">{tool}</Badge>
                    ))}
                  </span>
                } />
              )}
            </div>

            {/* Content */}
            {selectedSkill.content && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  {t.skills.content}
                </h3>
                <pre className="rounded-md border border-border bg-muted/30 p-4 text-sm overflow-x-auto whitespace-pre-wrap font-mono">
                  {selectedSkill.content}
                </pre>
              </div>
            )}
          </div>
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

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm max-w-[65%] text-right">{value}</span>
    </div>
  )
}
