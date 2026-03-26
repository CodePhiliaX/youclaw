import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()

function read(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

describe('browser ref act wiring', () => {
  test('pw-session forwards ref-based act requests to the node runner', () => {
    const session = read('src/browser/pw-session.ts')

    expect(session).toContain("| 'act'")
    expect(session).toContain("interaction?: BrowserRefAction")
    expect(session).toContain("action: 'act'")
    expect(session).toContain('export async function actForChat(')
  })

  test('snapshot payload now includes refs from the runner', () => {
    const session = read('src/browser/pw-session.ts')
    const runner = read('src/browser/playwright-runner.js')

    expect(session).toContain('refs: result.refs ?? []')
    expect(runner).toContain('Capture a fresh snapshot first.')
    expect(runner).toContain('refs.push({')
    expect(runner).toContain('element.setAttribute(refAttribute, ref)')
  })
})
