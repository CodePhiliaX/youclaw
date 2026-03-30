let pollTimer = null

function normalizeBackendUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '')
}

async function getBridgeState() {
  const stored = await chrome.storage.local.get({
    backendUrl: 'http://127.0.0.1:62601',
    bridgeProfileId: null,
    bridgeTabId: null,
  })
  return {
    backendUrl: normalizeBackendUrl(stored.backendUrl),
    profileId: stored.bridgeProfileId,
    tabId: stored.bridgeTabId,
  }
}

async function setBridgeTabId(tabId) {
  await chrome.storage.local.set({
    bridgeTabId: tabId != null ? String(tabId) : null,
  })
}

async function syncBridgeSession(patch = {}) {
  const { backendUrl, profileId, tabId } = await getBridgeState()
  if (!backendUrl || !profileId) return

  const payload = {
    profileId,
    tabId,
    ...patch,
  }

  await fetch(`${backendUrl}/api/browser/main-bridge/extension-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

async function executeInTab(tabId, fn, args = []) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: fn,
    args,
  })
  return result?.result
}

async function executeCommand(command) {
  const tabId = command.payload?.tabId ? Number(command.payload.tabId) : undefined

  switch (command.action) {
    case 'open_tab': {
      const tab = await chrome.tabs.create({ url: command.payload?.url || 'about:blank' })
      await setBridgeTabId(tab.id)
      return {
        tabId: tab.id != null ? String(tab.id) : null,
        url: tab.url ?? '',
        title: tab.title ?? '',
      }
    }
    case 'navigate': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const targetTabId = tabId ?? tab?.id
      if (!targetTabId) throw new Error('No target tab available for navigate')
      const updated = await chrome.tabs.update(targetTabId, { url: command.payload?.url || 'about:blank' })
      return {
        tabId: updated.id != null ? String(updated.id) : null,
        url: updated.url ?? '',
        title: updated.title ?? '',
      }
    }
    case 'snapshot': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const targetTabId = tabId ?? tab?.id
      if (!targetTabId) throw new Error('No target tab available for snapshot')
      const snapshot = await executeInTab(targetTabId, (refAttribute) => {
        const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
        const truncate = (value, limit = 120) => value.length > limit ? `${value.slice(0, limit - 1)}…` : value
        const isVisible = (element) => {
          const style = window.getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
        }
        document.querySelectorAll(`[${refAttribute}]`).forEach((element) => element.removeAttribute(refAttribute))
        const selector = [
          'a',
          'button',
          'input',
          'textarea',
          'select',
          '[role="button"]',
          '[role="link"]',
          '[role="textbox"]',
          '[contenteditable="true"]',
        ].join(',')
        const refs = []
        const elements = Array.from(document.querySelectorAll(selector)).filter((element) => isVisible(element)).slice(0, 80)
        for (const [index, element] of elements.entries()) {
          const ref = String(index + 1)
          element.setAttribute(refAttribute, ref)
          refs.push({
            ref,
            tag: element.tagName.toLowerCase(),
            text: truncate(normalize(element.innerText || element.textContent)),
          })
        }
        return {
          tabId: String(targetTabId),
          url: location.href,
          title: document.title,
          text: normalize(document.body?.innerText || '').slice(0, 4000),
          refs,
        }
      }, ['data-youclaw-ref'])
      return snapshot
    }
    case 'act': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const targetTabId = tabId ?? tab?.id
      if (!targetTabId) throw new Error('No target tab available for act')
      const result = await executeInTab(targetTabId, (payload, refAttribute) => {
        const element = document.querySelector(`[${refAttribute}="${payload.ref}"]`)
        if (!element) {
          throw new Error(`Ref ${payload.ref} is not available. Capture a fresh snapshot first.`)
        }
        switch (payload.interaction) {
          case 'click':
            element.click()
            break
          case 'type':
            element.value = payload.text || ''
            element.dispatchEvent(new Event('input', { bubbles: true }))
            element.dispatchEvent(new Event('change', { bubbles: true }))
            break
          case 'select':
            element.value = payload.option || ''
            element.dispatchEvent(new Event('change', { bubbles: true }))
            break
          case 'check':
            element.checked = true
            element.dispatchEvent(new Event('change', { bubbles: true }))
            break
          case 'uncheck':
            element.checked = false
            element.dispatchEvent(new Event('change', { bubbles: true }))
            break
          default:
            throw new Error(`Unsupported interaction: ${payload.interaction}`)
        }
        return {
          tabId: String(targetTabId),
          url: location.href,
          title: document.title,
        }
      }, [command.payload, 'data-youclaw-ref'])
      return result
    }
    case 'click': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const targetTabId = tabId ?? tab?.id
      if (!targetTabId) throw new Error('No target tab available for click')
      return executeInTab(targetTabId, (selector) => {
        const element = document.querySelector(selector)
        if (!element) throw new Error(`Selector not found: ${selector}`)
        element.click()
        return { tabId: String(targetTabId), url: location.href, title: document.title }
      }, [command.payload?.selector])
    }
    case 'type': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const targetTabId = tabId ?? tab?.id
      if (!targetTabId) throw new Error('No target tab available for type')
      return executeInTab(targetTabId, (selector, text) => {
        const element = document.querySelector(selector)
        if (!element) throw new Error(`Selector not found: ${selector}`)
        element.value = text || ''
        element.dispatchEvent(new Event('input', { bubbles: true }))
        element.dispatchEvent(new Event('change', { bubbles: true }))
        return { tabId: String(targetTabId), url: location.href, title: document.title }
      }, [command.payload?.selector, command.payload?.text])
    }
    case 'press_key': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const targetTabId = tabId ?? tab?.id
      if (!targetTabId) throw new Error('No target tab available for press_key')
      return executeInTab(targetTabId, (key) => {
        const target = document.activeElement || document.body
        const event = new KeyboardEvent('keydown', { key, bubbles: true })
        target.dispatchEvent(event)
        return { tabId: String(targetTabId), url: location.href, title: document.title }
      }, [command.payload?.key])
    }
    case 'close_tab': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const targetTabId = tabId ?? tab?.id
      if (!targetTabId) throw new Error('No target tab available for close_tab')
      await chrome.tabs.remove(targetTabId)
      await setBridgeTabId(null)
      return { closed: true, tabId: null, url: null, title: null }
    }
    case 'screenshot': {
      const targetWindowId = undefined
      const dataUrl = await chrome.tabs.captureVisibleTab(targetWindowId, { format: 'png' })
      const [tab] = tabId != null
        ? await chrome.tabs.query({ windowType: 'normal' }).then((tabs) => tabs.filter((entry) => entry.id === tabId))
        : await chrome.tabs.query({ active: true, currentWindow: true })
      return {
        tabId: tab?.id != null ? String(tab.id) : null,
        dataUrl,
        url: tab?.url ?? '',
        title: tab?.title ?? '',
      }
    }
    default:
      throw new Error(`Unsupported browser extension command: ${command.action}`)
  }
}

async function reportCommandResult(backendUrl, profileId, commandId, payload) {
  await fetch(`${backendUrl}/api/browser/main-bridge/extension-result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profileId,
      commandId,
      ...payload,
    }),
  })
}

async function pollBridgeOnce() {
  const { backendUrl, profileId } = await getBridgeState()
  if (!backendUrl || !profileId) {
    return
  }

  const res = await fetch(`${backendUrl}/api/browser/main-bridge/extension-poll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileId }),
  })
  const body = await res.json().catch(() => null)
  const command = body?.command
  if (!command) return

  try {
    const result = await executeCommand(command)
    await reportCommandResult(backendUrl, profileId, command.id, {
      ok: true,
      result,
    })
  } catch (error) {
    await reportCommandResult(backendUrl, profileId, command.id, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function ensurePolling() {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    void pollBridgeOnce()
  }, 2000)
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('YouClaw Main Browser Bridge installed')
  ensurePolling()
})

chrome.runtime.onStartup.addListener(() => {
  ensurePolling()
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'bridge-attached') {
    chrome.storage.local.set({
      backendUrl: normalizeBackendUrl(message.backendUrl),
      bridgeProfileId: message.profileId ?? null,
      bridgeTabId: message.tabId ?? null,
    }).then(() => {
      void syncBridgeSession({
        tabId: message.tabId ?? null,
      })
      ensurePolling()
      sendResponse({ ok: true })
    }).catch((error) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
    })
    return true
  }
  if (message?.type === 'bridge-detached') {
    chrome.storage.local.set({
      bridgeProfileId: null,
      bridgeTabId: null,
    }).then(() => {
      sendResponse({ ok: true })
    }).catch((error) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
    })
    return true
  }
  return false
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && !changeInfo.title && changeInfo.status !== 'complete') {
    return
  }

  void getBridgeState().then((state) => {
    if (!state.profileId || !state.tabId) return
    if (String(tabId) !== String(state.tabId)) return

    void syncBridgeSession({
      tabId: String(tabId),
      tabUrl: tab.url ?? null,
      tabTitle: tab.title ?? null,
    })
  })
})

chrome.tabs.onRemoved.addListener((tabId) => {
  void getBridgeState().then((state) => {
    if (!state.profileId || !state.tabId) return
    if (String(tabId) !== String(state.tabId)) return

    void setBridgeTabId(null).then(() =>
      syncBridgeSession({
        tabId: null,
        tabUrl: null,
        tabTitle: null,
      }),
    )
  })
})
