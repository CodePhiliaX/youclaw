import { describe, expect, test } from 'bun:test'
import { compareByNewestThenName, resolveManagedSkillCatalogInfo } from './catalog.ts'

describe('skill catalog classification', () => {
  test('classifies marketplace user projects as external user skills', () => {
    const info = resolveManagedSkillCatalogInfo({
      source: 'user',
      editable: false,
      managed: false,
      origin: 'marketplace',
      createdAt: '2026-03-19T08:00:00.000Z',
      updatedAt: '2026-03-19T10:00:00.000Z',
      draftUpdatedAt: undefined,
    })

    expect(info.catalogGroup).toBe('user')
    expect(info.userSkillKind).toBe('external')
    expect(info.externalSource).toBe('marketplace')
    expect(info.sortTimestamp).toBe('2026-03-19T10:00:00.000Z')
  })

  test('classifies editable managed skills as custom user skills', () => {
    const info = resolveManagedSkillCatalogInfo({
      source: 'user',
      editable: true,
      managed: true,
      origin: 'duplicated',
      createdAt: '2026-03-18T09:00:00.000Z',
      updatedAt: '2026-03-18T10:00:00.000Z',
      draftUpdatedAt: '2026-03-19T08:00:00.000Z',
    })

    expect(info.catalogGroup).toBe('user')
    expect(info.userSkillKind).toBe('custom')
    expect(info.externalSource).toBeUndefined()
    expect(info.sortTimestamp).toBe('2026-03-19T08:00:00.000Z')
  })

  test('sorts by newest timestamp and then by name', () => {
    const items = [
      { name: 'beta', sortTimestamp: '2026-03-19T09:00:00.000Z' },
      { name: 'alpha', sortTimestamp: '2026-03-19T09:00:00.000Z' },
      { name: 'gamma', sortTimestamp: '2026-03-18T09:00:00.000Z' },
    ]

    items.sort(compareByNewestThenName)

    expect(items.map((item) => item.name)).toEqual(['alpha', 'beta', 'gamma'])
  })
})
