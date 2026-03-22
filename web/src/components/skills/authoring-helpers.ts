import type { SkillAuthoringDraft, SkillFrontmatter } from '@/api/client'

type ArrayFrontmatterKey = 'os' | 'dependencies' | 'env' | 'tools' | 'tags' | 'globs' | 'requires' | 'conflicts'
type RecordFrontmatterKey = 'install'
type ScalarFrontmatterKey = 'name' | 'description' | 'version' | 'priority' | 'setup' | 'teardown' | 'source'

const ARRAY_FRONTMATTER_KEYS = new Set<ArrayFrontmatterKey>([
  'os',
  'dependencies',
  'env',
  'tools',
  'tags',
  'globs',
  'requires',
  'conflicts',
])

const RECORD_FRONTMATTER_KEYS = new Set<RecordFrontmatterKey>(['install'])
const SCALAR_FRONTMATTER_KEYS = new Set<ScalarFrontmatterKey>([
  'name',
  'description',
  'version',
  'priority',
  'setup',
  'teardown',
  'source',
])

export function arrayToLines(values?: string[]) {
  return values?.join('\n') ?? ''
}

export function linesToArray(value: string) {
  const next = value.split('\n').map((line) => line.trim()).filter(Boolean)
  return next.length > 0 ? next : undefined
}

export function recordToLines(value?: Record<string, string>) {
  if (!value) return ''
  return Object.entries(value).map(([key, item]) => `${key}: ${item}`).join('\n')
}

export function linesToRecord(value: string) {
  const entries = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [key, ...rest] = line.split(':')
      return [key?.trim() ?? '', rest.join(':').trim()] as const
    })
    .filter(([key, item]) => key && item)
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

export function normalizeSlug(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

export function sanitizeVersionInput(value: string) {
  const digitsOnly = value.replace(/\D+/g, '')
  return digitsOnly.length > 0 ? String(Number.parseInt(digitsOnly, 10)) : ''
}

export function resolveDraftVersion(value?: string | null) {
  const normalized = sanitizeVersionInput(value ?? '')
  return normalized || '1'
}

export function bumpDraftVersion(value?: string | null) {
  const normalized = sanitizeVersionInput(value ?? '')
  if (!normalized) return '1'
  return String(Number.parseInt(normalized, 10) + 1)
}

export function normalizeHeadingText(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function findNearestSectionHeading(content: string, cursor: number) {
  const safeCursor = Math.max(0, Math.min(cursor, content.length))
  const lines = content.slice(0, safeCursor).split('\n')

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = lines[index]?.match(/^##\s+(.+?)\s*$/)
    if (match?.[1]) {
      return match[1].trim()
    }
  }

  const firstMatch = content.match(/^##\s+(.+?)\s*$/m)
  return firstMatch?.[1]?.trim() ?? null
}

export function scrollPreviewToHeading(container: HTMLDivElement, heading: string) {
  const headings = Array.from(container.querySelectorAll<HTMLElement>('h2, h3, h4'))
  const normalizedTarget = normalizeHeadingText(heading)
  const target = headings.find((node) => normalizeHeadingText(node.textContent ?? '') === normalizedTarget)
  if (!target) return

  container.scrollTo({
    top: Math.max(target.offsetTop - 24, 0),
    behavior: 'smooth',
  })
}

export function extractMarkdownBody(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, '\n').trim()
  if (!normalized.startsWith('---\n')) {
    return normalized
  }

  const closingIndex = normalized.indexOf('\n---\n', 4)
  if (closingIndex === -1) {
    return normalized
  }

  return normalized.slice(closingIndex + 5).trim()
}

export function parseSkillMarkdownLocal(markdown: string, fallbackFrontmatter: SkillFrontmatter): SkillAuthoringDraft {
  const normalized = markdown.replace(/\r\n/g, '\n')
  const body = extractMarkdownBody(normalized)
  const frontmatter = parseFrontmatterBlock(normalized, fallbackFrontmatter)

  return {
    frontmatter,
    content: body,
    rawMarkdown: normalized,
  }
}

export function stringifySkillMarkdownLocal(
  frontmatter: Partial<SkillFrontmatter> & { name: string; description: string },
  content: string,
) {
  const lines: string[] = ['---']

  const pushScalar = (key: string, value: string | undefined) => {
    if (!value?.trim()) return
    lines.push(`${key}: ${value.trim()}`)
  }

  const pushArray = (key: string, value?: string[]) => {
    if (!value || value.length === 0) return
    lines.push(`${key}:`)
    for (const item of value) {
      if (!item.trim()) continue
      lines.push(`  - ${item.trim()}`)
    }
  }

  const pushRecord = (key: string, value?: Record<string, string>) => {
    if (!value || Object.keys(value).length === 0) return
    lines.push(`${key}:`)
    for (const [recordKey, recordValue] of Object.entries(value)) {
      if (!recordKey.trim() || !recordValue.trim()) continue
      lines.push(`  ${recordKey.trim()}: ${recordValue.trim()}`)
    }
  }

  pushScalar('name', normalizeSlug(frontmatter.name))
  pushScalar('description', frontmatter.description)
  pushScalar('version', frontmatter.version)
  pushArray('os', frontmatter.os)
  pushArray('dependencies', frontmatter.dependencies)
  pushArray('env', frontmatter.env)
  pushArray('tools', frontmatter.tools)
  pushArray('tags', frontmatter.tags)
  pushArray('globs', frontmatter.globs)
  if (frontmatter.priority) pushScalar('priority', frontmatter.priority)
  pushRecord('install', frontmatter.install)
  pushArray('requires', frontmatter.requires)
  pushArray('conflicts', frontmatter.conflicts)
  pushScalar('setup', frontmatter.setup)
  pushScalar('teardown', frontmatter.teardown)
  pushScalar('source', frontmatter.source)
  lines.push('---', '')
  if (content.trim()) {
    lines.push(content.trim())
  }
  lines.push('')
  return lines.join('\n')
}

export function buildSkillPreviewMarkdown(
  frontmatter: Partial<SkillFrontmatter> & { name: string; description: string },
  content: string,
) {
  const metaLines: string[] = []
  const body = content.trim()

  const pushScalar = (key: string, value: string | undefined) => {
    if (!value?.trim()) return
    metaLines.push(`- \`${key}\`: ${value.trim()}`)
  }

  const pushArray = (key: string, value?: string[]) => {
    const items = value?.map((item) => item.trim()).filter(Boolean) ?? []
    if (items.length === 0) return
    metaLines.push(`- \`${key}\`:`)
    for (const item of items) {
      metaLines.push(`  - ${item}`)
    }
  }

  const pushRecord = (key: string, value?: Record<string, string>) => {
    const entries = Object.entries(value ?? {}).filter(([recordKey, recordValue]) => (
      recordKey.trim() && recordValue.trim()
    ))
    if (entries.length === 0) return
    metaLines.push(`- \`${key}\`:`)
    for (const [recordKey, recordValue] of entries) {
      metaLines.push(`  - ${recordKey.trim()}: ${recordValue.trim()}`)
    }
  }

  pushScalar('name', normalizeSlug(frontmatter.name))
  pushScalar('description', frontmatter.description)
  pushScalar('version', frontmatter.version)
  pushArray('os', frontmatter.os)
  pushArray('dependencies', frontmatter.dependencies)
  pushArray('env', frontmatter.env)
  pushArray('tools', frontmatter.tools)
  pushArray('globs', frontmatter.globs)
  if (frontmatter.priority) pushScalar('priority', frontmatter.priority)
  pushRecord('install', frontmatter.install)
  pushArray('requires', frontmatter.requires)
  pushArray('conflicts', frontmatter.conflicts)
  pushScalar('setup', frontmatter.setup)
  pushScalar('teardown', frontmatter.teardown)
  pushScalar('source', frontmatter.source)

  if (metaLines.length === 0) {
    return body
  }

  if (!body) {
    return metaLines.join('\n')
  }

  return `${metaLines.join('\n')}\n\n---\n\n${body}`
}

export function formatSkillFrontmatterPreview(
  frontmatter: Partial<SkillFrontmatter> & { name: string; description: string },
) {
  const lines: string[] = ['---']

  const pushScalar = (key: string, value: string | undefined) => {
    if (!value?.trim()) return
    lines.push(`${key}: ${value.trim()}`)
  }

  const pushArray = (key: string, value?: string[]) => {
    const items = value?.map((item) => item.trim()).filter(Boolean) ?? []
    if (items.length === 0) return
    lines.push(`${key}:`)
    for (const item of items) {
      lines.push(`  - ${item}`)
    }
  }

  const pushRecord = (key: string, value?: Record<string, string>) => {
    const entries = Object.entries(value ?? {}).filter(([recordKey, recordValue]) => (
      recordKey.trim() && recordValue.trim()
    ))
    if (entries.length === 0) return
    lines.push(`${key}:`)
    for (const [recordKey, recordValue] of entries) {
      lines.push(`  ${recordKey.trim()}: ${recordValue.trim()}`)
    }
  }

  pushScalar('name', normalizeSlug(frontmatter.name))
  pushScalar('description', frontmatter.description)
  pushScalar('version', frontmatter.version)
  pushArray('os', frontmatter.os)
  pushArray('dependencies', frontmatter.dependencies)
  pushArray('env', frontmatter.env)
  pushArray('tools', frontmatter.tools)
  pushArray('tags', frontmatter.tags)
  pushArray('globs', frontmatter.globs)
  if (frontmatter.priority) pushScalar('priority', frontmatter.priority)
  pushRecord('install', frontmatter.install)
  pushArray('requires', frontmatter.requires)
  pushArray('conflicts', frontmatter.conflicts)
  pushScalar('setup', frontmatter.setup)
  pushScalar('teardown', frontmatter.teardown)
  pushScalar('source', frontmatter.source)
  lines.push('---')

  return lines.join('\n')
}

function parseFrontmatterBlock(markdown: string, fallbackFrontmatter: SkillFrontmatter): SkillFrontmatter {
  const normalized = markdown.replace(/\r\n/g, '\n')
  const parsed: Partial<SkillFrontmatter> = {
    version: undefined,
    os: undefined,
    dependencies: undefined,
    env: undefined,
    tools: undefined,
    tags: undefined,
    globs: undefined,
    priority: undefined,
    install: undefined,
    requires: undefined,
    conflicts: undefined,
    setup: undefined,
    teardown: undefined,
    source: undefined,
  }

  if (normalized.startsWith('---\n')) {
    const closingIndex = normalized.indexOf('\n---\n', 4)
    if (closingIndex !== -1) {
      const frontmatterLines = normalized.slice(4, closingIndex).split('\n')
      let activeArrayKey: ArrayFrontmatterKey | null = null
      let activeRecordKey: RecordFrontmatterKey | null = null

      for (const rawLine of frontmatterLines) {
        const line = rawLine.replace(/\s+$/g, '')
        const trimmed = line.trim()

        if (!trimmed) {
          continue
        }

        if (activeArrayKey && line.startsWith('  - ')) {
          const nextValue = line.slice(4).trim()
          if (!nextValue) {
            continue
          }
          parsed[activeArrayKey] = [...((parsed[activeArrayKey] as string[] | undefined) ?? []), nextValue]
          continue
        }

        if (activeRecordKey && line.startsWith('  ')) {
          const separatorIndex = line.indexOf(':')
          if (separatorIndex > 2) {
            const recordKey = line.slice(2, separatorIndex).trim()
            const recordValue = line.slice(separatorIndex + 1).trim()
            if (recordKey && recordValue) {
              parsed[activeRecordKey] = {
                ...((parsed[activeRecordKey] as Record<string, string> | undefined) ?? {}),
                [recordKey]: recordValue,
              }
            }
          }
          continue
        }

        activeArrayKey = null
        activeRecordKey = null

        const separatorIndex = line.indexOf(':')
        if (separatorIndex <= 0) {
          continue
        }

        const key = line.slice(0, separatorIndex).trim()
        const rawValue = line.slice(separatorIndex + 1).trim()

        if (isArrayFrontmatterKey(key)) {
          parsed[key] = rawValue ? [rawValue] : []
          activeArrayKey = rawValue ? null : key
          continue
        }

        if (isRecordFrontmatterKey(key)) {
          parsed[key] = {}
          activeRecordKey = key
          continue
        }

        if (isScalarFrontmatterKey(key)) {
          switch (key) {
            case 'name':
              parsed.name = rawValue || undefined
              break
            case 'description':
              parsed.description = rawValue || undefined
              break
            case 'version':
              parsed.version = rawValue || undefined
              break
            case 'priority':
              parsed.priority = (rawValue || undefined) as SkillFrontmatter['priority']
              break
            case 'setup':
              parsed.setup = rawValue || undefined
              break
            case 'teardown':
              parsed.teardown = rawValue || undefined
              break
            case 'source':
              parsed.source = rawValue || undefined
              break
          }
        }
      }
    }
  }

  return {
    ...fallbackFrontmatter,
    ...parsed,
    name: parsed.name ?? fallbackFrontmatter.name,
    description: parsed.description ?? fallbackFrontmatter.description,
  }
}

function isArrayFrontmatterKey(value: string): value is ArrayFrontmatterKey {
  return ARRAY_FRONTMATTER_KEYS.has(value as ArrayFrontmatterKey)
}

function isRecordFrontmatterKey(value: string): value is RecordFrontmatterKey {
  return RECORD_FRONTMATTER_KEYS.has(value as RecordFrontmatterKey)
}

function isScalarFrontmatterKey(value: string): value is ScalarFrontmatterKey {
  return SCALAR_FRONTMATTER_KEYS.has(value as ScalarFrontmatterKey)
}
