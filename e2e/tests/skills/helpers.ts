import type { Page, Route } from '@playwright/test'
import { test, expect } from '../../fixtures'

export { test, expect }

export type MarketplaceSkill = {
  slug: string
  displayName: string
  summary: string
  installed: boolean
  installedSkillName?: string
  installedVersion?: string
  latestVersion?: string | null
  hasUpdate: boolean
  downloads?: number | null
  stars?: number | null
  installs?: number | null
  ownerName?: string | null
  url?: string | null
}

export function createMarketplaceSkill(
  overrides: Partial<MarketplaceSkill> & Pick<MarketplaceSkill, 'slug' | 'displayName'>,
): MarketplaceSkill {
  const latestVersion = overrides.latestVersion ?? '1.2.0'
  const installedVersion = overrides.installedVersion

  return {
    slug: overrides.slug,
    displayName: overrides.displayName,
    summary: overrides.summary ?? `${overrides.displayName} summary`,
    installed: overrides.installed ?? false,
    installedSkillName: overrides.installedSkillName,
    installedVersion,
    latestVersion,
    hasUpdate:
      overrides.hasUpdate ??
      Boolean(installedVersion && latestVersion && installedVersion !== latestVersion),
    downloads: overrides.downloads ?? 42,
    stars: overrides.stars ?? 7,
    installs: overrides.installs ?? 3,
    ownerName: overrides.ownerName ?? null,
    url: overrides.url ?? null,
  }
}

export async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

export async function navigateToSkills(page: Page) {
  await page.getByTestId('nav-skills').click()
  await expect(page.getByTestId('skills-marketplace-tab')).toBeVisible()
}

export async function openMarketplace(page: Page) {
  await navigateToSkills(page)
  await page.getByTestId('skills-marketplace-tab').click()
}
