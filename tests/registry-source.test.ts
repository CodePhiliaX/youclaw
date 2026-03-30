import { describe, expect, test } from 'bun:test'
import { resolveMarketplaceActionSource } from '../web/src/lib/registry-source.ts'

const allSources: Array<{ id: 'recommended' | 'clawhub' | 'tencent' }> = [
  { id: 'recommended' },
  { id: 'clawhub' },
  { id: 'tencent' },
]

describe('registry source helpers', () => {
  test('recommended installs use Tencent for zh locale', () => {
    expect(resolveMarketplaceActionSource('recommended', allSources, 'zh')).toBe('tencent')
  })

  test('recommended installs use ClawHub for non-zh locales', () => {
    expect(resolveMarketplaceActionSource('recommended', allSources, 'en')).toBe('clawhub')
  })

  test('explicit remote source overrides locale defaults', () => {
    expect(resolveMarketplaceActionSource('tencent', allSources, 'en')).toBe('tencent')
    expect(resolveMarketplaceActionSource('clawhub', allSources, 'zh')).toBe('clawhub')
  })
})
