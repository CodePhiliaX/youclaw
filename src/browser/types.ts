export type BrowserDriver = 'managed' | 'remote-cdp' | 'extension-relay'
export type BrowserTarget = 'host' | 'sandbox'
export type BrowserRefAction = 'click' | 'type' | 'select' | 'check' | 'uncheck'
export type BrowserDiscoveryKind = 'chrome' | 'edge' | 'brave' | 'chromium' | 'vivaldi' | 'arc'

export type BrowserRuntimeStatus = 'starting' | 'running' | 'stopped' | 'error'

export const DEFAULT_BROWSER_PROFILE_ID = 'youclaw'
export const DEFAULT_BROWSER_PROFILE_NAME = 'YouClaw'
export const DEFAULT_CDP_PORT_START = 18800
export const DEFAULT_CDP_PORT_END = 18899

export interface BrowserProfileRecord {
  id: string
  name: string
  driver: BrowserDriver
  is_default: number
  executable_path: string | null
  user_data_dir: string | null
  cdp_port: number | null
  cdp_url: string | null
  headless: number
  no_sandbox: number
  attach_only: number
  launch_args_json: string | null
  created_at: string
  updated_at: string | null
}

export interface BrowserProfileRuntimeRecord {
  profile_id: string
  status: BrowserRuntimeStatus
  pid: number | null
  ws_endpoint: string | null
  last_error: string | null
  last_started_at: string | null
  heartbeat_at: string | null
}

export interface ChatBrowserStateRecord {
  chat_id: string
  agent_id: string
  profile_id: string
  active_target_id: string | null
  active_page_url: string | null
  active_page_title: string | null
  updated_at: string
}

export interface BrowserProfileRuntime {
  status: BrowserRuntimeStatus
  pid: number | null
  wsEndpoint: string | null
  lastError: string | null
  lastStartedAt: string | null
  heartbeatAt: string | null
}

export interface BrowserProfile {
  id: string
  name: string
  driver: BrowserDriver
  isDefault: boolean
  executablePath: string | null
  userDataDir: string | null
  cdpPort: number | null
  cdpUrl: string | null
  headless: boolean
  noSandbox: boolean
  attachOnly: boolean
  launchArgs: string[]
  createdAt: string
  updatedAt: string | null
  runtime: BrowserProfileRuntime | null
}

export interface BrowserSetupSession {
  id: string
  driver: BrowserDriver
  executablePath: string | null
  cdpUrl: string | null
  createdAt: string
  updatedAt: string | null
}

export interface ChatBrowserState {
  chatId: string
  agentId: string
  profileId: string
  activeTargetId: string | null
  activePageUrl: string | null
  activePageTitle: string | null
  updatedAt: string
}

export interface BrowserDiscoveryEntry {
  id: string
  name: string
  kind: BrowserDiscoveryKind
  executablePath: string
  isRecommended: boolean
}

export interface BrowserDiscovery {
  browsers: BrowserDiscoveryEntry[]
  recommendedBrowserId: string | null
  recommendationSource: 'env' | 'priority' | 'none'
}

export type BrowserMainBridgeStatus = 'connected' | 'paired' | 'ready' | 'no_browser_detected'
export type BrowserMainBridgeConnectionMode = 'none' | 'manual-cdp-fallback' | 'main-bridge' | 'extension-bridge'

export interface BrowserMainBridgeState {
  profileId: string
  selectedBrowserId: string | null
  selectedBrowserName: string | null
  selectedExecutablePath: string | null
  selectionSource: 'profile' | 'recommended' | 'none'
  browsers: BrowserDiscoveryEntry[]
  recommendedBrowserId: string | null
  recommendationSource: BrowserDiscovery['recommendationSource']
  relayConnected: boolean
  relayToken: string
  relayCdpUrl: string | null
  connectedBrowserId: string | null
  connectedBrowserName: string | null
  connectedBrowserKind: BrowserDiscoveryKind | null
  connectedTabId: string | null
  connectedTabUrl: string | null
  connectedTabTitle: string | null
  extensionVersion: string | null
  pairingCode: string | null
  pairingCodeExpiresAt: string | null
  connectedAt: string | null
  updatedAt: string | null
  status: BrowserMainBridgeStatus
  connectionMode: BrowserMainBridgeConnectionMode
  extensionBridgeAvailable: true
}

export interface CreateBrowserProfileInput {
  id?: string
  name: string
  driver?: BrowserDriver
  executablePath?: string | null
  userDataDir?: string | null
  cdpPort?: number | null
  cdpUrl?: string | null
  headless?: boolean
  noSandbox?: boolean
  attachOnly?: boolean
  launchArgs?: string[]
  isDefault?: boolean
}

export interface UpdateBrowserProfileInput {
  name?: string
  driver?: BrowserDriver
  executablePath?: string | null
  userDataDir?: string | null
  cdpPort?: number | null
  cdpUrl?: string | null
  headless?: boolean
  noSandbox?: boolean
  attachOnly?: boolean
  launchArgs?: string[]
  isDefault?: boolean
}

export interface BrowserProfileRuntimePatch {
  status?: BrowserRuntimeStatus
  pid?: number | null
  wsEndpoint?: string | null
  lastError?: string | null
  lastStartedAt?: string | null
  heartbeatAt?: string | null
}

export interface ChatBrowserStatePatch {
  agentId?: string
  profileId?: string
  activeTargetId?: string | null
  activePageUrl?: string | null
  activePageTitle?: string | null
}
