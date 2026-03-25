import { useEffect } from 'react'
import { useAppPreferencesStore } from '@/stores/app'

export function useSidebar() {
  const isCollapsed = useAppPreferencesStore((s) => s.sidebarCollapsed)
  const toggle = useAppPreferencesStore((s) => s.toggleSidebar)
  const collapse = useAppPreferencesStore((s) => s.collapseSidebar)
  const expand = useAppPreferencesStore((s) => s.expandSidebar)

  // Keyboard shortcut Cmd/Ctrl+Shift+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 's') {
        e.preventDefault()
        useAppPreferencesStore.getState().toggleSidebar()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return { isCollapsed, toggle, collapse, expand }
}
