import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()

function read(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

describe('browser extension bridge wiring', () => {
  test('browser routes expose extension attach and pairing endpoints', () => {
    const routes = read('src/browser/routes.ts')

    expect(routes).toContain("app.post('/browser/profiles/:id/main-bridge/pairing'")
    expect(routes).toContain("app.post('/browser/main-bridge/extension-attach'")
    expect(routes).toContain("app.post('/browser/main-bridge/extension-poll'")
    expect(routes).toContain("app.post('/browser/main-bridge/extension-result'")
    expect(routes).toContain("app.post('/browser/main-bridge/extension-sync'")
    expect(routes).toContain('extensionCorsHeaders()')
  })

  test('extension skeleton posts current tab metadata to the local bridge endpoint', () => {
    const manifest = read('extensions/main-browser-chromium/manifest.json')
    const popup = read('extensions/main-browser-chromium/popup.js')
    const worker = read('extensions/main-browser-chromium/service-worker.js')
    const popupHtml = read('extensions/main-browser-chromium/popup.html')

    expect(manifest).toContain('"manifest_version": 3')
    expect(manifest).toContain('"permissions": ["tabs", "activeTab", "storage", "scripting"]')
    expect(manifest).toContain('"host_permissions": ["http://127.0.0.1:*/*", "http://localhost:*/*"]')
    expect(popup).toContain('/api/browser/main-bridge/extension-attach')
    expect(popupHtml).toContain('Connect Current Tab')
    expect(popupHtml).toContain('Disconnect Current Tab')
    expect(popup).toContain('connectCurrentTab()')
    expect(popup).toContain('disconnectCurrentTab()')
    expect(popup).toContain('bridgeTabId')
    expect(popup).toContain('refreshUi()')
    expect(popup).toContain('chrome.tabs.query')
    expect(worker).toContain('/api/browser/main-bridge/extension-poll')
    expect(worker).toContain('/api/browser/main-bridge/extension-result')
    expect(worker).toContain('/api/browser/main-bridge/extension-sync')
    expect(worker).toContain('executeCommand(command)')
    expect(worker).toContain('bridgeTabId')
    expect(worker).toContain('chrome.tabs.onUpdated.addListener')
    expect(worker).toContain('chrome.tabs.onRemoved.addListener')
    expect(worker).toContain("message?.type === 'bridge-detached'")
  })
})
