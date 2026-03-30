import type { CSSProperties } from 'react'
import { Toaster } from 'sonner'
import { useAppPreferencesStore } from '@/stores/app'

export function AppToaster() {
  const theme = useAppPreferencesStore((state) => state.theme)
  const toasterStyle = {
    '--width': 'max-content',
    maxWidth: 'min(calc(100vw - 32px), 420px)',
  } as CSSProperties & { '--width': string }

  return (
    <Toaster
      theme={theme}
      position="top-center"
      visibleToasts={1}
      richColors
      expand={false}
      duration={4000}
      offset={16}
      mobileOffset={16}
      containerAriaLabel="Notifications"
      style={toasterStyle}
      toastOptions={{
        duration: 4000,
        style: {
          width: 'max-content',
          maxWidth: 'min(calc(100vw - 32px), 420px)',
        },
      }}
    />
  )
}
