import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type { StateStorage } from 'zustand/middleware'

const storageEntries = new Map<string, string>()

Object.defineProperty(globalThis, 'navigator', {
  value: { language: 'en-US' },
  configurable: true,
})

mock.module('@/lib/storage', () => ({
  createStateStorage(): StateStorage {
    return {
      getItem: async (name: string) => storageEntries.get(name) ?? null,
      setItem: async (name: string, value: string) => {
        storageEntries.set(name, value)
      },
      removeItem: async (name: string) => {
        storageEntries.delete(name)
      },
    }
  },
}))

mock.module('@/hooks/useTheme', () => ({
  applyThemeToDOM: mock(() => {}),
}))

const { useAppPreferencesStore } = await import('../src/stores/app-preferences')

function resetPreferences() {
  useAppPreferencesStore.setState({
    theme: 'system',
    locale: 'en',
    lastAgentId: 'default',
    closeAction: '',
    sidebarCollapsed: false,
    skillsViewMode: 'grid',
  })
}

describe('useAppPreferencesStore skills view mode', () => {
  beforeEach(() => {
    storageEntries.clear()
    resetPreferences()
  })

  test('defaults to grid and persists updates', async () => {
    expect(useAppPreferencesStore.getState().skillsViewMode).toBe('grid')

    useAppPreferencesStore.getState().setSkillsViewMode('list')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(useAppPreferencesStore.getState().skillsViewMode).toBe('list')
    expect(storageEntries.get('youclaw-app-preferences')).toContain('"skillsViewMode":"list"')
  })

  test('rehydrates a saved skills view mode', async () => {
    resetPreferences()
    storageEntries.set('youclaw-app-preferences', JSON.stringify({
      state: { skillsViewMode: 'list' },
      version: 0,
    }))

    await useAppPreferencesStore.persist.rehydrate()

    expect(useAppPreferencesStore.getState().skillsViewMode).toBe('list')
  })
})
