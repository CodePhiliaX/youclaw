import type { BrowserProfile, BrowserSetupSession } from './types.ts'
import type { BrowserRelayState } from './relay.ts'

const setupSessions = new Map<string, BrowserSetupSession>()

export function createBrowserSetupSession(driver: BrowserSetupSession['driver']): BrowserSetupSession {
  const now = new Date().toISOString()
  const session: BrowserSetupSession = {
    id: crypto.randomUUID().slice(0, 8),
    driver,
    executablePath: null,
    cdpUrl: null,
    createdAt: now,
    updatedAt: now,
  }

  setupSessions.set(session.id, session)
  return session
}

export function getBrowserSetupSession(id: string): BrowserSetupSession | null {
  return setupSessions.get(id) ?? null
}

export function updateBrowserSetupSession(
  id: string,
  patch: Partial<Pick<BrowserSetupSession, 'executablePath' | 'cdpUrl'>>,
): BrowserSetupSession | null {
  const current = setupSessions.get(id)
  if (!current) return null

  const next: BrowserSetupSession = {
    ...current,
    executablePath: patch.executablePath !== undefined ? patch.executablePath : current.executablePath,
    cdpUrl: patch.cdpUrl !== undefined ? patch.cdpUrl : current.cdpUrl,
    updatedAt: new Date().toISOString(),
  }

  setupSessions.set(id, next)
  return next
}

export function deleteBrowserSetupSession(id: string): void {
  setupSessions.delete(id)
}

export function buildSetupSessionProfile(session: BrowserSetupSession): BrowserProfile {
  return {
    id: session.id,
    name: '',
    driver: session.driver,
    isDefault: false,
    executablePath: session.executablePath,
    userDataDir: null,
    cdpPort: null,
    cdpUrl: session.cdpUrl,
    headless: false,
    noSandbox: false,
    attachOnly: false,
    launchArgs: [],
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    runtime: null,
  }
}

export function buildSetupSessionRelayState(session: BrowserSetupSession): BrowserRelayState {
  return {
    token: '',
    connected: false,
    cdpUrl: session.cdpUrl,
    connectedAt: null,
    updatedAt: session.updatedAt,
  }
}
