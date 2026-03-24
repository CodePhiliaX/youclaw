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
    expect(promptBuilder).not.toContain('agent-browser --session')
    expect(promptBuilder).not.toContain('agent-browser install chrome')
    expect(promptBuilder).toContain('Do NOT invoke the legacy \\`agent-browser\\` skill')
  })

  test('agent runtime injects the built-in browser MCP server', () => {
    const runtime = read('src/agent/runtime.ts')

    expect(runtime).toContain("mcpServers['browser'] = createBrowserMcpServer({")
    expect(runtime).toContain('resolveProfileSelection(browserProfileId, this.config.browser?.defaultProfile ?? this.config.browserProfile)')
    expect(runtime).toContain('getLegacyBrowserToolBlockReason')
  })
})
