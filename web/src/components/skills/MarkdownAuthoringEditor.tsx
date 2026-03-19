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
  onChange: (value: string) => void
  placeholder?: string
}

export function MarkdownAuthoringEditor({
  title,
  version,
  description,
  value,
  onChange,
  placeholder,
}: MarkdownAuthoringEditorProps) {
  const [mode, setMode] = useState<'markdown' | 'preview'>('markdown')

  return (
    <div className="rounded-3xl border border-border bg-background/60 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
        <div className="min-w-0 flex-1">
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
        <Textarea
          rows={30}
          className="min-h-[620px] font-mono text-xs"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <MarkdownPreview markdown={value} plain />
      )}
    </div>
  )
}
