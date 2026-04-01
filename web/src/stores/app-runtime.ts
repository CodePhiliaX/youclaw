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
import { getErrorMessage, logAuthClientEvent } from '@/lib/auth-debug'
import { applyThemeToDOM } from '@/hooks/useTheme'
import { toast, type ExternalToast } from 'sonner'
import { useAppPreferencesStore } from './app-preferences'

type ToastType = 'success' | 'error' | 'info' | 'warning' | 'loading' | 'default'

type NotifyOptions = {
  durationMs?: number
  id?: string | number
  description?: ExternalToast['description']
}

type NotifyInput = NotifyOptions & {
  message: string
  type?: ToastType
}

type NotifyMethod = (message: string, options?: NotifyOptions) => string | number

type NotifyFn = ((toast: NotifyInput) => string | number) & {
  success: NotifyMethod
  error: NotifyMethod
  info: NotifyMethod
  warning: NotifyMethod
  loading: NotifyMethod
  message: NotifyMethod
  dismiss: (id?: string | number) => void
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

  hydrate: () => Promise<void>
}

let authPollInterval: ReturnType<typeof setInterval> | null = null
let authPollTimeout: ReturnType<typeof setTimeout> | null = null

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

function toToastOptions(options?: NotifyOptions): ExternalToast {
  return {
    id: options?.id,
    description: options?.description,
    duration: options?.durationMs,
  }
}

function dispatchToast(
  type: ToastType,
  message: string,
  options?: NotifyOptions,
): string | number {
  const toastOptions = {
    ...toToastOptions(options),
    duration: options?.durationMs ?? (type === 'loading' ? Infinity : 4000),
  }

  switch (type) {
    case 'error':
      return toast.error(message, toastOptions)
    case 'info':
      return toast.info(message, toastOptions)
    case 'warning':
      return toast.warning(message, toastOptions)
    case 'loading':
      return toast.loading(message, toastOptions)
    case 'default':
      return toast(message, toastOptions)
    case 'success':
    default:
      return toast.success(message, toastOptions)
  }
}

export const notify = Object.assign(
  ({ message, type = 'success', ...options }: NotifyInput) => dispatchToast(type, message, options),
  {
    success: (message: string, options?: NotifyOptions) => dispatchToast('success', message, options),
    error: (message: string, options?: NotifyOptions) => dispatchToast('error', message, options),
    info: (message: string, options?: NotifyOptions) => dispatchToast('info', message, options),
    warning: (message: string, options?: NotifyOptions) => dispatchToast('warning', message, options),
    loading: (message: string, options?: NotifyOptions) => dispatchToast('loading', message, options),
    message: (message: string, options?: NotifyOptions) => dispatchToast('default', message, options),
    dismiss: (id?: string | number) => {
      toast.dismiss(id)
    },
  },
) as NotifyFn

async function ensureWindowsDeepLinkRegistration(): Promise<void> {
  if (!isTauri || !navigator.userAgent.includes('Windows')) return

  try {
    await logAuthClientEvent('info', 'Checking Windows deep-link registration', {
      platform: 'windows',
      scheme: 'youclaw',
    })
    const { register } = await import('@tauri-apps/plugin-deep-link')
    // Always re-register to ensure the registry points to the current exe,
    // not a stale path from a previous installation or dev build.
    await register('youclaw')
    await logAuthClientEvent('info', 'Windows deep-link protocol registered', {
      scheme: 'youclaw',
    })
  } catch (err) {
    await logAuthClientEvent('error', 'Failed to verify/register Windows deep-link protocol', {
      error: getErrorMessage(err),
      scheme: 'youclaw',
    })
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
      void logAuthClientEvent('info', 'Auth user fetched successfully', {
        userId: user.id,
        hasEmail: !!user.email,
      })
      set({ user, isLoggedIn: true, authLoading: false })
    } catch (err) {
      void logAuthClientEvent('warn', 'Failed to fetch auth user', {
        error: getErrorMessage(err),
      })
      set({ user: null, isLoggedIn: false, authLoading: false })
    }
  },

  login: async () => {
    try {
      set({ authLoading: true })
      await logAuthClientEvent('info', 'Login flow started', {
        isTauri,
        isWindows: navigator.userAgent.includes('Windows'),
      })

      const startPolling = () => {
        clearAuthPolling()
        void logAuthClientEvent('info', 'Started login status polling', {
          timeoutMs: 120000,
          intervalMs: 2000,
        })
        authPollInterval = setInterval(async () => {
          try {
            const { loggedIn } = await getAuthStatus()
            if (loggedIn) {
              clearAuthPolling()
              void logAuthClientEvent('info', 'Login status polling detected authenticated session')
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
          void logAuthClientEvent('warn', 'Login status polling timed out', {
            timeoutMs: 120000,
          })
          set({ authLoading: false })
        }, 120000)
      }

      if (isTauri) {
        await ensureWindowsDeepLinkRegistration()
        const { loginUrl } = await getAuthLoginUrl('tauri')
        await logAuthClientEvent('info', 'Opening external login URL for desktop auth', {
          platform: 'tauri',
          loginUrl,
        })
        await openExternal(loginUrl)
        startPolling()
      } else {
        const { loginUrl } = await getAuthLoginUrl()
        await logAuthClientEvent('info', 'Opening external login URL for web auth', {
          platform: 'web',
          loginUrl,
        })
        await openExternal(loginUrl)
        startPolling()
      }
    } catch (err) {
      await logAuthClientEvent('error', 'Login flow failed before browser redirect', {
        error: getErrorMessage(err),
      })
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
