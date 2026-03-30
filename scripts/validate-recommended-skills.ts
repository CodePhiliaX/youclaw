import {
  MAX_ARCHIVE_BYTES,
  unpackZipArchive,
} from '../src/skills/archive.ts'
import { parseFrontmatter } from '../src/skills/frontmatter.ts'
import recommendedSkillsData, {
  recommendedCategoryOrder,
  type RecommendedEntry,
} from '../src/skills/recommended/index.ts'
import {
  recommendationSourceEntries,
  recommendationSourceIndex,
} from '../src/skills/recommendation-sources/index.ts'
import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const TENCENT_DOWNLOAD_URL = 'https://lightmake.site/api/v1/download'
const VALID_CATEGORIES = new Set(recommendedCategoryOrder)

async function fetchWithRetry(url: string): Promise<Response> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json,application/zip,*/*',
        'User-Agent': 'youclaw-recommended-validator',
      },
    })

    if (response.status !== 429 || attempt === 11) {
      return response
    }

    const retryAfter = Number.parseInt(response.headers.get('retry-after') || '1', 10)
    await Bun.sleep((Number.isFinite(retryAfter) ? Math.max(retryAfter, 1) : 1) * 1000)
  }

  throw new Error(`Unexpected retry loop for ${url}`)
}

async function validateEntry(entry: RecommendedEntry) {
  if (!VALID_CATEGORIES.has(entry.category)) {
    throw new Error(`Unsupported category "${entry.category}"`)
  }

  if (!entry.slug.trim() || !entry.displayName.trim() || !entry.summary.trim()) {
    throw new Error('Recommended entry is missing required text fields')
  }

  if (!Array.isArray(entry.tags) || entry.tags.length === 0) {
    throw new Error('Recommended entry must define at least one tag')
  }

  const sourceEntry = recommendationSourceIndex.get(entry.slug)
  if (!sourceEntry) {
    throw new Error('Recommended slug is missing from recommendation sources')
  }

  const downloadResponse = await fetchWithRetry(`${TENCENT_DOWNLOAD_URL}?slug=${encodeURIComponent(entry.slug)}`)
  if (!downloadResponse.ok) {
    throw new Error(`Download request failed: HTTP ${downloadResponse.status}`)
  }

  const contentLength = Number.parseInt(downloadResponse.headers.get('content-length') || '0', 10)
  if (Number.isFinite(contentLength) && contentLength > MAX_ARCHIVE_BYTES) {
    throw new Error(`Archive exceeds ${MAX_ARCHIVE_BYTES} bytes`)
  }

  const archiveBuffer = new Uint8Array(await downloadResponse.arrayBuffer())
  if (archiveBuffer.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error(`Archive exceeds ${MAX_ARCHIVE_BYTES} bytes`)
  }

  const entries = unpackZipArchive(archiveBuffer)
  const skillMd = entries.find((archiveEntry) => archiveEntry.relativePath === 'SKILL.md')
  if (!skillMd) {
    throw new Error('Archive does not contain a root SKILL.md')
  }

  parseFrontmatter(Buffer.from(skillMd.content).toString('utf-8'))
}

async function main() {
  const entries = recommendedSkillsData

  const seen = new Set<string>()
  let hasFailure = false
  const builtinSkillNames = new Set(
    readdirSync(resolve(process.cwd(), 'skills'))
      .filter((entry) => existsSync(resolve(process.cwd(), 'skills', entry, 'SKILL.md'))),
  )

  if (recommendationSourceIndex.size !== recommendationSourceEntries.length) {
    console.error('FAIL recommendation-sources: duplicate slugs detected in source shards')
    process.exit(1)
  }

  for (const entry of entries) {
    if (seen.has(entry.slug)) {
      console.error(`FAIL ${entry.slug}: duplicate slug`)
      hasFailure = true
      continue
    }
    if (builtinSkillNames.has(entry.slug)) {
      console.error(`FAIL ${entry.slug}: duplicates a builtin project skill`)
      hasFailure = true
      continue
    }
    seen.add(entry.slug)

    try {
      await validateEntry(entry)
      console.log(`OK   ${entry.slug}`)
    } catch (error) {
      hasFailure = true
      const message = error instanceof Error ? error.message : String(error)
      console.error(`FAIL ${entry.slug}: ${message}`)
    }
  }

  if (hasFailure) {
    process.exitCode = 1
    return
  }

  console.log(`Validated ${entries.length} recommended skills`)
}

await main()
