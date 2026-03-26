import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()

function read(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

describe('browser target routing', () => {
  test('agent schema supports browser target selection with host as the default', () => {
    const schema = read('src/agent/schema.ts')

    expect(schema).toContain("target: z.enum(['host', 'sandbox']).default('host')")
  })

  test('browser router keeps host execution and explicitly rejects sandbox for now', () => {
    const router = read('src/browser/router.ts')

    expect(router).toContain("if (target !== 'host')")
    expect(router).toContain('Browser target "${target}" is not implemented yet')
    expect(router).toContain('openTabForChat(browserManager, { chatId, agentId, profileId, url })')
    expect(router).toContain('actForChat(browserManager, { chatId, agentId, profileId, ref, action, text, option })')
  })
})
