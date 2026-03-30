import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { getSolidBubbleToneClassName } from '../src/components/ui/bubble-styles'
import { SkillsBubble } from '../src/components/skills/SkillsBubble'
import { getSkillsBubbleContentClassName } from '../src/components/skills/skills-bubble-styles'
import { shouldShowInstalledSkillToggleBubble } from '../src/components/skills/skills-bubble-policy'

describe('Skills bubble styling', () => {
  test('uses a solid green tooltip style without glass treatment', () => {
    const className = getSkillsBubbleContentClassName()

    expect(className).toContain('bg-green-600')
    expect(className).toContain('text-white')
    expect(className).not.toContain('backdrop-blur')
  })

  test('uses solid semantic colors for global success and error bubbles', () => {
    const successClassName = getSolidBubbleToneClassName('success')
    const neutralClassName = getSolidBubbleToneClassName('neutral')
    const errorClassName = getSolidBubbleToneClassName('error')

    expect(successClassName).toContain('bg-green-600')
    expect(successClassName).toContain('text-white')
    expect(successClassName).not.toContain('backdrop-blur')

    expect(neutralClassName).toContain('bg-zinc-800')
    expect(neutralClassName).toContain('text-white')
    expect(neutralClassName).not.toContain('backdrop-blur')

    expect(errorClassName).toContain('bg-red-600')
    expect(errorClassName).toContain('text-white')
    expect(errorClassName).not.toContain('backdrop-blur')
  })

  test('supports a dark disabled bubble tone with white text', () => {
    const className = getSkillsBubbleContentClassName('neutral')

    expect(className).toContain('bg-zinc-800')
    expect(className).toContain('text-white')
  })

  test('renders bubble-wrapped triggers without falling back to a browser title attribute', () => {
    const html = renderToStaticMarkup(
      <SkillsBubble content="Downloads: 1.2K">
        <button type="button" aria-label="Downloads: 1.2K">1.2K</button>
      </SkillsBubble>,
    )

    expect(html).not.toContain('title=')
    expect(html).toContain('aria-label="Downloads: 1.2K"')
  })

  test('does not show a hover bubble for the installed skill toggle button', () => {
    expect(shouldShowInstalledSkillToggleBubble()).toBe(false)
  })
})
