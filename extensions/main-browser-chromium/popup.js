const backendInput = document.getElementById('backend')
const pairingInput = document.getElementById('pairing')
const connectButton = document.getElementById('connect')
const disconnectButton = document.getElementById('disconnect')
const currentTabPanel = document.getElementById('current-tab')
const attachedTabPanel = document.getElementById('attached-tab')
const status = document.getElementById('status')

function normalizeBackendUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '')
}

function setStatus(message, isError = false) {
  status.textContent = message
  status.style.color = isError ? '#c03a2b' : '#2f6f44'
}

function describeTab(tab) {
  if (!tab) {
    return 'Unavailable'
  }
  const title = tab.title || '(untitled tab)'
  const url = tab.url || '(no URL)'
  return `${title}\n${url}`
}

async function getStoredBridgeState() {
  return chrome.storage.local.get({
    backendUrl: 'http://127.0.0.1:62601',
    pairingCode: '',
    bridgeProfileId: null,
    bridgeTabId: null,
  })
}

async function loadDefaults() {
  const stored = await getStoredBridgeState()
  backendInput.value = stored.backendUrl
  pairingInput.value = stored.pairingCode
}

async function saveDefaults() {
  await chrome.storage.local.set({
    backendUrl: normalizeBackendUrl(backendInput.value),
    pairingCode: pairingInput.value.trim(),
  })
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab) {
    throw new Error('No active tab found')
  }
  return tab
}

async function getAttachedTab(attachedTabId) {
  if (!attachedTabId) return null
  try {
    const tab = await chrome.tabs.get(Number(attachedTabId))
    return tab
  } catch {
    return null
  }
}

async function refreshUi() {
  const [currentTab, stored] = await Promise.all([
    getCurrentTab().catch(() => null),
    getStoredBridgeState(),
  ])

  const activeTabId = currentTab?.id != null ? String(currentTab.id) : null
  const attachedTabId = stored.bridgeTabId ? String(stored.bridgeTabId) : null
  const attachedTab = await getAttachedTab(attachedTabId)
  const hasBridge = !!stored.bridgeProfileId && !!attachedTabId

  currentTabPanel.textContent = describeTab(currentTab)
  attachedTabPanel.textContent = hasBridge
    ? describeTab(attachedTab) + (attachedTabId ? `\n(tab id: ${attachedTabId})` : '')
    : 'No tab connected.'

  disconnectButton.disabled = !hasBridge

  if (!hasBridge) {
    connectButton.textContent = 'Connect Current Tab'
    setStatus('No tab is currently connected.')
    return
  }

  if (activeTabId && attachedTabId === activeTabId) {
    connectButton.textContent = 'Reconnect Current Tab'
    setStatus('Current tab is connected to YouClaw.')
    return
  }

  connectButton.textContent = 'Switch To Current Tab'
  setStatus('Another tab is currently connected. Use this button to switch the bridge to the current tab.', true)
}

async function connectCurrentTab() {
  const backendUrl = normalizeBackendUrl(backendInput.value)
  const pairingCode = pairingInput.value.trim()
  if (!backendUrl || !pairingCode) {
    throw new Error('Backend URL and pairing code are required')
  }

  const tab = await getCurrentTab()
  const browserName = navigator.userAgent.includes('Edg/')
    ? 'Microsoft Edge'
    : navigator.userAgent.includes('Brave')
      ? 'Brave'
      : navigator.userAgent.includes('Chrome')
        ? 'Google Chrome'
        : 'Chromium Browser'
  const browserKind = navigator.userAgent.includes('Edg/')
    ? 'edge'
    : navigator.userAgent.includes('Brave')
      ? 'brave'
      : navigator.userAgent.includes('Chrome')
        ? 'chrome'
        : 'chromium'

  const res = await fetch(`${backendUrl}/api/browser/main-bridge/extension-attach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pairingCode,
      browserName,
      browserKind,
      tabId: tab.id != null ? String(tab.id) : null,
      tabUrl: tab.url ?? null,
      tabTitle: tab.title ?? null,
      extensionVersion: chrome.runtime.getManifest().version,
    }),
  })

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(body?.error || `Attach failed: ${res.status}`)
  }

  await chrome.storage.local.set({
    backendUrl,
    bridgeProfileId: body?.state?.profileId ?? null,
    bridgeTabId: tab.id != null ? String(tab.id) : null,
    pairingCode,
  })
  chrome.runtime.sendMessage({
    type: 'bridge-attached',
    backendUrl,
    profileId: body?.state?.profileId ?? null,
    tabId: tab.id != null ? String(tab.id) : null,
  })

  return body
}

async function disconnectCurrentTab() {
  const stored = await getStoredBridgeState()
  const backendUrl = normalizeBackendUrl(stored.backendUrl)
  if (!backendUrl || !stored.bridgeProfileId) {
    throw new Error('No connected bridge session found')
  }

  const res = await fetch(`${backendUrl}/api/browser/main-bridge/extension-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profileId: stored.bridgeProfileId,
      tabId: null,
      tabUrl: null,
      tabTitle: null,
      extensionVersion: chrome.runtime.getManifest().version,
    }),
  })

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(body?.error || `Disconnect failed: ${res.status}`)
  }

  await chrome.storage.local.set({
    bridgeProfileId: null,
    bridgeTabId: null,
  })
  chrome.runtime.sendMessage({
    type: 'bridge-detached',
  })
}

connectButton.addEventListener('click', async () => {
  connectButton.disabled = true
  disconnectButton.disabled = true
  setStatus('Connecting current tab...')
  try {
    await saveDefaults()
    await connectCurrentTab()
    setStatus('Current tab connected to YouClaw.')
    await refreshUi()
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true)
  } finally {
    connectButton.disabled = false
    await refreshUi()
  }
})

disconnectButton.addEventListener('click', async () => {
  connectButton.disabled = true
  disconnectButton.disabled = true
  setStatus('Disconnecting current tab...')
  try {
    await disconnectCurrentTab()
    setStatus('Current tab disconnected from YouClaw.')
    await refreshUi()
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true)
  } finally {
    connectButton.disabled = false
    await refreshUi()
  }
})

loadDefaults()
  .then(() => refreshUi())
  .catch(() => {
    setStatus('Failed to load extension defaults.', true)
  })
