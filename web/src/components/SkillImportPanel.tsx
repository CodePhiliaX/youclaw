import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  importFromGitHub,
  importFromRawUrl,
  probeGitHubSkillImport,
  probeRawUrlImport,
  type ImportProbeResponse,
} from '@/api/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/i18n'
import {
  extractDuplicateSkillName,
  getPrimaryImportErrorCode,
  mapImportActionError,
  normalizePastedUrl,
  resolveImportModeFromUrl,
  type SkillImportMode,
} from '@/lib/skill-import'
import { cn } from '@/lib/utils'
import { notify } from '@/stores/app'
import { Download, Loader2, Sparkles, X } from 'lucide-react'

const URL_SOURCE_EXAMPLES = [
  {
    label: 'Open Agent Skills Ecosystem',
    url: 'https://example.com/SKILL.md',
  },
  {
    label: 'ClawHub',
    url: 'https://clawhub.ai/',
  },
  {
    label: 'GitHub',
    url: 'https://github.com/owner/repo/tree/main/skills/release-helper',
  },
]

export function SkillUrlImportDialog({
  open,
  onOpenChange,
  onImported,
  existingSkillNames = [],
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void | Promise<void>
  existingSkillNames?: string[]
}) {
  const { t } = useI18n()
  const [url, setUrl] = useState('')
  const [probeResult, setProbeResult] = useState<ImportProbeResponse | null>(null)
  const [actionStatus, setActionStatus] = useState<'idle' | 'probing' | 'importing'>('idle')
  const [actionError, setActionError] = useState('')
  const existingSkillNameSet = useMemo(() => new Set(existingSkillNames), [existingSkillNames])

  useEffect(() => {
    if (!open) {
      setUrl('')
      setProbeResult(null)
      setActionStatus('idle')
      setActionError('')
    }
  }, [open])

  const normalizedUrl = normalizePastedUrl(url)
  const importMode: SkillImportMode = resolveImportModeFromUrl(normalizedUrl)
  const primaryFieldErrorCode = getPrimaryImportErrorCode(importMode, normalizedUrl)
  const primaryFieldError = primaryFieldErrorCode ? getImportErrorText(importMode, t) : ''
  const canSubmit = Boolean(normalizedUrl) && !primaryFieldError && actionStatus === 'idle'
  const suggestedSkillName = probeResult?.suggestedName?.trim() || ''
  const nameConflictMessage = suggestedSkillName && existingSkillNameSet.has(suggestedSkillName)
    ? t.skills.importSkillAlreadyExists.replace('{name}', suggestedSkillName)
    : ''
  const canImport = canSubmit && !nameConflictMessage
  const duplicateErrorPrefix = t.skills.importSkillAlreadyExists.split('{name}')[0] || t.skills.importSkillAlreadyExists
  const isDuplicateErrorMessage = Boolean(
    actionError
    && (
      actionError === t.skills.importSkillAlreadyExistsGeneric
      || actionError.startsWith(duplicateErrorPrefix)
    ),
  )
  const visibleActionError = isDuplicateErrorMessage ? '' : actionError

  const runProbe = useCallback(async (currentUrl: string, currentMode: SkillImportMode) => {
    if (currentMode === 'github') {
      return probeGitHubSkillImport({ repoUrl: currentUrl })
    }
    return probeRawUrlImport({ url: currentUrl })
  }, [])

  const runImport = useCallback(async (currentUrl: string, currentMode: SkillImportMode) => {
    if (currentMode === 'github') {
      return importFromGitHub({ repoUrl: currentUrl })
    }
    return importFromRawUrl({ url: currentUrl })
  }, [])

  const handleImport = useCallback(async () => {
    if (!canSubmit) {
      return
    }

    setActionStatus('importing')
    setActionError('')

    try {
      const nextProbeResult = probeResult ?? await runProbe(normalizedUrl, importMode)
      setProbeResult(nextProbeResult)

      const nextSuggestedName = nextProbeResult.suggestedName?.trim() || ''
      if (nextSuggestedName && existingSkillNameSet.has(nextSuggestedName)) {
        const message = t.skills.importSkillAlreadyExists.replace('{name}', nextSuggestedName)
        notify.error(message)
        return
      }

      await runImport(normalizedUrl, importMode)
      await onImported()
      onOpenChange(false)
      notify.success(t.skills.importSuccess)
    } catch (error) {
      const message = getMappedImportErrorMessage(importMode, error, t)
      setActionError(message)
      notify.error(message)
    } finally {
      setActionStatus('idle')
    }
  }, [
    canSubmit,
    existingSkillNameSet,
    importMode,
    normalizedUrl,
    onImported,
    onOpenChange,
    probeResult,
    runImport,
    runProbe,
    t,
  ])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,760px)] max-w-3xl overflow-hidden rounded-[28px] border border-border/70 bg-background p-0 shadow-2xl">
        <DialogHeader className="border-b border-border/70 px-8 py-7 text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="space-y-1">
                <DialogTitle className="text-[1.75rem] leading-tight tracking-tight">{t.skills.importUrlTitle}</DialogTitle>
              </div>
            </div>
            <button
              type="button"
              aria-label={t.common.close}
              onClick={() => onOpenChange(false)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto px-8 pt-24 pb-7">
          <div className="space-y-6">
            <div className="space-y-6">
              <label className="space-y-2">
                <div className="text-sm font-medium">{t.skills.importFieldUrl}</div>
                <Input
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value)
                    setActionError('')
                    setProbeResult(null)
                  }}
                  placeholder={t.skills.importFieldUrlPlaceholder}
                  aria-invalid={Boolean(primaryFieldError)}
                  className={cn(
                    'h-12 rounded-2xl px-4',
                    primaryFieldError && 'border-destructive/70 focus-visible:ring-destructive/60',
                  )}
                />
                {primaryFieldError && (
                  <div className="text-sm text-destructive">{primaryFieldError}</div>
                )}
              </label>

              <div className="pt-2">
                <Button
                  onClick={() => void handleImport()}
                  disabled={!canImport}
                  className="h-11 w-full justify-center rounded-2xl px-5 disabled:border disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:opacity-100"
                >
                  {actionStatus === 'importing' ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />{t.skills.importing}</>
                  ) : (
                    <><Download className="h-4 w-4" />{t.skills.importNow}</>
                  )}
                </Button>
              </div>
            </div>

            <div className="px-1 py-1">
              <div className="text-base font-semibold">{t.skills.importSupportedSourcesTitle}</div>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground">
                {URL_SOURCE_EXAMPLES.map((item) => (
                  <li key={item.label}>
                    {item.label}:
                    <span className="ml-2 font-mono text-foreground/80">{item.url}</span>
                  </li>
                ))}
              </ul>
            </div>

            {probeResult && (
              <div className="rounded-[24px] border border-border bg-muted/30 px-5 py-4 text-sm">
                <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{t.skills.importDetectionResult}</span>
                </div>
                <div className="space-y-3">
                  {probeResult.suggestedName && (
                    <div>
                      <div className="text-xs text-muted-foreground">{t.skills.importSuggestedName}</div>
                      <div className="font-medium">{probeResult.suggestedName}</div>
                    </div>
                  )}
                  {probeResult.summary && (
                    <div>
                      <div className="text-xs text-muted-foreground">{t.skills.importSummary}</div>
                      <div className="whitespace-pre-wrap">{probeResult.summary}</div>
                    </div>
                  )}
                  {nameConflictMessage && (
                    <div className="whitespace-pre-wrap rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {nameConflictMessage}
                    </div>
                  )}
                </div>
              </div>
            )}

            {visibleActionError && (
              <div className="whitespace-pre-wrap rounded-[24px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {visibleActionError}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function getImportErrorText(mode: SkillImportMode, t: ReturnType<typeof useI18n>['t']): string {
  if (mode === 'github') {
    return t.skills.importInvalidGitHubUrl
  }
  return t.skills.importInvalidUrl
}

function getMappedImportErrorMessage(
  mode: SkillImportMode,
  error: unknown,
  t: ReturnType<typeof useI18n>['t'],
): string {
  const rawMessage = error instanceof Error ? error.message : t.skills.requestFailed
  const code = mapImportActionError(mode, rawMessage)

  switch (code) {
    case 'duplicate_skill': {
      const name = extractDuplicateSkillName(rawMessage)
      return name
        ? t.skills.importSkillAlreadyExists.replace('{name}', name)
        : t.skills.importSkillAlreadyExistsGeneric
    }
    case 'invalid_github_url':
      return `${t.skills.importInvalidGitHubUrl}\n${t.skills.importGitHubUseSupportedLinks}`
    case 'invalid_url':
      return t.skills.importInvalidUrl
    case 'not_skill_directory':
      return `${t.skills.importGitHubNotSkillDirectory}\n${t.skills.importGitHubUseDirectoryOrFile}`
    case 'wrong_skill_file':
      return `${t.skills.importGitHubWrongFile}\n${t.skills.importGitHubUseDirectoryOrFile}`
    case 'not_found':
      return t.skills.importGitHubNotFound
    case 'request_failed':
    default:
      if (rawMessage && !/^API error:\s*\d+$/.test(rawMessage) && rawMessage !== t.skills.requestFailed) {
        return rawMessage
      }
      return mode === 'github' ? t.skills.importGitHubRequestFailed : t.skills.requestFailed
  }
}
