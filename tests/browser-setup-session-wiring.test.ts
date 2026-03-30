import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()

function read(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

describe('browser setup session wiring', () => {
  test('browser routes expose setup session endpoints for main browser onboarding', () => {
    const routes = read('src/browser/routes.ts')

    expect(routes).toContain("app.post('/browser/setup-sessions'")
    expect(routes).toContain("app.get('/browser/setup-sessions/:id/main-bridge'")
    expect(routes).toContain("app.post('/browser/setup-sessions/:id/main-bridge/select'")
    expect(routes).toContain("app.post('/browser/setup-sessions/:id/main-bridge/pairing'")
    expect(routes).toContain("app.post('/browser/setup-sessions/:id/finalize'")
  })

  test('client and browser profile page use the setup session drawer flow', () => {
    const client = read('web/src/api/client.ts')
    const page = read('web/src/pages/BrowserProfiles.tsx')

    expect(client).toContain('export async function createBrowserSetupSession')
    expect(client).toContain('export async function getBrowserSetupSessionMainBridge')
    expect(client).toContain('export async function finalizeBrowserSetupSession')
    expect(page).toContain('BrowserProfileSetupDrawer')
    expect(page).toContain("createBrowserSetupSession({ driver: 'extension-relay' })")
    expect(page).toContain('finalizeBrowserSetupSession(setupSession.id')
    expect(page).toContain('right-0 top-0 h-full')
  })
})
