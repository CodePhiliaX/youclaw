import { useState, useEffect, useCallback, type FormEvent, type ReactNode } from 'react'
import {
  createBrowserSetupSession,
  createBrowserSetupSessionMainBridgePairing,
  connectBrowserProfileMainBridge,
  createBrowserProfileMainBridgePairing,
  createBrowserProfile,
  deleteBrowserProfile,
  deleteBrowserSetupSession,
  disconnectBrowserProfileMainBridge,
  getBrowserDiscovery,
  getBrowserMainBridgeExtensionPackage,
  getBrowserProfileMainBridge,
  getBrowserProfileRelay,
  getBrowserSetupSessionMainBridge,
  finalizeBrowserSetupSession,
  restartBrowserProfile,
  rotateBrowserProfileRelayToken,
  selectBrowserProfileMainBridgeBrowser,
  selectBrowserSetupSessionMainBridgeBrowser,
  startBrowserProfile,
  stopBrowserProfile,
  downloadBrowserMainBridgeExtensionBundle,
} from '../api/client'
import type {
  BrowserDiscoveryDTO,
  BrowserExtensionPackageDTO,
  BrowserMainBridgeDTO,
  BrowserProfileDTO,
  BrowserRelayDTO,
  BrowserSetupSessionDTO,
} from '../api/client'
import { cn } from '../lib/utils'
import { useI18n } from '../i18n'
import { useChatContext } from '../hooks/chatCtx'
import { SidePanel } from '@/components/layout/SidePanel'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertTriangle, Check, ChevronLeft, FolderOpen, Globe, Link, Play, Plus, RotateCw, Square, Trash2 } from 'lucide-react'
import { useDragRegion } from '@/hooks/useDragRegion'
import { notify } from '@/stores/app'
import { getBackendBaseUrl } from '@/api/transport'

export function BrowserProfiles() {
  const { t } = useI18n()
  const {
    browserProfiles: profiles,
    refreshBrowserProfiles,
  } = useChatContext()
  const drag = useDragRegion()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [browserDiscovery, setBrowserDiscovery] = useState<BrowserDiscoveryDTO | null>(null)
  const [extensionPackage, setExtensionPackage] = useState<BrowserExtensionPackageDTO | null>(null)
  const [backendUrlHint, setBackendUrlHint] = useState('')

  const selectedProfile = profiles.find((p) => p.id === selectedId) ?? null

  const loadProfiles = useCallback(() => {
    refreshBrowserProfiles()
  }, [refreshBrowserProfiles])

  useEffect(() => {
    loadProfiles()
  }, [loadProfiles])

  useEffect(() => {
    getBrowserDiscovery().then(setBrowserDiscovery).catch(() => {})
  }, [])

  useEffect(() => {
    getBrowserMainBridgeExtensionPackage().then(setExtensionPackage).catch(() => {})
    getBackendBaseUrl().then(setBackendUrlHint).catch(() => {})
  }, [])

  const handleDelete = async (id: string) => {
    await deleteBrowserProfile(id).catch(() => {})
    if (selectedId === id) setSelectedId(null)
    loadProfiles()
  }

  const handleControl = async (id: string, action: 'start' | 'stop' | 'restart') => {
    setBusyId(id)
    try {
      if (action === 'start') {
        await startBrowserProfile(id)
        notify.success(t.browser.launchSuccess)
      } else if (action === 'stop') {
        await stopBrowserProfile(id)
        notify.success('Browser stopped')
      } else {
        await restartBrowserProfile(id)
        notify.success('Browser restarted')
      }
      loadProfiles()
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t.browser.launchFailed, {
        durationMs: 6000,
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex h-full">
      <SidePanel>
        <div className="h-9 shrink-0 px-3 border-b border-[var(--subtle-border)] flex items-center justify-between" {...drag}>
          <h2 className="font-semibold text-sm">{t.browser.title}</h2>
          <button
            data-testid="browser-create-btn"
            onClick={() => {
              setSelectedId(null)
              setShowCreate(true)
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-accent-foreground transition-all duration-200 ease-[var(--ease-soft)]"
            title={t.browser.createProfile}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {profiles.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <Globe className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">{t.browser.noProfiles}</p>
                <p className="text-xs mt-1">{t.browser.noProfilesHint}</p>
              </div>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  data-testid="browser-profile-item"
                  onClick={() => {
                    setSelectedId(profile.id)
                    setShowCreate(false)
                  }}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all',
                    selectedId === profile.id
                      ? 'bg-accent text-accent-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-accent/50',
                  )}
                >
                  <div className={cn(
                    'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
                    selectedId === profile.id ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                  )}>
                    <Globe className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate text-foreground">{profile.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{profile.driver}</span>
                      <span>·</span>
                      <span>{profile.runtime?.status ?? 'stopped'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SidePanel>

      <div className="flex-1 overflow-y-auto">
        {selectedProfile ? (
          <ProfileDetail
            profile={selectedProfile}
            extensionPackage={extensionPackage}
            backendUrlHint={backendUrlHint}
            onRefresh={loadProfiles}
            isBusy={busyId === selectedProfile.id}
            onStart={() => handleControl(selectedProfile.id, 'start')}
            onStop={() => handleControl(selectedProfile.id, 'stop')}
            onRestart={() => handleControl(selectedProfile.id, 'restart')}
            onDelete={() => setDeleteId(selectedProfile.id)}
          />
        ) : (
          <div className="p-6">
            <BrowserGuideCard browserDiscovery={browserDiscovery} />
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.browser.confirmDelete}</AlertDialogTitle>
            <AlertDialogDescription>Delete this browser profile and its persisted browser data directory.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) handleDelete(deleteId)
                setDeleteId(null)
              }}
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BrowserProfileSetupDrawer
        open={showCreate}
        browserDiscovery={browserDiscovery}
        extensionPackage={extensionPackage}
        backendUrlHint={backendUrlHint}
        onOpenChange={setShowCreate}
        onCreated={(profile) => {
          loadProfiles()
          setSelectedId(profile.id)
          setShowCreate(false)
        }}
      />
    </div>
  )
}

function BrowserGuideCard({ browserDiscovery }: { browserDiscovery: BrowserDiscoveryDTO | null }) {
  const { t } = useI18n()

  return (
    <div className="space-y-4 overflow-hidden">
      <div className="rounded-2xl border border-border bg-background/70 p-5 sm:p-6">
        <h2 className="text-lg font-semibold leading-tight sm:text-xl">{t.browser.guideTitle}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground break-words">
          {t.browser.guideSummary}
        </p>
      </div>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        <DriverGuideCard title={t.browser.managedTitle} body={t.browser.managedBody} recommended />
        <DriverGuideCard title={t.browser.remoteTitle} body={t.browser.remoteBody} />
        <DriverGuideCard title={t.browser.relayTitle} body={t.browser.relayBody} advanced />
      </div>

      <DetectedBrowsersCard browserDiscovery={browserDiscovery} />

      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/8 p-4 text-sm sm:p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="space-y-1.5">
            <p className="font-medium text-foreground">{t.browser.relayStepsTitle}</p>
            <p className="text-muted-foreground break-words">{t.browser.relayStep1}</p>
            <p className="text-muted-foreground break-words">{t.browser.relayStep2}</p>
            <p className="text-muted-foreground break-words">{t.browser.relayStep3}</p>
            <p className="break-words text-amber-600 dark:text-amber-400">{t.browser.relayWarning}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function DetectedBrowsersCard({ browserDiscovery }: { browserDiscovery: BrowserDiscoveryDTO | null }) {
  const { t } = useI18n()
  const browsers = browserDiscovery?.browsers ?? []

  return (
    <div className="rounded-2xl border border-border bg-background/70 p-5 sm:p-6">
      <h3 className="text-base font-semibold">{t.browser.detectedBrowsersTitle}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{t.browser.detectedBrowsersHint}</p>

      {browsers.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t.browser.detectedBrowsersEmpty}</p>
      ) : (
        <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          {browsers.map((browser) => (
            <div key={browser.id} className="rounded-xl border border-border/70 bg-background/80 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium text-foreground">{browser.name}</div>
                {browser.isRecommended && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {t.browser.detectedRecommended}
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-muted-foreground break-all">{browser.executablePath}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DriverGuideCard({
  title,
  body,
  recommended = false,
  advanced = false,
}: {
  title: string
  body: string
  recommended?: boolean
  advanced?: boolean
}) {
  return (
    <div className="h-full min-w-0 rounded-2xl border border-border bg-background/70 p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 text-base font-semibold leading-tight break-words">{title}</div>
        {recommended && (
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            Recommended
          </span>
        )}
        {advanced && (
          <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            Advanced
          </span>
        )}
      </div>
      <p className="mt-3 text-sm leading-7 text-muted-foreground break-words">{body}</p>
    </div>
  )
}

function ProfileDetail({
  profile,
  extensionPackage,
  backendUrlHint,
  onRefresh,
  isBusy,
  onStart,
  onStop,
  onRestart,
  onDelete,
}: {
  profile: BrowserProfileDTO
  extensionPackage: BrowserExtensionPackageDTO | null
  backendUrlHint: string
  onRefresh: () => void
  isBusy: boolean
  onStart: () => void
  onStop: () => void
  onRestart: () => void
  onDelete: () => void
}) {
  const runtimeStatus = profile.runtime?.status ?? 'stopped'
  const running = runtimeStatus === 'running' || runtimeStatus === 'starting'
  const isExtensionRelay = profile.driver === 'extension-relay'
  const [mainBridge, setMainBridge] = useState<BrowserMainBridgeDTO | null>(null)
  const [relay, setRelay] = useState<BrowserRelayDTO | null>(null)
  const [relayUrl, setRelayUrl] = useState('')
  const [relayBusy, setRelayBusy] = useState<'connect' | 'disconnect' | 'rotate' | 'select-browser' | 'pair' | null>(null)
  const [showAdvancedRelay, setShowAdvancedRelay] = useState(false)

  const loadMainBridge = useCallback(async () => {
    if (!isExtensionRelay) {
      setMainBridge(null)
      return
    }

    try {
      const next = await getBrowserProfileMainBridge(profile.id)
      setMainBridge(next)
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to load main browser state', {
        durationMs: 6000,
      })
    }
  }, [isExtensionRelay, profile.id])

  const loadRelay = useCallback(async () => {
    if (!isExtensionRelay) {
      setRelay(null)
      return
    }

    try {
      const next = await getBrowserProfileRelay(profile.id)
      setRelay(next)
      setRelayUrl(next.cdpUrl ?? '')
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to load relay state', {
        durationMs: 6000,
      })
    }
  }, [isExtensionRelay, profile.id])

  useEffect(() => {
    void loadMainBridge()
  }, [loadMainBridge])

  useEffect(() => {
    void loadRelay()
  }, [loadRelay])

  useEffect(() => {
    if (!isExtensionRelay) return

    const intervalId = window.setInterval(() => {
      void loadMainBridge()
      void loadRelay()
    }, 4000)

    return () => window.clearInterval(intervalId)
  }, [isExtensionRelay, loadMainBridge, loadRelay])

  const handleRelayConnect = async () => {
    if (!mainBridge?.relayToken || !relayUrl.trim()) return
    setRelayBusy('connect')
    try {
      const result = await connectBrowserProfileMainBridge(profile.id, {
        token: mainBridge.relayToken,
        cdpUrl: relayUrl.trim(),
        browserId: mainBridge.selectedBrowserId,
        browserName: mainBridge.selectedBrowserName,
        browserKind: mainBridge.browsers.find((browser) => browser.id === mainBridge.selectedBrowserId)?.kind ?? null,
      })
      setMainBridge(result.state)
      setRelay(result.relay)
      setRelayUrl(result.relay.cdpUrl ?? relayUrl.trim())
      notify.success('Main browser session attached successfully.')
      onRefresh()
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to attach main browser session', {
        durationMs: 6000,
      })
    } finally {
      setRelayBusy(null)
    }
  }

  const handleRelayDisconnect = async () => {
    setRelayBusy('disconnect')
    try {
      const result = await disconnectBrowserProfileMainBridge(profile.id)
      setMainBridge(result.state)
      setRelay(result.relay)
      notify.success('Main browser session disconnected.')
      onRefresh()
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to disconnect main browser session', {
        durationMs: 6000,
      })
    } finally {
      setRelayBusy(null)
    }
  }

  const handleRelayRotateToken = async () => {
    setRelayBusy('rotate')
    try {
      const result = await rotateBrowserProfileRelayToken(profile.id)
      setRelay(result.relay)
      setRelayUrl('')
      notify.success('Relay token rotated. Existing relay connections were cleared.')
      await loadMainBridge()
      onRefresh()
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to rotate relay token', {
        durationMs: 6000,
      })
    } finally {
      setRelayBusy(null)
    }
  }

  const handleSelectMainBridgeBrowser = async (browserId: string | null) => {
    setRelayBusy('select-browser')
    try {
      const result = await selectBrowserProfileMainBridgeBrowser(profile.id, browserId)
      setMainBridge(result.state)
      notify.success('Preferred browser updated.')
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to update preferred browser', {
        durationMs: 6000,
      })
    } finally {
      setRelayBusy(null)
    }
  }

  const handleCreatePairing = async () => {
    setRelayBusy('pair')
    try {
      const result = await createBrowserProfileMainBridgePairing(profile.id)
      setMainBridge(result.state)
      notify.success('Pairing code created for the extension popup.')
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Failed to create pairing code', {
        durationMs: 6000,
      })
    } finally {
      setRelayBusy(null)
    }
  }

  return (
    <div className="p-6 space-y-6" data-testid="browser-profile-detail">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Globe className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold" data-testid="browser-profile-name">{profile.name}</h2>
            <p className="text-sm text-muted-foreground font-mono mt-0.5">{profile.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isExtensionRelay && (
            <>
              <button
                data-testid="browser-launch-btn"
                onClick={running ? onStop : onStart}
                disabled={isBusy}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {running ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {running ? 'Stop Browser' : 'Start Browser'}
              </button>
              <button
                onClick={onRestart}
                disabled={isBusy}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl border border-border hover:bg-accent transition-colors disabled:opacity-50"
              >
                <RotateCw className="h-3.5 w-3.5" />
                Restart
              </button>
            </>
          )}
          <button
            data-testid="browser-delete-btn"
            onClick={onDelete}
            className="p-2 rounded-xl hover:bg-destructive/20 text-muted-foreground hover:text-red-400 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <InfoCard label="Driver" value={profile.driver} />
        <InfoCard label="Runtime" value={runtimeStatus} />
        <InfoCard label="Created" value={new Date(profile.createdAt).toLocaleString()} />
        <InfoCard label="Default" value={profile.isDefault ? 'Yes' : 'No'} />
      {isExtensionRelay && (
          <InfoCard label="Relay Status" value={mainBridge?.status === 'connected' ? 'Connected' : 'Waiting for attach'} />
        )}
        <InfoCard
          label="Data Dir"
          value={profile.userDataDir ? (
            <span className="text-sm font-mono flex items-center gap-1.5">
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="truncate">{profile.userDataDir}</span>
            </span>
          ) : 'N/A'}
        />
        <InfoCard
          label="CDP Endpoint"
          value={profile.cdpUrl ?? (profile.cdpPort ? `127.0.0.1:${profile.cdpPort}` : 'N/A')}
        />
      </div>

      {isExtensionRelay && relay && (
        <div className="rounded-2xl border border-border p-4 space-y-4">
          <MainBridgeCard
            mainBridge={mainBridge}
            relay={relay}
            extensionPackage={extensionPackage}
            backendUrlHint={backendUrlHint}
            relayUrl={relayUrl}
            onCreatePairing={handleCreatePairing}
            onUseRecommended={() => handleSelectMainBridgeBrowser(null)}
            onSelectBrowser={(browserId) => handleSelectMainBridgeBrowser(browserId)}
            onRelayUrlChange={setRelayUrl}
            onRelayConnect={handleRelayConnect}
            onRelayDisconnect={handleRelayDisconnect}
            onRelayRotateToken={handleRelayRotateToken}
            showAdvancedRelay={showAdvancedRelay}
            onToggleAdvancedRelay={() => setShowAdvancedRelay((current) => !current)}
            disabled={relayBusy !== null}
          />
        </div>
      )}

      {profile.runtime?.wsEndpoint && (
        <div className="rounded-2xl border border-border p-4">
          <div className="text-xs text-muted-foreground mb-1.5">WebSocket Endpoint</div>
          <div className="text-sm font-mono break-all flex items-start gap-2">
            <Link className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <span>{profile.runtime.wsEndpoint}</span>
          </div>
        </div>
      )}

      {profile.runtime?.lastError && (
        <div className="text-xs rounded-xl p-3 border bg-red-500/10 border-red-500/30 text-red-400 whitespace-pre-line">
          {profile.runtime.lastError}
        </div>
      )}

      <div className="text-xs text-muted-foreground bg-muted/50 rounded-2xl p-4 border border-border space-y-1">
        <p className="font-medium text-foreground mb-2">Usage</p>
        {isExtensionRelay ? (
          <>
            <p>1. Keep the browser you want to attach running on this machine.</p>
            <p>2. The browser must expose a loopback CDP URL, such as `http://127.0.0.1:9222`.</p>
            <p>3. Attach the loopback CDP URL above using the relay token for authentication.</p>
            <p>4. Once attached, browser MCP tools will reuse that existing browser session.</p>
            <p>5. Disconnect or rotate the token to invalidate the relay.</p>
          </>
        ) : (
          <>
            <p>1. Start the browser for a managed profile.</p>
            <p>2. Log in manually to websites that require authentication.</p>
            <p>3. The browser state is stored in the profile data directory.</p>
            <p>4. Bind this profile to an agent or select it in chat.</p>
            <p>5. Browser MCP tools will reuse the same persisted session.</p>
          </>
        )}
      </div>
    </div>
  )
}

function MainBridgeCard({
  mainBridge,
  relay,
  extensionPackage,
  backendUrlHint,
  relayUrl,
  onCreatePairing,
  onUseRecommended,
  onSelectBrowser,
  onRelayUrlChange,
  onRelayConnect,
  onRelayDisconnect,
  onRelayRotateToken,
  showAdvancedRelay,
  onToggleAdvancedRelay,
  disabled,
}: {
  mainBridge: BrowserMainBridgeDTO | null
  relay: BrowserRelayDTO
  extensionPackage: BrowserExtensionPackageDTO | null
  backendUrlHint: string
  relayUrl: string
  onCreatePairing: () => void
  onUseRecommended: () => void
  onSelectBrowser: (browserId: string | null) => void
  onRelayUrlChange: (value: string) => void
  onRelayConnect: () => void
  onRelayDisconnect: () => void
  onRelayRotateToken: () => void
  showAdvancedRelay: boolean
  onToggleAdvancedRelay: () => void
  disabled: boolean
}) {
  const { t } = useI18n()
  const effectiveBackendUrl = backendUrlHint || 'http://127.0.0.1:62601'
  const statusText =
    mainBridge?.status === 'connected'
      ? t.browser.mainBridgeStatusConnected
      : mainBridge?.status === 'paired'
        ? t.browser.mainBridgeStatusPaired
      : mainBridge?.status === 'ready'
        ? t.browser.mainBridgeStatusReady
        : t.browser.mainBridgeStatusNoBrowser

  const selectionText =
    mainBridge?.selectionSource === 'profile'
      ? t.browser.mainBridgeSelectionManual
      : mainBridge?.selectionSource === 'recommended'
        ? t.browser.mainBridgeSelectionAuto
        : t.browser.mainBridgeSelectionNone

  const stepChooseDone = Boolean(mainBridge?.selectedBrowserName)
  const stepInstallDone =
    mainBridge?.status === 'paired' ||
    (mainBridge?.status === 'connected' && mainBridge.connectionMode === 'extension-bridge')
  const stepPairDone =
    Boolean(mainBridge?.pairingCode) ||
    mainBridge?.status === 'paired' ||
    (mainBridge?.status === 'connected' && mainBridge.connectionMode === 'extension-bridge')
  const stepConnectDone =
    mainBridge?.status === 'connected' && mainBridge.connectionMode === 'extension-bridge'

  const copyText = (text: string, successMessage: string, errorMessage: string) => {
    navigator.clipboard.writeText(text).then(() => {
      notify.success(successMessage)
    }).catch((err) => {
      notify.error(err instanceof Error ? err.message : errorMessage, {
        durationMs: 6000,
      })
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-medium text-foreground">{t.browser.mainBridgeTitle}</div>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">{t.browser.mainBridgeBody}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <InfoCard label="Status" value={statusText} />
        <InfoCard label={t.browser.mainBridgeSelectionLabel} value={mainBridge?.selectedBrowserName ?? selectionText} />
      </div>

      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {t.browser.mainBridgeStepsTitle}
      </div>

      <StepCard title={t.browser.mainBridgeStepChoose} done={stepChooseDone}>
        <p className="text-xs leading-6 text-muted-foreground">
          Pick the browser you want YouClaw to treat as your main browser. If you do nothing, the recommended browser will stay selected.
        </p>

        {mainBridge && mainBridge.browsers.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onUseRecommended}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
              >
                {t.browser.mainBridgeUseRecommended}
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5">{t.browser.mainBridgeSelectLabel}</label>
              <select
                value={mainBridge.selectedBrowserId ?? '__recommended__'}
                onChange={(e) => onSelectBrowser(e.target.value === '__recommended__' ? null : e.target.value)}
                disabled={disabled}
                className="w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              >
                <option value="__recommended__">{t.browser.mainBridgeUseRecommended}</option>
                {mainBridge.browsers.map((browser) => (
                  <option key={browser.id} value={browser.id}>
                    {browser.name}{browser.isRecommended ? ` · ${t.browser.detectedRecommended}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
              {mainBridge.browsers.map((browser) => (
                <div key={browser.id} className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium text-foreground">{browser.name}</div>
                    {browser.isRecommended && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        {t.browser.detectedRecommended}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground break-all">{browser.executablePath}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t.browser.detectedBrowsersEmpty}</p>
        )}
      </StepCard>

      <StepCard title={t.browser.mainBridgeStepInstall} done={stepInstallDone}>
        <p className="text-xs leading-6 text-muted-foreground">
          Install the unpacked extension in the selected browser. This is the preferred path for connecting the browser tab you already use.
        </p>

        {extensionPackage ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <InfoCard label="Version" value={extensionPackage.version} />
              <InfoCard label="Backend URL" value={effectiveBackendUrl} />
            </div>
            <InfoCard label="Extension Path" value={extensionPackage.directoryPath} />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => copyText(effectiveBackendUrl, 'Backend URL copied.', 'Failed to copy backend URL')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-accent transition-colors"
              >
                {t.browser.mainBridgeCopyBackend}
              </button>
              <button
                type="button"
                onClick={() => downloadBrowserMainBridgeExtensionBundle().catch((err) => {
                  notify.error(err instanceof Error ? err.message : 'Failed to download extension bundle', {
                    durationMs: 6000,
                  })
                })}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-accent transition-colors"
              >
                Download Extension Bundle
              </button>
              <button
                type="button"
                onClick={() => copyText(extensionPackage.directoryPath, 'Extension path copied.', 'Failed to copy extension path')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-accent transition-colors"
              >
                Copy Extension Path
              </button>
            </div>
            <div className="text-xs text-muted-foreground leading-6">
              Open `chrome://extensions` in the target browser, enable Developer Mode, then click “Load unpacked” and choose the directory above.
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">
            Extension package metadata is not available yet.
          </div>
        )}
      </StepCard>

      <StepCard title={t.browser.mainBridgeStepPair} done={stepPairDone}>
        <p className="text-xs leading-6 text-muted-foreground">
          Generate a pairing code, then enter it in the extension popup together with the backend URL.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCreatePairing}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
          >
            {mainBridge?.pairingCode ? 'Refresh Pairing Code' : 'Generate Pairing Code'}
          </button>
        </div>

        {mainBridge?.pairingCode ? (
          <div className="space-y-1 rounded-xl border border-border/70 bg-muted/20 p-4">
            <div className="text-xs text-muted-foreground">Pairing Code</div>
            <div className="font-mono text-sm text-foreground">{mainBridge.pairingCode}</div>
            {mainBridge.pairingCodeExpiresAt && (
              <div className="text-xs text-muted-foreground">
                {t.browser.mainBridgePairingExpires} {new Date(mainBridge.pairingCodeExpiresAt).toLocaleString()}
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              Use this code in the extension popup to connect the current tab.
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => copyText(mainBridge.pairingCode ?? '', 'Pairing code copied.', 'Failed to copy pairing code')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-accent transition-colors"
              >
                {t.browser.mainBridgeCopyPairing}
              </button>
              <button
                type="button"
                onClick={onCreatePairing}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
              >
                {t.browser.mainBridgeRefresh}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            Generate a pairing code first, then keep the popup open while you connect the target tab.
          </div>
        )}
      </StepCard>

      <StepCard title={t.browser.mainBridgeStepConnect} done={stepConnectDone}>
        <p className="text-xs leading-6 text-muted-foreground">
          Open the tab you want YouClaw to control, then use the browser extension popup and click “Connect Current Tab”.
        </p>

        {mainBridge?.connectedBrowserName ? (
          <div className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-2">
            <div className="text-xs text-muted-foreground">{t.browser.mainBridgeConnectedSession}</div>
            <div className="text-sm font-medium text-foreground">{mainBridge.connectedBrowserName}</div>
            <div className="text-xs text-muted-foreground">Mode: {mainBridge.connectionMode}</div>
            {mainBridge.connectedAt && (
              <div className="text-xs text-muted-foreground">
                Connected at {new Date(mainBridge.connectedAt).toLocaleString()}
              </div>
            )}
            {mainBridge.connectedTabTitle && (
              <div className="text-sm text-foreground break-words">{mainBridge.connectedTabTitle}</div>
            )}
            {mainBridge.connectedTabUrl && (
              <div className="text-xs text-muted-foreground break-all">{mainBridge.connectedTabUrl}</div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 p-4 text-xs leading-6 text-muted-foreground">
            No browser tab is connected yet. After you finish the first three steps, switch to the tab you want to control and connect it from the extension popup.
          </div>
        )}
      </StepCard>

      <StepCard title={t.browser.mainBridgeStepAdvanced}>
        <p className="text-xs leading-6 text-muted-foreground">{t.browser.relayAdvancedBody}</p>
        <button
          type="button"
          onClick={onToggleAdvancedRelay}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-accent transition-colors"
        >
          <Link className="h-3.5 w-3.5" />
          {showAdvancedRelay ? 'Hide Advanced Relay' : 'Show Advanced Relay'}
        </button>

        {showAdvancedRelay && (
          <div className="space-y-4 rounded-xl border border-border/70 bg-background/80 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1.5">Attach Token</div>
                <div className="text-sm font-mono break-all">{relay.token}</div>
              </div>
              <button
                type="button"
                onClick={onRelayRotateToken}
                disabled={disabled}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border border-border hover:bg-accent transition-colors disabled:opacity-50"
              >
                <RotateCw className="h-3.5 w-3.5" />
                Rotate Token
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5">Loopback CDP URL</label>
              <input
                value={relayUrl}
                onChange={(e) => onRelayUrlChange(e.target.value)}
                placeholder="http://127.0.0.1:9222 or ws://127.0.0.1:9222/devtools/browser/..."
                className="w-full px-3 py-2 text-sm rounded-xl bg-muted border border-border focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Only loopback CDP URLs are accepted. This keeps the relay limited to a browser running on the same machine.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onRelayConnect}
                disabled={disabled || !relayUrl.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Link className="h-3.5 w-3.5" />
                Attach Relay
              </button>
              <button
                type="button"
                onClick={onRelayDisconnect}
                disabled={disabled || !(mainBridge?.status === 'connected')}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl border border-border hover:bg-accent transition-colors disabled:opacity-50"
              >
                <Square className="h-3.5 w-3.5" />
                Disconnect
              </button>
            </div>

            {relay.connectedAt && (
              <div className="text-xs text-muted-foreground">
                Connected at {new Date(relay.connectedAt).toLocaleString()}
              </div>
            )}
          </div>
        )}
      </StepCard>
    </div>
  )
}

function StepCard({
  title,
  done,
  children,
}: {
  title: string
  done?: boolean
  children: ReactNode
}) {
  const { t } = useI18n()

  return (
    <div className="rounded-xl border border-border/70 bg-background/80 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium text-foreground">{title}</div>
        {typeof done === 'boolean' && (
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]',
              done ? 'bg-emerald-500/10 text-emerald-400' : 'bg-primary/10 text-primary',
            )}
          >
            {done ? t.browser.mainBridgeStepDone : t.browser.mainBridgeStepTodo}
          </span>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="text-xs text-muted-foreground mb-1.5">{label}</div>
      <div className="text-sm font-semibold break-all">{value}</div>
    </div>
  )
}

type BrowserSetupMode = 'managed' | 'remote-cdp' | 'extension-relay'
type BrowserSetupStage =
  | 'choose-mode'
  | 'managed'
  | 'remote'
  | 'main-choose'
  | 'main-install'
  | 'main-connect'
  | 'main-finish'

function BrowserProfileSetupDrawer({
  open,
  browserDiscovery,
  extensionPackage,
  backendUrlHint,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  browserDiscovery: BrowserDiscoveryDTO | null
  extensionPackage: BrowserExtensionPackageDTO | null
  backendUrlHint: string
  onOpenChange: (open: boolean) => void
  onCreated: (profile: BrowserProfileDTO) => void
}) {
  const { t } = useI18n()
  const [stage, setStage] = useState<BrowserSetupStage>('choose-mode')
  const [mode, setMode] = useState<BrowserSetupMode | null>(null)
  const [name, setName] = useState('')
  const [cdpUrl, setCdpUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [setupSession, setSetupSession] = useState<BrowserSetupSessionDTO | null>(null)
  const [mainBridge, setMainBridge] = useState<BrowserMainBridgeDTO | null>(null)
  const [mainBusy, setMainBusy] = useState(false)
  const effectiveBackendUrl = backendUrlHint || 'http://127.0.0.1:62601'

  const resetLocalState = useCallback(() => {
    setStage('choose-mode')
    setMode(null)
    setName('')
    setCdpUrl('')
    setSubmitting(false)
    setError('')
    setSetupSession(null)
    setMainBridge(null)
    setMainBusy(false)
  }, [])

  const cleanupSetupSession = useCallback(async () => {
    if (!setupSession?.id) return
    await deleteBrowserSetupSession(setupSession.id).catch(() => {})
  }, [setupSession?.id])

  const handleDrawerOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      void cleanupSetupSession()
      resetLocalState()
    }
    onOpenChange(nextOpen)
  }, [cleanupSetupSession, onOpenChange, resetLocalState])

  const loadSetupMainBridge = useCallback(async (sessionId: string) => {
    const state = await getBrowserSetupSessionMainBridge(sessionId)
    setMainBridge(state)
    return state
  }, [])

  useEffect(() => {
    if (!open || !setupSession?.id || !stage.startsWith('main-')) return

    const intervalId = window.setInterval(() => {
      void loadSetupMainBridge(setupSession.id).catch(() => {})
    }, 4000)

    return () => window.clearInterval(intervalId)
  }, [loadSetupMainBridge, open, setupSession?.id, stage])

  const copyText = useCallback((text: string, successMessage: string, errorMessage: string) => {
    navigator.clipboard.writeText(text).then(() => {
      notify.success(successMessage)
    }).catch((err) => {
      notify.error(err instanceof Error ? err.message : errorMessage, {
        durationMs: 6000,
      })
    })
  }, [])

  const beginMainBrowserFlow = useCallback(async () => {
    setSubmitting(true)
    setError('')
    try {
      const session = await createBrowserSetupSession({ driver: 'extension-relay' })
      setSetupSession(session)
      setMode('extension-relay')
      await loadSetupMainBridge(session.id)
      setStage('main-choose')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start main browser setup')
    } finally {
      setSubmitting(false)
    }
  }, [loadSetupMainBridge])

  const handleContinueFromMode = async () => {
    setError('')
    if (mode === 'managed') {
      setStage('managed')
      return
    }
    if (mode === 'remote-cdp') {
      setStage('remote')
      return
    }
    if (mode === 'extension-relay') {
      await beginMainBrowserFlow()
    }
  }

  const handleCreateSimpleProfile = async (driver: 'managed' | 'remote-cdp') => {
    if (!name.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const profile = await createBrowserProfile({
        name: name.trim(),
        driver,
        cdpUrl: driver === 'remote-cdp' ? cdpUrl.trim() || null : undefined,
      })
      resetLocalState()
      onCreated(profile)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create profile')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSelectSetupBrowser = async (browserId: string | null) => {
    if (!setupSession?.id) return
    setMainBusy(true)
    setError('')
    try {
      const result = await selectBrowserSetupSessionMainBridgeBrowser(setupSession.id, browserId)
      setMainBridge(result.state)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select browser')
    } finally {
      setMainBusy(false)
    }
  }

  const handleCreateSetupPairing = async () => {
    if (!setupSession?.id) return
    setMainBusy(true)
    setError('')
    try {
      const result = await createBrowserSetupSessionMainBridgePairing(setupSession.id)
      setMainBridge(result.state)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create pairing code')
    } finally {
      setMainBusy(false)
    }
  }

  const handleFinalizeMainProfile = async () => {
    if (!setupSession?.id || !name.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const profile = await finalizeBrowserSetupSession(setupSession.id, { name: name.trim() })
      setSetupSession(null)
      setMainBridge(null)
      resetLocalState()
      onCreated(profile)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create main browser profile')
    } finally {
      setSubmitting(false)
    }
  }

  const mainSteps: Array<{ key: BrowserSetupStage; label: string }> = [
    { key: 'main-choose', label: t.browser.mainBrowserSetupChoose },
    { key: 'main-install', label: t.browser.mainBrowserSetupInstall },
    { key: 'main-connect', label: t.browser.mainBrowserSetupConnect },
    { key: 'main-finish', label: t.browser.mainBrowserSetupCreate },
  ]

  const stepIndex = mainSteps.findIndex((entry) => entry.key === stage)
  const mainConnected = mainBridge?.connectionMode === 'extension-bridge'

  return (
    <Dialog open={open} onOpenChange={handleDrawerOpenChange}>
      <DialogContent className="left-auto right-0 top-0 h-full w-[min(96vw,760px)] max-w-none translate-x-0 translate-y-0 rounded-none border-l border-border p-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right">
        <div className="flex h-full flex-col overflow-hidden">
          <DialogHeader className="border-b border-border px-6 py-5">
            <DialogTitle>{t.browser.createTitle}</DialogTitle>
            <DialogDescription>
              {stage === 'choose-mode'
                ? 'Choose how you want this browser profile to work.'
                : mode === 'extension-relay'
                  ? 'Set up your main browser first, then create the profile at the final step.'
                  : 'Finish the required fields, then create the profile.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {stage === 'choose-mode' && (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <ModeOptionCard
                    title={t.browser.managedTitle}
                    description={t.browser.managedBody}
                    selected={mode === 'managed'}
                    onClick={() => setMode('managed')}
                    badge="Recommended"
                  />
                  <ModeOptionCard
                    title="Use My Browser"
                    description="Connect the browser you already use, then create the profile after the extension is attached."
                    selected={mode === 'extension-relay'}
                    onClick={() => setMode('extension-relay')}
                    badge={browserDiscovery?.browsers.length ? `${browserDiscovery.browsers.length} detected` : undefined}
                  />
                  <ModeOptionCard
                    title={t.browser.remoteTitle}
                    description={t.browser.remoteBody}
                    selected={mode === 'remote-cdp'}
                    onClick={() => setMode('remote-cdp')}
                  />
                </div>
                <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
                  `Use My Browser` now runs as a guided setup. You pick the browser, install the extension, connect the current tab, and only then create the final profile.
                </div>
              </div>
            )}

            {stage === 'managed' && (
              <form className="space-y-5" onSubmit={(e: FormEvent) => {
                e.preventDefault()
                void handleCreateSimpleProfile('managed')
              }}>
                <div className="rounded-2xl border border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
                  YouClaw will launch an isolated Chromium window and store login state inside this profile.
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5">{t.browser.profileName}</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t.browser.profileNamePlaceholder}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-muted border border-border focus:outline-none focus:ring-1 focus:ring-ring"
                    autoFocus
                  />
                </div>
              </form>
            )}

            {stage === 'remote' && (
              <form className="space-y-5" onSubmit={(e: FormEvent) => {
                e.preventDefault()
                void handleCreateSimpleProfile('remote-cdp')
              }}>
                <div className="rounded-2xl border border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
                  Use this only if you already have a browser exposing a CDP endpoint.
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5">{t.browser.profileName}</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t.browser.profileNamePlaceholder}
                    className="w-full px-3 py-2 text-sm rounded-xl bg-muted border border-border focus:outline-none focus:ring-1 focus:ring-ring"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5">CDP URL</label>
                  <input
                    type="text"
                    value={cdpUrl}
                    onChange={(e) => setCdpUrl(e.target.value)}
                    placeholder="http://127.0.0.1:9222 or ws://host/devtools/browser/..."
                    className="w-full px-3 py-2 text-sm rounded-xl bg-muted border border-border focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </form>
            )}

            {stage.startsWith('main-') && (
              <div className="space-y-5">
                <div className="grid gap-2 sm:grid-cols-4">
                  {mainSteps.map((entry, index) => {
                    const active = stage === entry.key
                    const done = stepIndex > index
                    return (
                      <div
                        key={entry.key}
                        className={cn(
                          'rounded-2xl border px-3 py-3 text-xs transition-colors',
                          active ? 'border-primary bg-primary/5 text-foreground' : 'border-border bg-background/70 text-muted-foreground',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold',
                            done ? 'bg-emerald-500/15 text-emerald-400' : active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                          )}>
                            {done ? <Check className="h-3 w-3" /> : index + 1}
                          </span>
                          <span className="leading-5">{entry.label}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {stage === 'main-choose' && (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
                      Choose which installed browser should represent your main browser. You can keep the recommended browser or switch to another detected one.
                    </div>
                    {mainBridge && mainBridge.browsers.length > 0 ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleSelectSetupBrowser(null)}
                            disabled={mainBusy}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
                          >
                            {t.browser.mainBridgeUseRecommended}
                          </button>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1.5">{t.browser.mainBridgeSelectLabel}</label>
                          <select
                            value={mainBridge.selectedBrowserId ?? '__recommended__'}
                            onChange={(e) => void handleSelectSetupBrowser(e.target.value === '__recommended__' ? null : e.target.value)}
                            disabled={mainBusy}
                            className="w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                          >
                            <option value="__recommended__">{t.browser.mainBridgeUseRecommended}</option>
                            {mainBridge.browsers.map((browser) => (
                              <option key={browser.id} value={browser.id}>
                                {browser.name}{browser.isRecommended ? ` · ${t.browser.detectedRecommended}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                          {mainBridge.browsers.map((browser) => (
                            <div key={browser.id} className="rounded-xl border border-border/70 bg-background/80 px-4 py-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="font-medium text-foreground">{browser.name}</div>
                                {browser.isRecommended && (
                                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                    {t.browser.detectedRecommended}
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground break-all">{browser.executablePath}</div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-border bg-muted/10 p-4 text-sm text-muted-foreground">
                        {t.browser.detectedBrowsersEmpty}
                      </div>
                    )}
                  </div>
                )}

                {stage === 'main-install' && (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
                      Install the unpacked browser extension in the selected browser before moving on to pairing.
                    </div>
                    {extensionPackage ? (
                      <>
                        <div className="grid gap-4 md:grid-cols-2">
                          <InfoCard label="Browser" value={mainBridge?.selectedBrowserName ?? t.browser.mainBridgeSelectionNone} />
                          <InfoCard label="Backend URL" value={effectiveBackendUrl} />
                        </div>
                        <InfoCard label="Extension Path" value={extensionPackage.directoryPath} />
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => copyText(effectiveBackendUrl, 'Backend URL copied.', 'Failed to copy backend URL')}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-accent transition-colors"
                          >
                            {t.browser.mainBridgeCopyBackend}
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadBrowserMainBridgeExtensionBundle().catch((err) => {
                              notify.error(err instanceof Error ? err.message : 'Failed to download extension bundle', {
                                durationMs: 6000,
                              })
                            })}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-accent transition-colors"
                          >
                            Download Extension Bundle
                          </button>
                          <button
                            type="button"
                            onClick={() => copyText(extensionPackage.directoryPath, 'Extension path copied.', 'Failed to copy extension path')}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-accent transition-colors"
                          >
                            Copy Extension Path
                          </button>
                        </div>
                        <ol className="space-y-2 rounded-2xl border border-border bg-background/70 p-4 text-sm text-muted-foreground">
                          <li>1. Open `chrome://extensions` in your selected browser.</li>
                          <li>2. Turn on Developer Mode.</li>
                          <li>3. Click `Load unpacked` and choose the extension folder.</li>
                          <li>4. Keep the extension popup available for the connection step.</li>
                        </ol>
                      </>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-border bg-muted/10 p-4 text-sm text-muted-foreground">
                        Extension package metadata is not available yet.
                      </div>
                    )}
                  </div>
                )}

                {stage === 'main-connect' && (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
                      Generate a pairing code if needed, then open the tab you want YouClaw to control, click the extension icon, enter the backend URL and pairing code, and click `Connect Current Tab`.
                    </div>
                    <div className="space-y-3 rounded-2xl border border-border bg-background/80 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleCreateSetupPairing()}
                          disabled={mainBusy}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
                        >
                          {mainBridge?.pairingCode ? 'Refresh Pairing Code' : 'Generate Pairing Code'}
                        </button>
                        <button
                          type="button"
                          onClick={() => copyText(effectiveBackendUrl, 'Backend URL copied.', 'Failed to copy backend URL')}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-accent transition-colors"
                        >
                          {t.browser.mainBridgeCopyBackend}
                        </button>
                      </div>
                      {mainBridge?.pairingCode ? (
                        <div className="space-y-2">
                          <div>
                            <div className="text-xs text-muted-foreground mb-1.5">Pairing Code</div>
                            <div className="font-mono text-lg text-foreground">{mainBridge.pairingCode}</div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {t.browser.mainBridgePairingExpires} {mainBridge.pairingCodeExpiresAt ? new Date(mainBridge.pairingCodeExpiresAt).toLocaleString() : 'N/A'}
                          </div>
                          <button
                            type="button"
                            onClick={() => copyText(mainBridge.pairingCode ?? '', 'Pairing code copied.', 'Failed to copy pairing code')}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-accent transition-colors"
                          >
                            {t.browser.mainBridgeCopyPairing}
                          </button>
                        </div>
                      ) : mainConnected ? (
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
                          Pairing code was already used by the extension. The current tab is connected.
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                          Generate a pairing code before connecting the current tab from the extension popup.
                        </div>
                      )}
                    </div>
                    {mainBridge?.connectedBrowserName ? (
                      <div className="space-y-2 rounded-2xl border border-border bg-background/80 p-4">
                        <div className="text-xs text-muted-foreground">{t.browser.mainBridgeConnectedSession}</div>
                        <div className="text-sm font-medium text-foreground">{mainBridge.connectedBrowserName}</div>
                        {mainBridge.connectedTabTitle && (
                          <div className="text-sm text-foreground break-words">{mainBridge.connectedTabTitle}</div>
                        )}
                        {mainBridge.connectedTabUrl && (
                          <div className="text-xs text-muted-foreground break-all">{mainBridge.connectedTabUrl}</div>
                        )}
                        {mainBridge.connectedAt && (
                          <div className="text-xs text-muted-foreground">
                            Connected at {new Date(mainBridge.connectedAt).toLocaleString()}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-border bg-muted/10 p-4 text-sm text-muted-foreground">
                        Waiting for the extension to attach the current tab.
                      </div>
                    )}
                  </div>
                )}

                {stage === 'main-finish' && (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
                      The browser is already connected. Give this browser profile a name and create it.
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <InfoCard label="Browser" value={mainBridge?.connectedBrowserName ?? mainBridge?.selectedBrowserName ?? 'N/A'} />
                      <InfoCard label="Tab" value={mainBridge?.connectedTabTitle ?? 'N/A'} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5">{t.browser.profileName}</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={mainBridge?.connectedBrowserName ?? t.browser.profileNamePlaceholder}
                        className="w-full px-3 py-2 text-sm rounded-xl bg-muted border border-border focus:outline-none focus:ring-1 focus:ring-ring"
                        autoFocus
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && <p data-testid="browser-form-error" className="mt-4 text-xs text-red-400">{error}</p>}
          </div>

          <DialogFooter className="border-t border-border px-6 py-4">
            {stage === 'choose-mode' ? (
              <>
                <button
                  type="button"
                  onClick={() => handleDrawerOpenChange(false)}
                  className="px-5 py-2 text-sm font-medium rounded-xl border border-border text-muted-foreground hover:bg-accent transition-colors"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="button"
                  onClick={() => void handleContinueFromMode()}
                  disabled={!mode || submitting}
                  className="px-5 py-2 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  Continue
                </button>
              </>
            ) : stage === 'managed' ? (
              <>
                <button
                  type="button"
                  onClick={() => setStage('choose-mode')}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-medium rounded-xl border border-border text-muted-foreground hover:bg-accent transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateSimpleProfile('managed')}
                  disabled={submitting || !name.trim()}
                  className="px-5 py-2 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {submitting ? t.browser.creating : t.common.create}
                </button>
              </>
            ) : stage === 'remote' ? (
              <>
                <button
                  type="button"
                  onClick={() => setStage('choose-mode')}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-medium rounded-xl border border-border text-muted-foreground hover:bg-accent transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateSimpleProfile('remote-cdp')}
                  disabled={submitting || !name.trim() || !cdpUrl.trim()}
                  className="px-5 py-2 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {submitting ? t.browser.creating : t.common.create}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (stage === 'main-choose') setStage('choose-mode')
                    if (stage === 'main-install') setStage('main-choose')
                    if (stage === 'main-connect') setStage('main-install')
                    if (stage === 'main-finish') setStage('main-connect')
                  }}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-medium rounded-xl border border-border text-muted-foreground hover:bg-accent transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
                {stage === 'main-choose' && (
                  <button
                    type="button"
                    onClick={() => setStage('main-install')}
                    disabled={mainBusy || !mainBridge?.browsers.length}
                    className="px-5 py-2 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    Continue
                  </button>
                )}
                {stage === 'main-install' && (
                  <button
                    type="button"
                    onClick={() => setStage('main-connect')}
                    className="px-5 py-2 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Continue
                  </button>
                )}
                {stage === 'main-connect' && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setupSession?.id && void loadSetupMainBridge(setupSession.id)}
                      disabled={!setupSession?.id || mainBusy}
                      className="px-5 py-2 text-sm font-medium rounded-xl border border-border text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      {t.browser.mainBridgeRefresh}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStage('main-finish')}
                      disabled={!mainConnected}
                      className="px-5 py-2 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      Continue
                    </button>
                  </div>
                )}
                {stage === 'main-finish' && (
                  <button
                    type="button"
                    onClick={() => void handleFinalizeMainProfile()}
                    disabled={submitting || !mainConnected || !name.trim()}
                    className="px-5 py-2 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {submitting ? t.browser.creating : t.common.create}
                  </button>
                )}
              </>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ModeOptionCard({
  title,
  description,
  selected,
  onClick,
  badge,
}: {
  title: string
  description: string
  selected: boolean
  onClick: () => void
  badge?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-2xl border p-4 text-left transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-accent/40',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {badge && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            {badge}
          </span>
        )}
      </div>
      <div className="mt-2 text-xs leading-6 text-muted-foreground">{description}</div>
    </button>
  )
}
