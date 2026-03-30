import { randomBytes } from 'node:crypto'
import type { BrowserDiscoveryKind } from './types.ts'

type PairingEntry = {
  profileId: string
  expiresAt: string
}

export interface BrowserExtensionBridgeSession {
  browserId: string | null
  browserName: string | null
  browserKind: BrowserDiscoveryKind | null
  tabId: string | null
  tabUrl: string | null
  tabTitle: string | null
  extensionVersion: string | null
  connectedAt: string
  updatedAt: string
}

export type BrowserExtensionCommandAction =
  | 'open_tab'
  | 'navigate'
  | 'snapshot'
  | 'act'
  | 'screenshot'
  | 'click'
  | 'type'
  | 'press_key'
  | 'close_tab'

export interface BrowserExtensionCommand {
  id: string
  profileId: string
  action: BrowserExtensionCommandAction
  payload: Record<string, unknown>
  createdAt: string
}

const pairingCodes = new Map<string, PairingEntry>()
const extensionSessions = new Map<string, BrowserExtensionBridgeSession>()
const pendingCommands = new Map<string, BrowserExtensionCommand[]>()
const commandWaiters = new Map<string, {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}>()
const DEFAULT_PAIRING_TTL_MS = 5 * 60 * 1000
const DEFAULT_COMMAND_TIMEOUT_MS = 15_000

function createPairingCode(): string {
  return randomBytes(4).toString('hex')
}

export function createMainBridgePairingCode(profileId: string, ttlMs = DEFAULT_PAIRING_TTL_MS): { pairingCode: string; expiresAt: string } {
  const pairingCode = createPairingCode()
  const expiresAt = new Date(Date.now() + ttlMs).toISOString()
  pairingCodes.set(pairingCode, { profileId, expiresAt })
  return { pairingCode, expiresAt }
}

export function getMainBridgePairingCode(profileId: string): { pairingCode: string; expiresAt: string } | null {
  const now = Date.now()
  for (const [pairingCode, entry] of pairingCodes.entries()) {
    if (entry.profileId !== profileId) continue
    if (Date.parse(entry.expiresAt) <= now) {
      pairingCodes.delete(pairingCode)
      continue
    }
    return { pairingCode, expiresAt: entry.expiresAt }
  }
  return null
}

export function consumeMainBridgePairingCode(pairingCode: string): { profileId: string } {
  const entry = pairingCodes.get(pairingCode)
  if (!entry) {
    throw new Error('Invalid pairing code')
  }
  if (Date.parse(entry.expiresAt) <= Date.now()) {
    pairingCodes.delete(pairingCode)
    throw new Error('Pairing code expired')
  }
  pairingCodes.delete(pairingCode)
  return { profileId: entry.profileId }
}

export function getExtensionBridgeSession(profileId: string): BrowserExtensionBridgeSession | null {
  return extensionSessions.get(profileId) ?? null
}

export function setExtensionBridgeSession(profileId: string, patch: {
  browserId?: string | null
  browserName?: string | null
  browserKind?: BrowserDiscoveryKind | null
  tabId?: string | null
  tabUrl?: string | null
  tabTitle?: string | null
  extensionVersion?: string | null
}): BrowserExtensionBridgeSession {
  const current = extensionSessions.get(profileId)
  const now = new Date().toISOString()

  const next: BrowserExtensionBridgeSession = {
    browserId: patch.browserId ?? current?.browserId ?? null,
    browserName: patch.browserName ?? current?.browserName ?? null,
    browserKind: patch.browserKind ?? current?.browserKind ?? null,
    tabId: patch.tabId ?? current?.tabId ?? null,
    tabUrl: patch.tabUrl ?? current?.tabUrl ?? null,
    tabTitle: patch.tabTitle ?? current?.tabTitle ?? null,
    extensionVersion: patch.extensionVersion ?? current?.extensionVersion ?? null,
    connectedAt: current?.connectedAt ?? now,
    updatedAt: now,
  }

  extensionSessions.set(profileId, next)
  return next
}

export function syncExtensionBridgeSession(profileId: string, patch: {
  browserId?: string | null
  browserName?: string | null
  browserKind?: BrowserDiscoveryKind | null
  tabId?: string | null
  tabUrl?: string | null
  tabTitle?: string | null
  extensionVersion?: string | null
}): BrowserExtensionBridgeSession | null {
  const current = extensionSessions.get(profileId)
  if (!current) {
    return null
  }

  return setExtensionBridgeSession(profileId, patch)
}

export function clearExtensionBridgeSession(profileId: string): void {
  extensionSessions.delete(profileId)
  pendingCommands.delete(profileId)
}

export function deleteExtensionBridgeProfile(profileId: string): void {
  clearExtensionBridgeSession(profileId)
  for (const [pairingCode, entry] of pairingCodes.entries()) {
    if (entry.profileId === profileId) {
      pairingCodes.delete(pairingCode)
    }
  }
}

export function enqueueExtensionBridgeCommand(
  profileId: string,
  action: BrowserExtensionCommandAction,
  payload: Record<string, unknown>,
  timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
): Promise<unknown> {
  const command: BrowserExtensionCommand = {
    id: randomBytes(8).toString('hex'),
    profileId,
    action,
    payload,
    createdAt: new Date().toISOString(),
  }

  const queue = pendingCommands.get(profileId) ?? []
  queue.push(command)
  pendingCommands.set(profileId, queue)

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      commandWaiters.delete(command.id)
      pendingCommands.set(profileId, (pendingCommands.get(profileId) ?? []).filter((entry) => entry.id !== command.id))
      reject(new Error(`Browser extension command "${action}" timed out`))
    }, timeoutMs)

    commandWaiters.set(command.id, {
      resolve,
      reject,
      timeout,
    })
  })
}

export function pollExtensionBridgeCommand(profileId: string): BrowserExtensionCommand | null {
  const queue = pendingCommands.get(profileId) ?? []
  return queue[0] ?? null
}

export function resolveExtensionBridgeCommand(params: {
  profileId: string
  commandId: string
  ok: boolean
  result?: unknown
  error?: string | null
}): void {
  const queue = pendingCommands.get(params.profileId) ?? []
  const nextQueue = queue.filter((entry) => entry.id !== params.commandId)
  pendingCommands.set(params.profileId, nextQueue)

  const waiter = commandWaiters.get(params.commandId)
  if (!waiter) return
  clearTimeout(waiter.timeout)
  commandWaiters.delete(params.commandId)

  if (params.ok) {
    waiter.resolve(params.result ?? {})
    return
  }

  waiter.reject(new Error(params.error ?? 'Browser extension command failed'))
}
