import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { MarkdownPreview } from '@/components/skills/authoring-shared'

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
}: MarkdownAuthoringEditorProps) {
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
            size="sm"
            variant={mode === 'preview' ? 'secondary' : 'outline'}
            onClick={() => setMode('preview')}
          >
            Preview
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'markdown' ? 'secondary' : 'outline'}
            onClick={() => setMode('markdown')}
          >
            Markdown
          </Button>
        </div>
      </div>

      {mode === 'markdown' ? (
        readOnly ? (
          <pre className="min-h-[620px] overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-border bg-background/50 p-4 font-mono text-xs leading-6">
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
        <MarkdownPreview markdown={value} plain />
      )}
    </div>
  )
}
