import { beforeEach, describe, expect, test } from 'bun:test'
import {
  buildSetupSessionProfile,
  buildSetupSessionRelayState,
  createBrowserSetupSession,
  deleteBrowserSetupSession,
  getBrowserSetupSession,
  updateBrowserSetupSession,
} from '../src/browser/setup-session.ts'

describe('browser setup session', () => {
  beforeEach(() => {
    for (const id of ['setup-a', 'setup-b']) {
      deleteBrowserSetupSession(id)
    }
  })

  test('creates an extension-relay setup session with a stable profile-like shape', () => {
    const session = createBrowserSetupSession('extension-relay')
    const stored = getBrowserSetupSession(session.id)

    expect(stored).not.toBeNull()
    expect(stored?.driver).toBe('extension-relay')

    const profile = buildSetupSessionProfile(session)
    expect(profile.id).toBe(session.id)
    expect(profile.driver).toBe('extension-relay')
    expect(profile.runtime).toBeNull()

    const relay = buildSetupSessionRelayState(session)
    expect(relay.connected).toBe(false)
    expect(relay.token).toBe('')

    deleteBrowserSetupSession(session.id)
  })

  test('updates executable path without persisting a real browser profile', () => {
    const session = createBrowserSetupSession('extension-relay')
    const updated = updateBrowserSetupSession(session.id, {
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    })

    expect(updated?.executablePath).toContain('Google Chrome')
    expect(getBrowserSetupSession(session.id)?.executablePath).toContain('Google Chrome')

    deleteBrowserSetupSession(session.id)
  })
})
