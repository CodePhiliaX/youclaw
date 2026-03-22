import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '@/i18n'
import { useAppStore, type CloseAction } from '@/stores/app'
import type { Theme } from '@/hooks/useTheme'
import { Sun, Moon, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getSettings,
  updateSettings,
  type RegistrySelectableSource,
  type SettingsDTO,
} from '@/api/client'
import { getTauriInvoke, isTauri, updateCachedBaseUrl, savePreferredPort } from '@/api/transport'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const themeOptions: { value: Theme; labelKey: 'dark' | 'light' | 'system'; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { value: 'light', labelKey: 'light', icon: Sun },
  { value: 'dark', labelKey: 'dark', icon: Moon },
  { value: 'system', labelKey: 'system', icon: Monitor },
]

const languageOptions = [
  { value: 'en', label: 'English (US)' },
  { value: 'zh', label: '简体中文' },
] as const

const registrySourceOptions: Array<{ value: RegistrySelectableSource; label: string }> = [
  { value: 'clawhub', label: 'ClawHub' },
  { value: 'tencent', label: 'Tencent' },
]

const closeBehaviorOptions: { value: CloseAction; titleKey: 'closeBehaviorAsk' | 'closeBehaviorMinimize' | 'closeBehaviorQuit'; descriptionKey: 'closeBehaviorAskDesc' | 'closeBehaviorMinimizeDesc' | 'closeBehaviorQuitDesc' }[] = [
  { value: '', titleKey: 'closeBehaviorAsk', descriptionKey: 'closeBehaviorAskDesc' },
  { value: 'minimize', titleKey: 'closeBehaviorMinimize', descriptionKey: 'closeBehaviorMinimizeDesc' },
  { value: 'quit', titleKey: 'closeBehaviorQuit', descriptionKey: 'closeBehaviorQuitDesc' },
]

export function GeneralPanel() {
  const { t } = useI18n()
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const locale = useAppStore((s) => s.locale)
  const setLocale = useAppStore((s) => s.setLocale)
  const refreshRegistrySources = useAppStore((s) => s.refreshRegistrySources)
  const closeAction = useAppStore((s) => s.closeAction)
  const setCloseAction = useAppStore((s) => s.setCloseAction)
  const [portValue, setPortValue] = useState('62601')
  const [portSaved, setPortSaved] = useState(false)
  const [portRestarting, setPortRestarting] = useState(false)
  const [portMessage, setPortMessage] = useState('')

  const [settingsState, setSettingsState] = useState<SettingsDTO | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState('')
  const [settingsError, setSettingsError] = useState('')

  useEffect(() => {
    if (!isTauri) return
    import('@tauri-apps/plugin-store').then(({ load }) => {
      load('settings.json').then(async (store) => {
        const preferred = await store.get<string>('preferred_port')
        if (preferred) setPortValue(preferred)
      })
    }).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    setSettingsLoading(true)
    getSettings()
      .then((settings) => {
        if (!cancelled) {
          setSettingsState(settings)
          setSettingsError('')
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSettingsError(error instanceof Error ? error.message : t.skills.requestFailed)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSettingsLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [t.skills.requestFailed])

  const savePortToStore = useCallback(async (port: number) => {
    await savePreferredPort(port)
  }, [])

  const handleSavePort = useCallback(async () => {
    const port = parseInt(portValue, 10)
    if (isNaN(port) || port < 1024 || port > 65535) return
    try {
      await savePortToStore(port)
      setPortSaved(true)
      setPortMessage('')
      setTimeout(() => setPortSaved(false), 3000)
    } catch (err) {
      console.error('Failed to save port:', err)
    }
  }, [portValue, savePortToStore])

  const handleRestartSidecar = useCallback(async () => {
    const port = parseInt(portValue, 10)
    if (isNaN(port) || port < 1024 || port > 65535) return
    setPortRestarting(true)
    setPortMessage('')
    try {
      await savePortToStore(port)
      const invoke = getTauriInvoke()
      await invoke('restart_sidecar')
      updateCachedBaseUrl(`http://localhost:${port}`)
      window.location.reload()
    } catch (err) {
      const errMsg = String(err)
      updateCachedBaseUrl(`http://localhost:${port}`)
      setPortSaved(true)
      setPortRestarting(false)
      setPortMessage(errMsg.includes('Dev mode') ? t.settings.portWebHint : `Restart failed: ${errMsg}`)
    }
  }, [portValue, savePortToStore, t])

  const updateRegistryField = useCallback((source: RegistrySelectableSource, field: string, value: string | boolean) => {
    setSettingsState((current) => {
      if (!current) return current
      return {
        ...current,
        registrySources: {
          ...current.registrySources,
          [source]: {
            ...current.registrySources[source],
            [field]: value,
          },
        },
      }
    })
    setSettingsMessage('')
    setSettingsError('')
  }, [])

  const handleSaveRegistrySettings = useCallback(async () => {
    if (!settingsState) return
    setSettingsSaving(true)
    setSettingsMessage('')
    setSettingsError('')
    try {
      const updated = await updateSettings({
        defaultRegistrySource: settingsState.defaultRegistrySource,
        registrySources: settingsState.registrySources,
      })
      setSettingsState(updated)
      await refreshRegistrySources()
      setSettingsMessage(t.settings.registrySaved)
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : t.skills.requestFailed)
    } finally {
      setSettingsSaving(false)
    }
  }, [refreshRegistrySources, settingsState, t.settings.registrySaved, t.skills.requestFailed])

  return (
    <div className="space-y-8">
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
          {t.settings.appearance}
        </h4>
        <div className="grid grid-cols-3 gap-3">
          {themeOptions.map((option) => {
            const Icon = option.icon
            return (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={cn(
                  'p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-3',
                  theme === option.value
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-muted-foreground/30',
                )}
              >
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center',
                  theme === option.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}>
                  <Icon size={20} />
                </div>
                <span className="text-xs font-medium capitalize">{t.settings[option.labelKey]}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
          {t.settings.language}
        </h4>
        <div className="flex gap-3">
          {languageOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setLocale(option.value)}
              className={cn(
                'px-6 py-3 rounded-xl border-2 text-sm font-medium transition-all',
                locale === option.value
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:border-muted-foreground/30',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
            {t.settings.marketplace}
          </h4>
          <p className="text-xs text-muted-foreground">{t.settings.marketplaceHint}</p>
        </div>

        {settingsLoading && <p className="text-sm text-muted-foreground">{t.common.loading}</p>}

        {!settingsLoading && settingsState && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border p-4 space-y-3">
              <div className="space-y-1">
                <div className="text-sm font-medium">{t.settings.marketplaceDefaultSource}</div>
                <div className="text-xs text-muted-foreground">{t.settings.marketplaceDefaultSourceHint}</div>
              </div>
              <Select
                value={settingsState.defaultRegistrySource ?? '__none__'}
                onValueChange={(value) => {
                  setSettingsState((current) => current ? {
                    ...current,
                    defaultRegistrySource: value === '__none__' ? undefined : value as RegistrySelectableSource,
                  } : current)
                  setSettingsMessage('')
                  setSettingsError('')
                }}
              >
                <SelectTrigger className="w-full max-w-sm">
                  <SelectValue placeholder={t.settings.marketplaceFollowLocale} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t.settings.marketplaceFollowLocale}</SelectItem>
                  {registrySourceOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-border p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">ClawHub</div>
                    <div className="text-xs text-muted-foreground">{t.settings.marketplaceSourceClawhubHint}</div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={settingsState.registrySources.clawhub.enabled}
                      onChange={(event) => updateRegistryField('clawhub', 'enabled', event.target.checked)}
                    />
                    <span>{t.settings.marketplaceEnabled}</span>
                  </label>
                </div>
                <label className="space-y-2 block">
                  <span className="text-xs font-medium text-muted-foreground">API Base URL</span>
                  <Input
                    value={settingsState.registrySources.clawhub.apiBaseUrl}
                    onChange={(event) => updateRegistryField('clawhub', 'apiBaseUrl', event.target.value)}
                  />
                </label>
                <label className="space-y-2 block">
                  <span className="text-xs font-medium text-muted-foreground">Download URL</span>
                  <Input
                    value={settingsState.registrySources.clawhub.downloadUrl}
                    onChange={(event) => updateRegistryField('clawhub', 'downloadUrl', event.target.value)}
                  />
                </label>
                <label className="space-y-2 block">
                  <span className="text-xs font-medium text-muted-foreground">Token</span>
                  <Input
                    value={settingsState.registrySources.clawhub.token}
                    onChange={(event) => updateRegistryField('clawhub', 'token', event.target.value)}
                    placeholder={t.settings.marketplaceTokenPlaceholder}
                  />
                </label>
              </div>

              <div className="rounded-2xl border border-border p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Tencent</div>
                    <div className="text-xs text-muted-foreground">{t.settings.marketplaceSourceTencentHint}</div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={settingsState.registrySources.tencent.enabled}
                      onChange={(event) => updateRegistryField('tencent', 'enabled', event.target.checked)}
                    />
                    <span>{t.settings.marketplaceEnabled}</span>
                  </label>
                </div>
                <label className="space-y-2 block">
                  <span className="text-xs font-medium text-muted-foreground">Index URL</span>
                  <Input
                    value={settingsState.registrySources.tencent.indexUrl}
                    onChange={(event) => updateRegistryField('tencent', 'indexUrl', event.target.value)}
                  />
                </label>
                <label className="space-y-2 block">
                  <span className="text-xs font-medium text-muted-foreground">Search URL</span>
                  <Input
                    value={settingsState.registrySources.tencent.searchUrl}
                    onChange={(event) => updateRegistryField('tencent', 'searchUrl', event.target.value)}
                  />
                </label>
                <label className="space-y-2 block">
                  <span className="text-xs font-medium text-muted-foreground">Download URL</span>
                  <Input
                    value={settingsState.registrySources.tencent.downloadUrl}
                    onChange={(event) => updateRegistryField('tencent', 'downloadUrl', event.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={() => void handleSaveRegistrySettings()} disabled={settingsSaving}>
                {settingsSaving ? t.settings.saving : t.common.save}
              </Button>
              {settingsMessage && <span className="text-sm text-green-500">{settingsMessage}</span>}
              {settingsError && <span className="text-sm text-red-400">{settingsError}</span>}
            </div>
          </div>
        )}
      </div>

      {isTauri && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
            {t.settings.serverPort}
          </h4>
          <p className="text-xs text-muted-foreground mb-3">{t.settings.portHint}</p>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={1024}
              max={65535}
              value={portValue}
              onChange={(e) => { setPortValue(e.target.value); setPortSaved(false); setPortMessage('') }}
              className="w-32 rounded-xl"
            />
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={handleSavePort}
              disabled={portSaved}
            >
              {portSaved ? t.settings.portSaved : t.settings.portSave}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={handleRestartSidecar}
              disabled={portRestarting}
            >
              {portRestarting ? t.settings.portRestarting : t.settings.portRestartNow}
            </Button>
          </div>
          {portMessage && (
            <p className="text-xs text-amber-500 mt-2">{portMessage}</p>
          )}
        </div>
      )}

      {isTauri && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
            {t.settings.closeBehavior}
          </h4>
          <p className="text-xs text-muted-foreground mb-4">{t.settings.closeBehaviorHint}</p>
          <div className="grid gap-3 md:grid-cols-3">
            {closeBehaviorOptions.map((option) => (
              <button
                key={option.titleKey}
                onClick={() => void setCloseAction(option.value)}
                className={cn(
                  'rounded-2xl border-2 p-4 text-left transition-all',
                  closeAction === option.value
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-muted-foreground/30'
                )}
              >
                <div className="text-sm font-medium text-foreground">
                  {t.settings[option.titleKey]}
                </div>
                <div className="mt-2 text-xs leading-5 text-muted-foreground">
                  {t.settings[option.descriptionKey]}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
