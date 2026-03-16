import { type ReactNode, useState, useEffect } from 'react'
import { AppSidebar } from './AppSidebar'
import { WindowsTitleBar } from './WindowsTitleBar'
import { ChatProvider } from '@/hooks/useChatContext'
import { SettingsDialog, type SettingsTab } from '@/components/settings/SettingsDialog'
import { isTauri } from '@/api/transport'
import { PlatformContext } from '@/hooks/usePlatform'

export function Shell({ children }: { children: ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab | undefined>()
  const [platform, setPlatform] = useState('')

  useEffect(() => {
    if (!isTauri) return
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke<string>('get_platform').then(setPlatform)
    })
  }, [])

  const isWin = platform === 'windows'
  const isMac = platform === 'macos'
  const isDesktop = isTauri

  const platformCtx = { platform, isMac, isWin, isDesktop }

  return (
    <PlatformContext.Provider value={platformCtx}>
      <ChatProvider>
        <div className="h-screen flex flex-col bg-background text-foreground">
          {/* Windows: full-width titlebar with controls */}
          {isWin && <WindowsTitleBar />}
          <div className="flex-1 flex overflow-hidden">
            <AppSidebar onOpenSettings={(tab) => { setSettingsTab(tab as SettingsTab); setSettingsOpen(true) }} />
            <main className="flex-1 overflow-hidden flex flex-col">
              {children}
            </main>
          </div>
        </div>
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} initialTab={settingsTab} />
      </ChatProvider>
    </PlatformContext.Provider>
  )
}
