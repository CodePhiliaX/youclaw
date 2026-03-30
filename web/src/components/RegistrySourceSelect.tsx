import type { RegistrySelectableSource, RegistrySourceInfo } from '@/api/client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/i18n'
import { getRegistrySourceLabel } from '@/lib/registry-source'
import { cn } from '@/lib/utils'

export function RegistrySourceSelect({
  sources,
  value,
  onValueChange,
  disabled = false,
  className,
}: {
  sources: RegistrySourceInfo[]
  value: RegistrySelectableSource
  onValueChange: (value: RegistrySelectableSource) => void
  disabled?: boolean
  className?: string
}) {
  const { t } = useI18n()

  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as RegistrySelectableSource)} disabled={disabled}>
      <SelectTrigger className={cn('w-full sm:w-auto sm:min-w-max', className)}>
        <SelectValue placeholder={t.skills.marketplaceSourceLabel} />
      </SelectTrigger>
      <SelectContent>
        {sources.map((source) => (
          <SelectItem key={source.id} value={source.id}>
            {getRegistrySourceLabel(source.id, sources)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
