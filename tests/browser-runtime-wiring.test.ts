import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()

function read(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

describe('browser runtime wiring', () => {
  test('prompt builder instructs the agent to use browser MCP tools instead of agent-browser CLI', () => {
    const promptBuilder = read('src/agent/prompt-builder.ts')

    expect(promptBuilder).toContain('mcp__browser__*')
    expect(promptBuilder).toContain('Prefer the built-in \\`mcp__browser__*\\` tools')
    expect(promptBuilder).toContain('snapshot, act, screenshot, click, type, press_key, and close_tab')
    expect(promptBuilder).toContain('prefer taking a fresh \\`snapshot\\` first and then using \\`act\\` with element refs')
    expect(promptBuilder).toContain('routed to target "${context.browserTarget ?? \'host\'}"')
    expect(promptBuilder).toContain('If the current browser target reports that it is not implemented')
    expect(promptBuilder).toContain('Use the legacy \\`agent-browser\\` skill only when you need capabilities not yet covered')
    expect(promptBuilder).toContain('agent-browser --session ${context.browserProfile.id} --profile ${context.browserProfile.userDataDir} <command>')
    expect(promptBuilder).toContain('Manual login is the default and recommended flow')
    expect(promptBuilder).toContain('Do NOT ask the user for credentials')
    expect(promptBuilder).toContain('If the site shows CAPTCHA, 2FA, device verification')
    expect(promptBuilder).toContain('For sensitive or high-impact actions, prepare the page and then ask the user to review, confirm, or complete the final step manually')
  })

  test('prompt builder can explicitly disable all browser usage for a chat', () => {
    const promptBuilder = read('src/agent/prompt-builder.ts')

    expect(promptBuilder).toContain('Browser use is explicitly disabled for this request.')
    expect(promptBuilder).toContain('Do NOT use the built-in \\`mcp__browser__*\\` tools.')
    expect(promptBuilder).toContain('Do NOT invoke the legacy \\`agent-browser\\` skill')
    expect(promptBuilder).toContain('can be enabled by configuring a browser profile for this agent or request')
    expect(promptBuilder).toContain('reply with a short, user-facing explanation')
  })

  test('agent runtime threads browser target into prompt and runtime tools', () => {
    const runtime = read('src/agent/runtime.ts')
    const runtimeTools = read('src/agent/runtime-tools.ts')

    expect(runtime).toContain("const browserTarget = this.config.browser?.target ?? 'host'")
    expect(runtime).toContain('browserProfile: resolvedBrowserProfile')
    expect(runtime).toContain('browserTarget,')
    expect(runtime).toContain('const browserDisabled = browserProfileId === null')
    expect(runtime).toContain('getDisabledBrowserToolBlockReason')
    expect(runtime).toContain('const browserDisabledNotice = { sent: false }')
    expect(runtime).toContain('buildDisabledBrowserUserMessage')
    expect(runtime).toContain('Browser automation is currently disabled for this request.')
    expect(runtimeTools).toContain('browserTarget?: BrowserTarget')
    expect(runtimeTools).toContain("target: params.browserTarget ?? 'host'")
    expect(runtimeTools).toContain("logBrowserToolRegistration(params.browserProfileId, params.browserTarget ?? 'host')")
  })

  test('browser MCP exposes ref-based snapshot and act tools', () => {
    const mcp = read('src/browser/mcp.ts')
    const runner = read('src/browser/playwright-runner.js')
    const router = read('src/browser/router.ts')

    expect(mcp).toContain("'snapshot'")
    expect(mcp).toContain("'act'")
    expect(mcp).toContain('createBrowserActionRouter')
    expect(mcp).toContain('Prefer this over raw CSS selectors')
    expect(runner).toContain('data-youclaw-ref')
    expect(runner).toContain('Ref ${input.ref} is not available. Capture a fresh snapshot first.')
    expect(router).toContain('Browser target "${target}" is not implemented yet')
  })
})
