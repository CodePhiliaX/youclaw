import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MarkdownPreview } from '@/components/skills/authoring-shared'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { CodeXml, Eye } from 'lucide-react'

interface MarkdownAuthoringEditorProps {
  title: string
  version?: string
  description?: string
  value: string
  onChange?: (value: string) => void
  placeholder?: string
  readOnly?: boolean
  defaultMode?: 'markdown' | 'preview'
  hideHeader?: boolean
  bare?: boolean
  contentScrollable?: boolean
}

export function MarkdownAuthoringEditor({
  title,
  version,
  description,
  value,
  onChange,
  placeholder,
  readOnly = false,
  defaultMode = 'markdown',
  hideHeader = false,
  bare = false,
  contentScrollable = true,
}: MarkdownAuthoringEditorProps) {
  const { t } = useI18n()
  const [mode, setMode] = useState<'markdown' | 'preview'>(defaultMode)

  return (
    <div className={bare ? '' : 'rounded-3xl border border-border bg-background/60 p-5'}>
      <div className="mb-4 flex items-center justify-end gap-2">
        {!hideHeader && (
          <div className="mr-auto min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-sm font-semibold">{title}</div>
              {version && (
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  v{version}
                </Badge>
              )}
            </div>
            {description && (
              <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {description}
              </div>
            )}
          </div>
        )}
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t.skills.tabPreview}
            title={t.skills.tabPreview}
            className={cn(
              'h-14 w-14 rounded-3xl border border-border/70 shadow-none',
              mode === 'preview'
                ? 'bg-muted/60 text-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            )}
            onClick={() => setMode('preview')}
          >
            <Eye className="h-6 w-6" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t.skills.tabMarkdown}
            title={t.skills.tabMarkdown}
            className={cn(
              'h-14 w-14 rounded-3xl border border-border/70 shadow-none',
              mode === 'markdown'
                ? 'bg-muted/60 text-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            )}
            onClick={() => setMode('markdown')}
          >
            <CodeXml className="h-6 w-6" />
          </Button>
        </div>
      </div>

      {mode === 'markdown' ? (
        readOnly ? (
          <pre className={cn(
            'whitespace-pre-wrap break-words rounded-2xl border border-border bg-background/50 p-4 font-mono text-xs leading-6',
            contentScrollable
              ? 'min-h-[620px] overflow-auto'
              : 'overflow-visible',
          )}>
            {value}
          </pre>
        ) : (
          <Textarea
            rows={30}
            className="min-h-[620px] font-mono text-xs"
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange?.(event.target.value)}
          />
        )
      ) : (
        <MarkdownPreview markdown={value} plain scrollable={contentScrollable} />
      )}
    </div>
  )
}
