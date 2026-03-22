import type { ReactNode, RefObject } from 'react'
import { ArrowLeft, CheckCircle2, ChevronRight, Minus, Plus } from 'lucide-react'
import { MessageResponse } from '@/components/ai-elements/message'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface BuilderStepItem<StepId extends string = string> {
  id: StepId
  title: string
  description: string
  index: number
  status: 'idle' | 'active' | 'complete'
}

export function EditorPageHeader({
  onBack,
  backLabel,
  title,
  titleLeading,
  badges,
  description,
  meta,
  actions,
}: {
  onBack: () => void
  backLabel: string
  title: string
  titleLeading?: ReactNode
  badges?: ReactNode
  description?: string
  meta?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="border-b border-border pl-6 pr-20 py-5">
      <div className="flex flex-wrap items-start gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label={backLabel}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-[260px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {titleLeading}
            <h1 className="text-2xl font-semibold">{title}</h1>
            {badges}
          </div>
          {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
          {meta && <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

export function BuilderStepGrid({
  steps,
  onStepSelect,
  className,
}: {
  steps: BuilderStepItem[]
  onStepSelect: (id: string) => void
  className?: string
}) {
  return (
    <div className={cn('grid gap-3 md:grid-cols-3', className)}>
      {steps.map((step) => (
        <button
          key={step.id}
          type="button"
          onClick={() => onStepSelect(step.id)}
          className={cn(
            'rounded-2xl border px-4 py-4 text-left transition-all',
            step.status === 'active'
              ? 'border-primary bg-primary/8 shadow-sm'
              : step.status === 'complete'
                ? 'border-green-500/30 bg-green-500/5'
              : 'border-border bg-card/60 hover:border-primary/40 hover:bg-accent/30',
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold',
                step.status === 'complete'
                  ? 'border-green-500/40 bg-green-500/10 text-green-300'
                  : step.status === 'active'
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground',
              )}
            >
              {step.status === 'complete' ? <CheckCircle2 className="h-4 w-4" /> : step.index}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{step.title}</div>
                <ChevronRight
                  className={cn(
                    'h-4 w-4 shrink-0',
                    step.status === 'active'
                      ? 'text-primary'
                      : step.status === 'complete'
                        ? 'text-green-300'
                        : 'text-muted-foreground',
                  )}
                />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}

export function EditorContentFrame({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[28px] border border-border bg-card/70 p-5 shadow-sm">
      {children}
    </div>
  )
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
      {message}
    </div>
  )
}

export function Field({
  label,
  required = false,
  children,
}: {
  label: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </span>
      {children}
    </label>
  )
}

export function IntegerStepperInput({
  value,
  min = 1,
  onChange,
}: {
  value?: string
  min?: number
  onChange: (value: string | undefined) => void
}) {
  const currentValue = value ?? ''
  const parsedCurrent = Number.parseInt(currentValue || String(min), 10)
  const numericValue = Number.isFinite(parsedCurrent) ? Math.max(parsedCurrent, min) : min
  const canDecrease = numericValue > min

  const handleTextChange = (nextRaw: string) => {
    const digitsOnly = nextRaw.replace(/\D+/g, '')
    if (!digitsOnly) {
      onChange(undefined)
      return
    }
    const parsed = Number.parseInt(digitsOnly, 10)
    onChange(String(Math.max(parsed, min)))
  }

  const stepValue = (delta: number) => {
    const parsed = Number.parseInt(currentValue || String(min), 10)
    const next = Number.isFinite(parsed) ? parsed + delta : min
    onChange(String(Math.max(next, min)))
  }

  return (
    <div
      className="flex h-12 items-center gap-2 rounded-2xl border border-[var(--input)] bg-[var(--background)]/80 px-2 shadow-sm transition-all focus-within:border-[var(--ring)]/60 focus-within:ring-2 focus-within:ring-[var(--ring)]/15"
      role="group"
      aria-valuemin={min}
      aria-valuenow={numericValue}
    >
      <button
        type="button"
        onClick={() => stepValue(-1)}
        disabled={!canDecrease}
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/35 text-muted-foreground shadow-sm transition-colors',
          canDecrease ? 'hover:border-border hover:bg-accent/60 hover:text-foreground' : 'cursor-not-allowed opacity-45',
        )}
        aria-label="Decrease value"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-muted/20 px-3 py-1.5">
        <span className="rounded-md bg-background px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground shadow-sm">
          v
        </span>
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={currentValue}
          onChange={(event) => handleTextChange(event.target.value)}
          className="h-auto min-w-0 border-0 bg-transparent px-0 py-0 text-center text-base font-semibold tabular-nums shadow-none focus-visible:ring-0"
        />
      </div>
      <button
        type="button"
        onClick={() => stepValue(1)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/35 text-muted-foreground shadow-sm transition-colors hover:border-border hover:bg-accent/60 hover:text-foreground"
        aria-label="Increase value"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function SectionCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-background/60 p-5">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

export function ChecklistRow({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/70 px-3 py-3">
      <div
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full border',
          done ? 'border-green-500/40 bg-green-500/10 text-green-300' : 'border-border text-muted-foreground',
        )}
      >
        {done ? <CheckCircle2 className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-current opacity-60" />}
      </div>
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function MarkdownPreview({
  markdown,
  containerRef,
  plain = false,
}: {
  markdown: string
  containerRef?: RefObject<HTMLDivElement | null>
  plain?: boolean
}) {
  return (
    <div
      ref={containerRef}
      className={cn(
        'max-h-[560px] overflow-auto',
        plain ? '' : 'rounded-2xl border border-border bg-background/70 p-4',
      )}
    >
      <MessageResponse className="text-sm leading-7">{markdown}</MessageResponse>
    </div>
  )
}
