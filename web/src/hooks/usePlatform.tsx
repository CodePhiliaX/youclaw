import { createContext, useContext } from 'react'

export type PlatformContextValue = {
  platform: string
  isMac: boolean
  isWin: boolean
  isDesktop: boolean
}

export const PlatformContext = createContext<PlatformContextValue>({
  platform: '',
  isMac: false,
  isWin: false,
  isDesktop: false,
})

export const usePlatform = () => useContext(PlatformContext)
