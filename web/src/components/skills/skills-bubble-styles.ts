import { cn } from '../../lib/utils'
import { getSolidBubbleToneClassName } from '../ui/bubble-styles'

export type SkillsBubbleVariant = 'success' | 'neutral' | 'error'

export function getSkillsBubbleContentClassName(variant: SkillsBubbleVariant = 'success') {
  return cn(
    'rounded-xl border px-3 py-2 text-xs font-medium shadow-lg',
    getSolidBubbleToneClassName(variant),
  )
}
