import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createStateStorage } from '@/lib/storage'
import { applyThemeToDOM, type Theme } from '@/hooks/useTheme'
import type { Locale } from '@/i18n/context'

export type CloseAction = '' | 'minimize' | 'quit'
export type SkillsViewMode = 'grid' | 'list'

const APP_PREFERENCES_STORAGE_KEY = 'youclaw-app-preferences'

function detectDefaultLocale(): Locale {
  return navigator.language.startsWith('zh') ? 'zh' : 'en'
}

interface AppPreferencesState {
  theme: Theme
  setTheme: (theme: Theme) => void

  locale: Locale
  setLocale: (locale: Locale) => void

  lastAgentId: string
  setLastAgentId: (agentId: string) => void

  closeAction: CloseAction
  setCloseAction: (closeAction: CloseAction) => Promise<void>

  sidebarCollapsed: boolean
  toggleSidebar: () => void
  collapseSidebar: () => void
  expandSidebar: () => void

  skillsViewMode: SkillsViewMode
  setSkillsViewMode: (mode: SkillsViewMode) => void
}

export const useAppPreferencesStore = create<AppPreferencesState>()(persist((set, get) => ({
  theme: 'system',
  setTheme: (theme) => {
    set({ theme })
    applyThemeToDOM(theme)
  },

  locale: detectDefaultLocale(),
  setLocale: (locale) => {
    set({ locale })
  },

  lastAgentId: 'default',
  setLastAgentId: (lastAgentId) => set({ lastAgentId }),

  closeAction: '',
  setCloseAction: async (closeAction) => { set({ closeAction }) },

  sidebarCollapsed: false,
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed
    set({ sidebarCollapsed: next })
  },
  collapseSidebar: () => {
    set({ sidebarCollapsed: true })
  },
  expandSidebar: () => {
    set({ sidebarCollapsed: false })
  },

  skillsViewMode: 'grid',
  setSkillsViewMode: (skillsViewMode) => {
    set({ skillsViewMode })
  },
}), {
  name: APP_PREFERENCES_STORAGE_KEY,
  storage: createJSONStorage(() => createStateStorage()),
  skipHydration: true,
}))
