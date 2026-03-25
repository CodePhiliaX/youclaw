import { create } from 'zustand'
import {
  ActiveModelProvider,
  checkEnv,
  authLogout,
  getAuthLoginUrl,
  getAuthStatus,
  getAuthUser,
  getCloudStatus,
  getCreditBalance,
  getPayUrl,
  getRegistrySources,
  getSettings,
  updateProfile as apiUpdateProfile,
  updateSettings,
  type AuthUser,
  type DependencyStatus,
  type RegistrySelectableSource,
  type RegistrySourceInfo,
} from '@/api/client'
import { isTauri, openExternal } from '@/api/transport'
import { resolvePreferredRegistrySource } from '@/lib/registry-source'
import { applyThemeToDOM } from '@/hooks/useTheme'
import { useAppPreferencesStore } from './app-preferences'

type GlobalBubbleType = 'success' | 'error'

interface GlobalBubbleState {
  id: number
  message: string
  type: GlobalBubbleType
  durationMs: number
}

interface AppRuntimeState {
  cloudEnabled: boolean

  gitAvailable: boolean
  gitChecked: boolean
  recheckGit: () => Promise<boolean>

  envChecked: boolean
  envDependencies: DependencyStatus[]
  envReady: boolean
  recheckEnv: () => Promise<boolean>

  modelReady: boolean

  registrySource: RegistrySelectableSource
  registrySources: RegistrySourceInfo[]
  setRegistrySource: (source: RegistrySelectableSource) => void
  setRegistrySources: (sources: RegistrySourceInfo[]) => void
  refreshRegistrySources: () => Promise<RegistrySourceInfo[]>

  user: AuthUser | null
  isLoggedIn: boolean
  authLoading: boolean
  fetchUser: () => Promise<void>
  login: () => Promise<void>
  logout: () => Promise<void>
  updateProfile: (params: { displayName?: string; avatar?: string }) => Promise<void>

  creditBalance: number | null
  fetchCreditBalance: () => Promise<void>
  openPayPage: () => Promise<void>

  globalBubble: GlobalBubbleState | null
  showGlobalBubble: (bubble: { message: string; type?: GlobalBubbleType; durationMs?: number }) => void
  dismissGlobalBubble: () => void

  hydrate: () => Promise<void>
}

let authPollInterval: ReturnType<typeof setInterval> | null = null
let authPollTimeout: ReturnType<typeof setTimeout> | null = null
let nextGlobalBubbleId = 0

function clearAuthPolling() {
  if (authPollInterval) {
    clearInterval(authPollInterval)
    authPollInterval = null
  }
  if (authPollTimeout) {
    clearTimeout(authPollTimeout)
    authPollTimeout = null
  }
}

async function ensureWindowsDeepLinkRegistration(): Promise<void> {
  if (!isTauri || !navigator.userAgent.includes('Windows')) return

  try {
    const { isRegistered, register } = await import('@tauri-apps/plugin-deep-link')
    const registered = await isRegistered('youclaw')
    if (!registered) {
      await register('youclaw')
    }
  } catch (err) {
    console.error('Failed to verify/register deep-link protocol:', err)
  }
}

export const useAppRuntimeStore = create<AppRuntimeState>((set, get) => ({
  cloudEnabled: false,

  gitAvailable: true,
  gitChecked: false,
  recheckGit: async () => {
    await get().recheckEnv()
    return get().gitAvailable
  },

  envChecked: false,
  envDependencies: [],
  envReady: true,
  recheckEnv: async () => {
    try {
      const result = await checkEnv()
      const envReady = result.dependencies
        .filter(d => d.required)
        .every(d => d.available)
      const gitDep = result.dependencies.find(d => d.name === 'git')
      set({
        envDependencies: result.dependencies,
        envChecked: true,
        envReady,
        gitAvailable: gitDep?.available ?? true,
        gitChecked: true,
      })
      return envReady
    } catch {
      set({ envChecked: true, envReady: true, gitAvailable: true, gitChecked: true })
      return true
    }
  },

  modelReady: false,

  registrySource: 'clawhub',
  registrySources: [],
  setRegistrySource: (registrySource) => set({ registrySource }),
  setRegistrySources: (registrySources) => set({ registrySources }),
  refreshRegistrySources: async () => {
    try {
      const [settings, sources] = await Promise.all([
        getSettings(),
        getRegistrySources(),
      ])
      const locale = useAppPreferencesStore.getState().locale
      const registrySource = resolvePreferredRegistrySource(sources, settings.defaultRegistrySource, locale)
      set({ registrySources: sources, registrySource })
      return sources
    } catch {
      return get().registrySources
    }
  },

  user: null,
  isLoggedIn: false,
  authLoading: false,
  fetchUser: async () => {
    try {
      set({ authLoading: true })
      const user = await getAuthUser()
      if (!user.name) {
        user.name = `User_${user.id.slice(0, 6)}`
      }
      if (!user.avatar) {
        user.avatar = `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(user.name)}`
      }
      set({ user, isLoggedIn: true, authLoading: false })
    } catch {
      set({ user: null, isLoggedIn: false, authLoading: false })
    }
  },

  login: async () => {
    try {
      set({ authLoading: true })

      const startPolling = () => {
        clearAuthPolling()
        authPollInterval = setInterval(async () => {
          try {
            const { loggedIn } = await getAuthStatus()
            if (loggedIn) {
              clearAuthPolling()
              await get().fetchUser()
              await get().fetchCreditBalance()
              set({ authLoading: false })
            }
          } catch {
            // Continue polling
          }
        }, 2000)
        authPollTimeout = setTimeout(() => {
          clearAuthPolling()
          set({ authLoading: false })
        }, 120000)
      }

      if (isTauri) {
        await ensureWindowsDeepLinkRegistration()
        const { loginUrl } = await getAuthLoginUrl('tauri')
        await openExternal(loginUrl)
        startPolling()
      } else {
        const { loginUrl } = await getAuthLoginUrl()
        await openExternal(loginUrl)
        startPolling()
      }
    } catch (err) {
      console.error('Login failed:', err)
      set({ authLoading: false })
    }
  },

  logout: async () => {
    clearAuthPolling()
    try {
      await authLogout()
    } catch {
      // Always clear local UI state even if backend request fails
    }
    set({ user: null, isLoggedIn: false, authLoading: false, creditBalance: null })
  },

  updateProfile: async (params) => {
    const updatedUser = await apiUpdateProfile(params)
    set({ user: updatedUser })
  },

  creditBalance: null,
  fetchCreditBalance: async () => {
    try {
      const { balance } = await getCreditBalance()
      set({ creditBalance: balance })
    } catch {
      set({ creditBalance: null })
    }
  },

  openPayPage: async () => {
    try {
      if (isTauri) {
        const { payUrl } = await getPayUrl('tauri')
        await openExternal(payUrl)
      } else {
        const { payUrl } = await getPayUrl()
        await openExternal(payUrl)
      }

      const oldBalance = get().creditBalance
      const pollInterval = setInterval(async () => {
        try {
          const { balance } = await getCreditBalance()
          if (balance !== oldBalance) {
            clearInterval(pollInterval)
            set({ creditBalance: balance })
          }
        } catch {
          // Continue polling
        }
      }, 3000)

      setTimeout(() => clearInterval(pollInterval), 120000)
    } catch (err) {
      console.error('Open pay page failed:', err)
    }
  },

  globalBubble: null,
  showGlobalBubble: ({ message, type = 'success', durationMs = 4000 }) => {
    set({
      globalBubble: {
        id: ++nextGlobalBubbleId,
        message,
        type,
        durationMs,
      },
    })
  },
  dismissGlobalBubble: () => {
    set({ globalBubble: null })
  },

  hydrate: async () => {
    await useAppPreferencesStore.persist.rehydrate()
    applyThemeToDOM(useAppPreferencesStore.getState().theme)

    await get().recheckEnv()

    try {
      const [cloudStatus, settings, registrySources] = await Promise.all([
        getCloudStatus(),
        getSettings(),
        getRegistrySources().catch(() => [] as RegistrySourceInfo[]),
      ])
      const { enabled } = cloudStatus
      const locale = useAppPreferencesStore.getState().locale
      set({
        cloudEnabled: enabled,
        registrySources,
        registrySource: resolvePreferredRegistrySource(registrySources, settings.defaultRegistrySource, locale),
      })

      if (enabled) {
        const { loggedIn } = await getAuthStatus()
        if (loggedIn) {
          await get().fetchUser()
          await get().fetchCreditBalance()
        }
      }

      const { provider } = settings.activeModel

      if (!enabled && provider === ActiveModelProvider.Builtin) {
        await updateSettings({ activeModel: { provider: ActiveModelProvider.Custom } })
        set({ modelReady: settings.customModels.length > 0 })
      } else if (provider === ActiveModelProvider.Custom) {
        const model = settings.activeModel.id
          ? settings.customModels.find((m) => m.id === settings.activeModel.id)
          : settings.customModels[0]
        set({ modelReady: !!model })
      } else {
        set({ modelReady: true })
      }
    } catch {
      // Backend not ready, ignore
    }
  },
}))
