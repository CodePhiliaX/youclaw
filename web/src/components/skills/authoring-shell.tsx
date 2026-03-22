import { useEffect, useState, type ReactNode } from 'react'
import { CheckCircle2, ChevronDown, FileWarning } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  type BuilderStepItem,
  BuilderStepGrid,
  EditorPageHeader,
  ErrorBanner,
  SectionCard,
} from '@/components/skills/authoring-shared'

export interface AuthoringShellProps {
  onBack: () => void
  backLabel: string
  title: string
  titleLeading?: ReactNode
  badges?: ReactNode
  description?: string
  meta?: ReactNode
  actions?: ReactNode
  error?: string
  steps: BuilderStepItem[]
  onStepSelect: (id: string) => void
  stepGridClassName?: string
  stepsContent?: ReactNode
  children: ReactNode
  overlays?: ReactNode
}

export function AuthoringShell({
  onBack,
  backLabel,
  title,
  titleLeading,
  badges,
  description,
  meta,
  actions,
  error,
  steps,
  onStepSelect,
  stepGridClassName,
  stepsContent,
  children,
  overlays,
}: AuthoringShellProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <EditorPageHeader
        onBack={onBack}
        backLabel={backLabel}
        title={title}
        titleLeading={titleLeading}
        badges={badges}
        description={description}
        meta={meta}
        actions={actions}
      />

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-6xl space-y-6">
          {error && <ErrorBanner message={error} />}
          {stepsContent ?? (
            <BuilderStepGrid
              steps={steps}
              onStepSelect={onStepSelect}
              className={stepGridClassName}
            />
          )}
          {children}
        </div>
      </div>

      {overlays}
    </div>
  )
}

export interface ValidationMessageItem {
  field?: string
  message: string
  kind: 'error' | 'warning'
}

interface PublishReviewPanelProps {
  title: string
  description: string
  runValidationLabel: string
  validationPendingLabel: string
  validationCleanLabel: string
  hasValidation: boolean
  messages: ValidationMessageItem[]
  onRunValidation: () => void
  children?: ReactNode
}

export function PublishReviewPanel({
  title,
  description,
  runValidationLabel,
  validationPendingLabel,
  validationCleanLabel,
  hasValidation,
  messages,
  onRunValidation,
  children,
}: PublishReviewPanelProps) {
  const [expanded, setExpanded] = useState(true)
  const validationTone = !hasValidation
    ? 'border-border bg-background/70'
    : messages.length === 0
      ? 'border-green-500/30 bg-green-500/10'
      : 'border-red-500/30 bg-red-500/10'

  useEffect(() => {
    setExpanded(messages.length > 0)
  }, [messages.length])

  return (
    <SectionCard title={title} description={description}>
      <div className="space-y-5">
        <div className={cn('overflow-hidden rounded-2xl border', validationTone)}>
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              onClick={() => {
                if (!hasValidation || messages.length === 0) return
                setExpanded((current) => !current)
              }}
            >
              {!hasValidation ? (
                <div className="text-sm text-muted-foreground">{validationPendingLabel}</div>
              ) : messages.length === 0 ? (
                <div className="inline-flex items-center gap-2 text-sm text-green-300">
                  <CheckCircle2 className="h-4 w-4" />
                  {validationCleanLabel}
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 text-sm text-red-200">
                  <FileWarning className="h-4 w-4" />
                  {messages.length} {messages.length === 1 ? 'issue' : 'issues'}
                </div>
              )}
              {hasValidation && messages.length > 0 && (
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                    expanded && 'rotate-180',
                  )}
                />
              )}
            </button>
            <Button variant="outline" size="sm" onClick={onRunValidation}>
              <FileWarning className="h-4 w-4" />
              {runValidationLabel}
            </Button>
          </div>

          {hasValidation && messages.length > 0 && expanded && (
            <div className="border-t border-border/60">
              {messages.map((item, index) => (
                <div
                  key={`${item.kind}-${index}`}
                  className={cn(
                    'px-4 py-3 text-sm',
                    index > 0 && 'border-t border-border/40',
                    item.kind === 'error' ? 'text-red-100' : 'text-yellow-100',
                  )}
                >
                  {item.field ? `${item.field}: ` : ''}{item.message}
                </div>
              ))}
            </div>
          )}
        </div>

        {children && (
          <div className="border-t border-border/60 pt-5">
            {children}
          </div>
        )}
      </div>
    </SectionCard>
  )
}

interface DuplicateNameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  fieldLabel: string
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  cancelLabel: string
  confirmLabel: string
  onConfirm: () => void
}

export function DuplicateNameDialog({
  open,
  onOpenChange,
  title,
  description,
  fieldLabel,
  value,
  onValueChange,
  placeholder,
  cancelLabel,
  confirmLabel,
  onConfirm,
}: DuplicateNameDialogProps) {
  const canConfirm = Boolean(value.trim())

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,520px)] space-y-5 p-6">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="text-sm font-medium">{fieldLabel}</div>
          <Input
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder={placeholder}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canConfirm) {
                onConfirm()
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
          <Button onClick={onConfirm} disabled={!canConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface ConfirmDestructiveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  cancelLabel: string
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
}

export function ConfirmDestructiveDialog({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel,
  confirmLabel,
  busy,
  onConfirm,
}: ConfirmDestructiveDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(event) => {
              event.preventDefault()
              if (busy) return
              onConfirm()
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
