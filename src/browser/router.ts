import type { BrowserManager } from './manager.ts'
import {
  actForChat,
  clickForChat,
  closeTabForChat,
  navigateForChat,
  openTabForChat,
  pressKeyForChat,
  screenshotForChat,
  snapshotForChat,
  typeForChat,
} from './pw-session.ts'
import type { BrowserProfile, BrowserProfileRuntime, BrowserRefAction, BrowserTarget } from './types.ts'

type BrowserActionRouterParams = {
  browserManager: BrowserManager
  chatId: string
  agentId: string
  profileId: string
  target: BrowserTarget
}

type BrowserStatusPayload = {
  target: BrowserTarget
  profile: BrowserProfile | null
  runtime: BrowserProfileRuntime
}

export type BrowserActionRouter = {
  getStatus: () => Promise<BrowserStatusPayload>
  listTabs: () => Promise<{ tabs: Array<{ id: string; title?: string; url?: string; type?: string }> }>
  openTab: (url?: string) => Promise<{ url: string; title: string }>
  navigate: (url: string) => Promise<{ url: string; title: string }>
  snapshot: () => Promise<Record<string, unknown>>
  act: (params: { ref: string; action: BrowserRefAction; text?: string; option?: string }) => Promise<{ url: string; title: string }>
  screenshot: (path: string) => Promise<{ path: string; url: string }>
  click: (selector: string) => Promise<{ url: string; title: string }>
  type: (selector: string, text: string) => Promise<{ url: string; title: string }>
  pressKey: (key: string) => Promise<{ url: string; title: string }>
  closeTab: (url?: string) => Promise<{ closed: boolean }>
}

function unsupportedTarget(target: BrowserTarget): never {
  throw new Error(`Browser target "${target}" is not implemented yet`)
}

export function createBrowserActionRouter(params: BrowserActionRouterParams): BrowserActionRouter {
  const { browserManager, chatId, agentId, profileId, target } = params

  if (target !== 'host') {
    return {
      getStatus: async () => unsupportedTarget(target),
      listTabs: async () => unsupportedTarget(target),
      openTab: async () => unsupportedTarget(target),
      navigate: async () => unsupportedTarget(target),
      snapshot: async () => unsupportedTarget(target),
      act: async () => unsupportedTarget(target),
      screenshot: async () => unsupportedTarget(target),
      click: async () => unsupportedTarget(target),
      type: async () => unsupportedTarget(target),
      pressKey: async () => unsupportedTarget(target),
      closeTab: async () => unsupportedTarget(target),
    }
  }

  return {
    getStatus: async () => {
      const runtime = await browserManager.getProfileStatus(profileId)
      const profile = browserManager.getProfile(profileId)
      return { target, profile, runtime }
    },
    listTabs: async () => {
      const tabs = await browserManager.listTabs(profileId)
      return { tabs }
    },
    openTab: async (url) =>
      openTabForChat(browserManager, { chatId, agentId, profileId, url }),
    navigate: async (url) =>
      navigateForChat(browserManager, { chatId, agentId, profileId, url }),
    snapshot: async () =>
      snapshotForChat(browserManager, { chatId, agentId, profileId }),
    act: async ({ ref, action, text, option }) =>
      actForChat(browserManager, { chatId, agentId, profileId, ref, action, text, option }),
    screenshot: async (path) =>
      screenshotForChat(browserManager, { chatId, agentId, profileId, path }),
    click: async (selector) =>
      clickForChat(browserManager, { chatId, agentId, profileId, selector }),
    type: async (selector, text) =>
      typeForChat(browserManager, { chatId, agentId, profileId, selector, text }),
    pressKey: async (key) =>
      pressKeyForChat(browserManager, { chatId, agentId, profileId, key }),
    closeTab: async (url) =>
      closeTabForChat(browserManager, { chatId, agentId, profileId, url }),
  }
}
