import { describe, expect, test } from 'bun:test'
import {
  getPrimaryImportErrorCode,
  mapImportActionError,
  normalizePastedUrl,
} from '../web/src/lib/skill-import.ts'

describe('skill import UI helpers', () => {
  test('normalizes pasted markdown bullet prefixes', () => {
    expect(normalizePastedUrl('- https://github.com/acme/tools/tree/main/skills/github-ops'))
      .toBe('https://github.com/acme/tools/tree/main/skills/github-ops')
  })

  test('validates GitHub skill links locally', () => {
    expect(getPrimaryImportErrorCode('github', 'https://github.com/acme/tools/tree/main/skills/github-ops')).toBeNull()
    expect(getPrimaryImportErrorCode('github', 'https://raw.githubusercontent.com/acme/tools/main/skills/github-ops/SKILL.md')).toBeNull()
    expect(getPrimaryImportErrorCode('github', 'https://example.com/skills/github-ops/SKILL.md')).toBe('invalid_github_url')
  })

  test('maps backend GitHub import errors to stable UI error codes', () => {
    expect(mapImportActionError('github', 'Selected GitHub location is not a skill directory')).toBe('not_skill_directory')
    expect(mapImportActionError('github', 'Selected GitHub file must be SKILL.md')).toBe('wrong_skill_file')
    expect(mapImportActionError('github', 'GitHub repository, ref, or path was not found')).toBe('not_found')
    expect(mapImportActionError('github', 'Unsupported GitHub URL format')).toBe('invalid_github_url')
  })
})
