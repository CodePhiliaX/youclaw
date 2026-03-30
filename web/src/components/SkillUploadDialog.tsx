import { useCallback, useEffect, useRef, useState } from 'react'
import { isTauri } from '@/api/transport'
import { installSkillFromArchive, installSkillFromPath } from '@/api/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/i18n'
import { extractDuplicateSkillName } from '@/lib/skill-import'
import { cn } from '@/lib/utils'
import { notify } from '@/stores/app'
import { FileArchive, FolderOpen, Loader2, Upload, X } from 'lucide-react'

function isZipFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip'
}

export function SkillUploadDialog({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUploaded: () => void | Promise<void>
}) {
  const { t } = useI18n()
  const zipInputRef = useRef<HTMLInputElement | null>(null)
  const [actionStatus, setActionStatus] = useState<'idle' | 'folder' | 'archive'>('idle')
  const [actionError, setActionError] = useState('')
  const [selectionLabel, setSelectionLabel] = useState('')
  const [isDragActive, setIsDragActive] = useState(false)

  useEffect(() => {
    if (!open) {
      setActionStatus('idle')
      setActionError('')
      setSelectionLabel('')
      setIsDragActive(false)
    }
  }, [open])

  const runUpload = useCallback(async (kind: 'folder' | 'archive', label: string, runner: () => Promise<void>) => {
    setActionStatus(kind)
    setActionError('')
    setSelectionLabel(label)

    try {
      await runner()
      await onUploaded()
      onOpenChange(false)
      notify.success(t.skills.uploadSuccess)
    } catch (error) {
      const message = getUploadErrorMessage(error, t)
      setActionError(message)
      notify.error(message)
    } finally {
      setActionStatus('idle')
    }
  }, [onOpenChange, onUploaded, t])

  const handleDirectoryPick = useCallback(async () => {
    if (!isTauri || actionStatus !== 'idle') {
      return
    }

    const { open } = await import('@tauri-apps/plugin-dialog')
    const result = await open({
      directory: true,
      multiple: false,
    })

    if (!result || Array.isArray(result)) {
      return
    }

    const selectedPath = result.trim()
    if (!selectedPath) {
      return
    }

    await runUpload('folder', selectedPath, async () => {
      await installSkillFromPath({ sourcePath: selectedPath })
    })
  }, [actionStatus, runUpload])

  const handleArchiveFile = useCallback(async (file: File | null | undefined) => {
    if (!file || actionStatus !== 'idle') {
      return
    }

    if (!isZipFile(file)) {
      setActionError(t.skills.uploadInvalidArchive)
      notify.error(t.skills.uploadInvalidArchive)
      return
    }

    await runUpload('archive', file.name, async () => {
      await installSkillFromArchive(file)
    })
  }, [actionStatus, runUpload, t.skills.uploadInvalidArchive])

  const busy = actionStatus !== 'idle'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[min(92vw,760px)] max-w-3xl overflow-hidden rounded-[28px] border border-border/70 bg-background p-0 shadow-2xl">
          <DialogHeader className="border-b border-border/70 px-8 py-7 text-left">
            <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="space-y-1">
                <DialogTitle className="text-[1.75rem] leading-tight tracking-tight">{t.skills.uploadSkillTitle}</DialogTitle>
                <DialogDescription>{t.skills.uploadSkillDescription}</DialogDescription>
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

        <div className="max-h-[70vh] overflow-y-auto px-8 py-7">
          <div className="space-y-6">
            <div
              role="button"
              tabIndex={busy ? -1 : 0}
              onClick={() => {
                if (!busy) {
                  zipInputRef.current?.click()
                }
              }}
              onKeyDown={(event) => {
                if (busy) {
                  return
                }
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  zipInputRef.current?.click()
                }
              }}
              onDragEnter={(event) => {
                event.preventDefault()
                if (!busy) {
                  setIsDragActive(true)
                }
              }}
              onDragOver={(event) => {
                event.preventDefault()
                if (!busy) {
                  setIsDragActive(true)
                }
              }}
              onDragLeave={(event) => {
                event.preventDefault()
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  return
                }
                setIsDragActive(false)
              }}
              onDrop={(event) => {
                event.preventDefault()
                setIsDragActive(false)
                if (busy) {
                  return
                }
                const [file] = Array.from(event.dataTransfer.files)
                void handleArchiveFile(file)
              }}
              className={cn(
                'flex w-full flex-col items-center justify-center rounded-[28px] border border-dashed px-6 py-12 text-center transition-colors',
                isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-border/80 bg-muted/10 hover:bg-muted/20',
                !busy && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-background shadow-sm">
                {busy ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <Upload className="h-8 w-8 text-muted-foreground" />}
              </div>
              <div className="text-[1.85rem] font-semibold tracking-tight">{t.skills.uploadDropTitle}</div>
              <div className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                {t.skills.uploadDropHint}
              </div>
              <div
                className="mt-5 flex flex-wrap items-center justify-center gap-3"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-2xl px-5"
                  disabled={busy}
                  onClick={() => {
                    zipInputRef.current?.click()
                  }}
                >
                  <FileArchive className="h-4 w-4" />
                  {t.skills.uploadChooseZip}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-2xl px-5"
                  disabled={busy || !isTauri}
                  onClick={() => {
                    void handleDirectoryPick()
                  }}
                >
                  <FolderOpen className="h-4 w-4" />
                  {t.skills.uploadChooseFolder}
                </Button>
              </div>
            </div>

            {!isTauri && (
              <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                {t.skills.uploadFolderDesktopOnly}
              </div>
            )}

            {selectionLabel && (
              <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-sm">
                <div className="text-xs text-muted-foreground">{t.skills.uploadSelectedSource}</div>
                <div className="mt-1 break-all font-medium">{selectionLabel}</div>
              </div>
            )}

            <div className="rounded-[24px] bg-background">
              <div className="text-[1.9rem] font-semibold tracking-tight">{t.skills.uploadRequirementsTitle}</div>
              <ul className="mt-4 list-disc space-y-3 pl-6 text-lg leading-8 text-muted-foreground">
                <li>{t.skills.uploadRequirementContainsSkill}</li>
                <li>{t.skills.uploadRequirementFrontmatter}</li>
              </ul>
            </div>

            {actionError && (
              <div className="whitespace-pre-wrap rounded-[24px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {actionError}
              </div>
            )}

            <input
              ref={zipInputRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(event) => {
                const [file] = Array.from(event.target.files ?? [])
                event.currentTarget.value = ''
                void handleArchiveFile(file)
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function getUploadErrorMessage(error: unknown, t: ReturnType<typeof useI18n>['t']): string {
  const rawMessage = error instanceof Error ? error.message : t.skills.uploadRequestFailed
  const duplicateName = extractDuplicateSkillName(rawMessage)

  if (duplicateName) {
    return t.skills.importSkillAlreadyExists.replace('{name}', duplicateName)
  }

  if (rawMessage === 'File is required') {
    return t.skills.uploadFileRequired
  }

  if (rawMessage === 'Uploaded file must be a .zip archive') {
    return t.skills.uploadInvalidArchive
  }

  if (rawMessage === 'Archive does not contain a root SKILL.md') {
    return t.skills.uploadArchiveMissingSkill
  }

  if (rawMessage && !/^API error:\s*\d+$/.test(rawMessage) && rawMessage !== t.skills.requestFailed) {
    return rawMessage
  }

  return t.skills.uploadRequestFailed
}
