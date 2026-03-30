import type { ComponentProps, ReactNode } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip'
import {
  getSkillsBubbleContentClassName,
  type SkillsBubbleVariant,
} from './skills-bubble-styles'

interface SkillsBubbleProps extends Pick<ComponentProps<typeof TooltipContent>, 'align' | 'side' | 'sideOffset'> {
  children: ReactNode
  content: ReactNode
  delayDuration?: number
  variant?: SkillsBubbleVariant
}

export function SkillsBubble({
  children,
  content,
  align = 'center',
  side = 'top',
  sideOffset = 8,
  delayDuration = 120,
  variant = 'success',
}: SkillsBubbleProps) {
  if (content == null || content === '') {
    return <>{children}</>
  }

  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          align={align}
          side={side}
          sideOffset={sideOffset}
          className={getSkillsBubbleContentClassName(variant)}
        >
          {typeof content === 'string' ? <p>{content}</p> : content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
