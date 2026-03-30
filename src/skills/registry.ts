import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { getPaths } from '../config/index.ts'
import { getLogger } from '../logger/index.ts'
import { getSettings } from '../settings/manager.ts'
import { parseFrontmatter } from './frontmatter.ts'
import type { SkillsLoader } from './loader.ts'
import recommendedSkillsData, {
  recommendedCategoryOrder,
  type RecommendedCategory,
  type RecommendedEntry,
} from './recommended/index.ts'
import {
  recommendationSourceIndex,
  type RecommendationSourceEntry,
} from './recommendation-sources/index.ts'
import type { SkillRegistryMeta } from './types.ts'
import { MAX_ARCHIVE_BYTES, unpackZipArchive, writeArchiveEntries } from './archive.ts'
import {
  createCursorLoopKey,
  formatClawHubListCursor,
  formatTencentListCursor,
  parseClawHubListCursor,
  parseTencentListCursor,
} from './registry-cursors.ts'
import { takeMarketplacePageSlice } from './registry-pagination.ts'
import { findExactTencentSlug } from './registry-tencent-query.ts'

export type MarketplaceSort =
  | 'score'
  | 'newest'
  | 'updated'
  | 'downloads'
  | 'installs'
  | 'stars'
  | 'name'

export type MarketplaceOrder = 'asc' | 'desc'
export type MarketplaceLocale = 'en' | 'zh'

export type TencentMarketplaceCategory =
  | 'ai-intelligence'
  | 'developer-tools'
  | 'productivity'
  | 'data-analysis'
  | 'content-creation'
  | 'security-compliance'
  | 'communication-collaboration'

export type MarketplaceCategory =
  | 'agent'
  | 'memory'
  | 'documents'
  | 'media'
  | 'productivity'
  | 'data'
  | 'security'
  | 'integrations'
  | 'coding'
  | TencentMarketplaceCategory
  | 'other'
  | 'search'
  | 'browser'

export type RegistrySourceId = 'clawhub' | 'recommended' | 'tencent'
export type RegistrySelectableSource = RegistrySourceId

export interface RegistrySourceInfo {
  id: RegistrySelectableSource
  label: string
  description: string
  capabilities: {
    search: boolean
    list: boolean
    detail: boolean
    download: boolean
    update: boolean
    auth: 'none' | 'optional' | 'required'
    cursorPagination: boolean
    defaultSort?: MarketplaceSort
    sortDirection: boolean
    sorts: MarketplaceSort[]
  }
}

export interface MarketplaceQuery {
  query?: string
  limit?: number
  cursor?: string | null
  sort?: MarketplaceSort
  order?: MarketplaceOrder
  locale?: MarketplaceLocale
  category?: TencentMarketplaceCategory
  highlightedOnly?: boolean
  nonSuspiciousOnly?: boolean
  source?: RegistrySelectableSource
}

export interface MarketplaceListItemVO {
  slug: string
  displayName: string
  summary: string
  latestVersion?: string | null
  installed: boolean
  installedSkillName?: string
  installedVersion?: string
  hasUpdate: boolean
  updatedAt?: number | null
  downloads?: number | null
  stars?: number | null
  installs?: number | null
  category?: MarketplaceCategory
  ownerName?: string | null
  url?: string | null
}

export interface MarketplaceDetailVO extends MarketplaceListItemVO {
  author?: {
    name?: string | null
    handle?: string | null
    image?: string | null
  }
  moderation?: {
    isSuspicious: boolean
    isMalwareBlocked: boolean
    verdict: string
    summary?: string | null
  } | null
}

export interface MarketplacePageVO {
  items: MarketplaceListItemVO[]
  nextCursor: string | null
  query: string
  sort: MarketplaceSort
  order: MarketplaceOrder
}

export type MarketplaceSkill = MarketplaceListItemVO
export type MarketplaceSkillDetail = MarketplaceDetailVO
export type MarketplacePage = MarketplacePageVO

export interface RecommendedSkill extends MarketplaceListItemVO {}

const recommendedCategorySet = new Set<RecommendedCategory>(recommendedCategoryOrder)

interface RegistryManagerOptions {
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  userSkillsDir?: string
  clawhubTokenGetter?: () => string | null | undefined
  tencentSearchUrl?: string
  tencentDownloadUrl?: string
  tencentIndexUrl?: string
  tencentEnabled?: boolean
}

interface TencentSourceConfig {
  enabled: boolean
  indexUrl: string
  searchUrl: string
  downloadUrl: string
}

interface NormalizedMarketplaceQuery {
  query: string
  limit: number
  cursor: string | null
  sort: MarketplaceSort
  order: MarketplaceOrder
  locale: MarketplaceLocale
  category?: TencentMarketplaceCategory
  highlightedOnly: boolean
  nonSuspiciousOnly: boolean
}

interface InstalledSkillState {
  slug: string
  installedSkillName?: string
  installSource?: string
  version?: string
}

interface MarketplaceStats {
  downloads: number | null
  stars: number | null
  installsCurrent: number | null
  installsAllTime: number | null
}

interface RegistrySource {
  info: RegistrySourceInfo
  list(query: NormalizedMarketplaceQuery, installed: Map<string, InstalledSkillState>): Promise<MarketplacePage>
  getDetail(slug: string, installed: Map<string, InstalledSkillState>, locale: MarketplaceLocale): Promise<MarketplaceSkillDetail>
  download(slug: string): Promise<ArrayBuffer>
}

interface MarketplaceSourceQueryLayer<TSearchItem, TDetailPayload> {
  search(query: NormalizedMarketplaceQuery): Promise<TSearchItem[]>
  getDetail(slug: string): Promise<TDetailPayload>
  download(slug: string): Promise<ArrayBuffer>
}

interface MarketplaceSourceAdapterLayer<TSearchItem, TDetailPayload> {
  adaptSearchItem(item: TSearchItem, locale: MarketplaceLocale, installedState?: InstalledSkillState): MarketplaceSkill
  adaptDetail(slug: string, payload: TDetailPayload, locale: MarketplaceLocale, installedState?: InstalledSkillState): MarketplaceSkillDetail
}

interface SearchCache<TItem> {
  query: string
  items: TItem[]
  fetchedAt: number
}

interface ClawHubSearchResult {
  score?: number
  slug?: string
  displayName?: string
  summary?: string | null
  version?: string | null
  updatedAt?: number
}

interface ClawHubSearchResponse {
  results?: ClawHubSearchResult[]
}

interface ClawHubListSkill {
  slug?: string
  displayName?: string
  summary?: string | null
  tags?: Record<string, string>
  stats?: unknown
  createdAt?: number
  updatedAt?: number
  latestVersion?: {
    version?: string
    createdAt?: number
  } | null
  metadata?: {
    os?: string[] | null
    systems?: string[] | null
  } | null
}

interface ClawHubConvexListRequestArgs {
  cursor?: string
  dir: MarketplaceOrder
  highlightedOnly: boolean
  nonSuspiciousOnly: boolean
  numItems: number
  sort?: 'newest' | 'updated' | 'downloads' | 'installs' | 'stars' | 'name'
}

interface ClawHubConvexListRequest {
  path: 'skills:listPublicPageV4'
  format: 'convex_encoded_json'
  args: [ClawHubConvexListRequestArgs]
}

interface ClawHubConvexLatestVersion {
  _creationTime?: number
  _id?: string
  changelog?: string
  changelogSource?: string
  createdAt?: number
  parsed?: Record<string, unknown> | null
  version?: string
}

interface ClawHubConvexOwner {
  _creationTime?: number
  _id?: string
  displayName?: string | null
  handle?: string | null
  image?: string | null
  kind?: string | null
  linkedUserId?: string | null
}

interface ClawHubConvexSkill {
  _creationTime?: number
  _id?: string
  badges?: Record<string, unknown>
  createdAt?: number
  displayName?: string
  latestVersionId?: string
  ownerPublisherId?: string
  ownerUserId?: string
  slug?: string
  stats?: unknown
  summary?: string | null
  tags?: Record<string, string>
  updatedAt?: number
}

interface ClawHubConvexListItem {
  latestVersion?: ClawHubConvexLatestVersion | null
  owner?: ClawHubConvexOwner | null
  ownerHandle?: string | null
  skill?: ClawHubConvexSkill | null
}

interface ClawHubConvexListValue {
  hasMore?: boolean
  nextCursor?: string | null
  page?: ClawHubConvexListItem[] | null
}

interface ClawHubConvexListResponse {
  status?: string
  value?: ClawHubConvexListValue | null
}

interface ClawHubSkillDetailResponse {
  skill?: ClawHubListSkill | null
  latestVersion?: {
    version?: string
    createdAt?: number
    changelog?: string
    license?: string | null
  } | null
  metadata?: {
    os?: string[] | null
    systems?: string[] | null
  } | null
  owner?: {
    handle?: string | null
    displayName?: string | null
    image?: string | null
  } | null
  moderation?: {
    isSuspicious?: boolean
    isMalwareBlocked?: boolean
    verdict?: string
    summary?: string | null
  } | null
}

interface TencentSearchResultItem {
  slug: string
  displayName: string
  description?: string | null
  descriptionZh?: string | null
  score?: number
  version?: string | null
  updatedAt?: number | null
  downloads?: number | null
  installs?: number | null
  stars?: number | null
  category?: MarketplaceCategory
  tags?: string[]
  ownerName?: string | null
  homepage?: string | null
}

interface TencentSkillsListItem {
  slug?: string
  name?: string
  description?: string
  description_zh?: string
  version?: string
  homepage?: string
  downloads?: number
  installs?: number
  stars?: number
  score?: number
  category?: string
  tags?: string[] | null
  ownerName?: string
  updated_at?: number
}

interface TencentSkillsListResponse {
  code?: number
  data?: {
    skills?: TencentSkillsListItem[]
    total?: number
  } | null
  message?: string
}

interface TencentSearchPage {
  items: TencentSearchResultItem[]
  total: number
  page: number
}

const CLAWHUB_API_BASE = 'https://clawhub.ai/api/v1'
const CLAWHUB_DOWNLOAD_URL = `${CLAWHUB_API_BASE}/download`
const CLAWHUB_CONVEX_QUERY_URL = 'https://wry-manatee-359.convex.cloud/api/query'
const TENCENT_SEARCH_URL = 'https://lightmake.site/api/skills'
const TENCENT_DOWNLOAD_URL = 'https://lightmake.site/api/v1/download'
const TENCENT_INDEX_URL = 'https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/skills.json'
const DEFAULT_MARKETPLACE_LIMIT = 24
const MAX_MARKETPLACE_LIMIT = 50
const MAX_JSON_BYTES = 1024 * 1024
const RECOMMENDED_CURSOR_PREFIX = 'recommended:'
const SEARCH_CURSOR_PREFIX = 'search:'
const REMOTE_CACHE_TTL = 60_000
const CLAWHUB_SORTS: MarketplaceSort[] = ['newest', 'updated', 'downloads', 'installs', 'stars', 'name']
const TENCENT_SORTS: MarketplaceSort[] = ['score', 'downloads', 'stars', 'installs']

class RegistryHttpClient {
  constructor(
    private readonly fetchImpl: typeof fetch,
    private readonly sleepImpl: (ms: number) => Promise<void>,
  ) {}

  async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchWithRetry(url, init)
    if (!response.ok) {
      throw new Error(await this.buildHttpErrorMessage('Marketplace request failed', response))
    }

    const contentLength = Number(response.headers.get('content-length') || '0')
    if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BYTES) {
      throw new Error(`Remote response exceeds ${MAX_JSON_BYTES} bytes`)
    }

    const text = await response.text()
    if (Buffer.byteLength(text, 'utf-8') > MAX_JSON_BYTES) {
      throw new Error(`Remote response exceeds ${MAX_JSON_BYTES} bytes`)
    }

    try {
      return JSON.parse(text) as T
    } catch {
      throw new Error('Remote response is not valid JSON')
    }
  }

  async fetchBuffer(url: string, init?: RequestInit, prefix = 'Download failed'): Promise<ArrayBuffer> {
    const response = await this.fetchWithRetry(url, init)
    if (!response.ok) {
      throw new Error(await this.buildHttpErrorMessage(prefix, response))
    }

    const contentLength = Number(response.headers.get('content-length') || '0')
    if (Number.isFinite(contentLength) && contentLength > MAX_ARCHIVE_BYTES) {
      throw new Error(`${prefix}: archive exceeds ${MAX_ARCHIVE_BYTES} bytes`)
    }

    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > MAX_ARCHIVE_BYTES) {
      throw new Error(`${prefix}: archive exceeds ${MAX_ARCHIVE_BYTES} bytes`)
    }

    return buffer
  }

  private async fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
    let attempt = 0
    let response = await this.fetchImpl(url, init)

    while (response.status === 429 && attempt < 2) {
      attempt += 1
      const delayMs = this.resolveRetryDelay(response, attempt)
      await this.sleepImpl(delayMs)
      response = await this.fetchImpl(url, init)
    }

    return response
  }

  private resolveRetryDelay(response: Response, attempt: number): number {
    const retryAfter = Number.parseInt(response.headers.get('retry-after') || '', 10)
    if (Number.isFinite(retryAfter) && retryAfter >= 0) {
      return retryAfter * 1000
    }

    const absoluteReset = Number.parseInt(response.headers.get('x-ratelimit-reset') || '', 10)
    if (Number.isFinite(absoluteReset) && absoluteReset > 0) {
      return Math.max(0, absoluteReset * 1000 - Date.now())
    }

    const base = Math.min(8_000, 1000 * 2 ** attempt)
    const jitter = Math.round(Math.random() * 250)
    return base + jitter
  }

  private async buildHttpErrorMessage(prefix: string, response: Response): Promise<string> {
    let detail = `${response.status} ${response.statusText}`.trim()
    try {
      const text = (await response.text()).trim()
      if (text) {
        detail = `${detail}: ${text}`
      }
    } catch {
      // ignore body parse failures
    }
    return `${prefix}: ${detail}`
  }
}

class ClawHubQueryLayer implements MarketplaceSourceQueryLayer<ClawHubSearchResult, ClawHubSkillDetailResponse> {
  constructor(
    private readonly http: RegistryHttpClient,
    private readonly tokenGetter: () => string | null | undefined,
  ) {}

  async search(query: NormalizedMarketplaceQuery): Promise<ClawHubSearchResult[]> {
    const url = new URL(`${CLAWHUB_API_BASE}/search`)
    url.searchParams.set('q', query.query)
    url.searchParams.set('limit', String(MAX_MARKETPLACE_LIMIT))
    if (query.highlightedOnly) {
      url.searchParams.set('highlightedOnly', 'true')
    }
    if (query.nonSuspiciousOnly) {
      url.searchParams.set('nonSuspiciousOnly', 'true')
    }

    const payload = await this.http.fetchJson<ClawHubSearchResponse>(url.toString(), this.authInit())
    return (payload.results ?? []).filter((item): item is Required<Pick<ClawHubSearchResult, 'slug' | 'displayName'>> & ClawHubSearchResult => {
      return typeof item.slug === 'string' && item.slug.length > 0 && typeof item.displayName === 'string'
    })
  }

  async list(query: NormalizedMarketplaceQuery): Promise<ClawHubConvexListResponse> {
    const payload: ClawHubConvexListRequest = {
      path: 'skills:listPublicPageV4',
      format: 'convex_encoded_json',
      args: [{
        cursor: query.cursor ?? undefined,
        dir: query.order,
        highlightedOnly: query.highlightedOnly,
        nonSuspiciousOnly: query.nonSuspiciousOnly,
        numItems: query.limit,
        sort: resolveClawHubSort(query.sort),
      }],
    }

    return this.http.fetchJson<ClawHubConvexListResponse>(CLAWHUB_CONVEX_QUERY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  }

  async getDetail(slug: string): Promise<ClawHubSkillDetailResponse> {
    return this.http.fetchJson<ClawHubSkillDetailResponse>(`${CLAWHUB_API_BASE}/skills/${encodeURIComponent(slug)}`, this.authInit())
  }

  async download(slug: string): Promise<ArrayBuffer> {
    return this.http.fetchBuffer(`${CLAWHUB_DOWNLOAD_URL}?slug=${encodeURIComponent(slug)}`, this.authInit())
  }

  private authInit(): RequestInit | undefined {
    const token = this.tokenGetter()?.trim()
    if (!token) {
      return undefined
    }
    return {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    }
  }
}

class ClawHubAdapterLayer implements MarketplaceSourceAdapterLayer<ClawHubSearchResult, ClawHubSkillDetailResponse> {
  adaptListItem(item: ClawHubConvexListItem, installedState?: InstalledSkillState): MarketplaceSkill {
    const skill = item.skill ?? {}
    const stats = normalizeStats(skill.stats)
    const ownerHandle = item.owner?.handle ?? item.ownerHandle ?? null
    const ownerName = item.owner?.displayName ?? ownerHandle

    return buildNormalizedMarketplaceSkill({
      slug: skill.slug ?? '',
      displayName: skill.displayName ?? skill.slug ?? '',
      summary: skill.summary ?? '',
      installedState,
      latestVersion: item.latestVersion?.version ?? resolveLatestVersion(skill.tags),
      updatedAt: skill.updatedAt ?? null,
      downloads: stats.downloads,
      stars: stats.stars,
      installs: stats.installsCurrent,
      ownerName,
      url: resolveClawHubDetailUrl(ownerHandle, skill.slug),
    })
  }

  adaptSearchItem(item: ClawHubSearchResult, _locale: MarketplaceLocale, installedState?: InstalledSkillState): MarketplaceSkill {
    const slug = item.slug ?? ''
    return buildNormalizedMarketplaceSkill({
      slug,
      displayName: item.displayName ?? slug,
      summary: item.summary ?? '',
      installedState,
      latestVersion: item.version ?? null,
      updatedAt: item.updatedAt ?? null,
      ownerName: null,
      url: null,
    })
  }

  adaptDetail(slug: string, payload: ClawHubSkillDetailResponse, _locale: MarketplaceLocale, installedState?: InstalledSkillState): MarketplaceSkillDetail {
    if (!payload.skill?.slug || !payload.skill.displayName) {
      throw new Error(`Skill "${slug}" was not found`)
    }

    const stats = normalizeStats(payload.skill.stats)
    const ownerHandle = payload.owner?.handle ?? null
    const ownerName = payload.owner?.displayName ?? ownerHandle ?? null

    return buildNormalizedMarketplaceDetail({
      slug: payload.skill.slug,
      displayName: payload.skill.displayName,
      summary: payload.skill.summary ?? '',
      installedState,
      latestVersion: payload.latestVersion?.version ?? resolveLatestVersion(payload.skill.tags),
      updatedAt: payload.skill.updatedAt ?? null,
      downloads: stats.downloads,
      stars: stats.stars,
      installs: stats.installsCurrent,
      ownerName,
      url: resolveClawHubDetailUrl(ownerHandle, payload.skill.slug),
      author: payload.owner
        ? {
            name: payload.owner.displayName ?? null,
            handle: ownerHandle,
            image: payload.owner.image ?? null,
          }
        : undefined,
      moderation: payload.moderation
        ? {
            isSuspicious: Boolean(payload.moderation.isSuspicious),
            isMalwareBlocked: Boolean(payload.moderation.isMalwareBlocked),
            verdict: payload.moderation.verdict ?? 'clean',
            summary: payload.moderation.summary ?? null,
          }
        : null,
    })
  }
}

class ClawHubSource implements RegistrySource {
  readonly info: RegistrySourceInfo = {
    id: 'clawhub',
    label: 'ClawHub',
    description: 'Official public ClawHub registry.',
    capabilities: {
      search: true,
      list: true,
      detail: true,
      download: true,
      update: true,
      auth: 'optional',
      cursorPagination: true,
      defaultSort: 'downloads',
      sortDirection: true,
      sorts: CLAWHUB_SORTS,
    },
  }

  private searchCache: SearchCache<ClawHubSearchResult> | null = null
  private readonly queryLayer: ClawHubQueryLayer
  private readonly adapterLayer = new ClawHubAdapterLayer()

  constructor(
    http: RegistryHttpClient,
    tokenGetter: () => string | null | undefined,
  ) {
    this.queryLayer = new ClawHubQueryLayer(http, tokenGetter)
  }

  async list(query: NormalizedMarketplaceQuery, installed: Map<string, InstalledSkillState>): Promise<MarketplacePage> {
    if (!query.query) {
      const items: MarketplaceSkill[] = []
      const initialCursorState = parseClawHubListCursor(query.cursor)
      let cursor = initialCursorState.cursor
      let offset = initialCursorState.offset
      let nextCursor: string | null = null
      const seenCursors = new Set<string>()
      seenCursors.add(createCursorLoopKey(cursor))

      while (items.length < query.limit) {
        const payload = await this.queryLayer.list({ ...query, cursor })
        const value = payload.value
        if (payload.status !== 'success') {
          throw new Error(`Marketplace request failed: Convex list returned status ${payload.status ?? 'unknown'}`)
        }
        if (!value || !Array.isArray(value.page)) {
          throw new Error('Marketplace request failed: Convex list response is missing page data')
        }

        const pageItems = value.page
          .filter((item): item is ClawHubConvexListItem & { skill: ClawHubConvexSkill & { slug: string; displayName: string } } => {
            return typeof item.skill?.slug === 'string' && item.skill.slug.length > 0 && typeof item.skill.displayName === 'string'
          })
        const pageSlice = takeMarketplacePageSlice(
          pageItems,
          offset,
          query.limit - items.length,
          (item) => !installed.has(item.skill.slug),
          (item) => this.adapterLayer.adaptListItem(item, installed.get(item.skill.slug)),
        )

        items.push(...pageSlice.items)

        const candidateNextCursor = value.hasMore ? (value.nextCursor ?? null) : null
        if (pageSlice.nextOffset !== null) {
          nextCursor = formatClawHubListCursor(cursor, pageSlice.nextOffset)
          break
        }
        if (items.length >= query.limit) {
          nextCursor = candidateNextCursor ? formatClawHubListCursor(candidateNextCursor, 0) : null
          break
        }
        if (!candidateNextCursor || seenCursors.has(createCursorLoopKey(candidateNextCursor))) {
          nextCursor = null
          break
        }

        seenCursors.add(createCursorLoopKey(candidateNextCursor))
        cursor = candidateNextCursor
        offset = 0
      }

      return {
        items,
        nextCursor,
        query: query.query,
        sort: query.sort,
        order: query.order,
      }
    }

    const offset = parseOffsetCursor(query.cursor, SEARCH_CURSOR_PREFIX)

    if (!this.searchCache || this.searchCache.query !== query.query || Date.now() - this.searchCache.fetchedAt > REMOTE_CACHE_TTL) {
      this.searchCache = {
        query: query.query,
        items: await this.queryLayer.search(query),
        fetchedAt: Date.now(),
      }
    }

    const filteredItems = this.searchCache.items
      .filter((item) => typeof item.slug === 'string' && item.slug.length > 0 && !installed.has(item.slug))
    const items = filteredItems
      .slice(offset, offset + query.limit)
      .map((item) => this.adapterLayer.adaptSearchItem(item, query.locale))
    const nextOffset = offset + query.limit

    return {
      items,
      nextCursor: nextOffset < filteredItems.length ? `${SEARCH_CURSOR_PREFIX}${nextOffset}` : null,
      query: query.query,
      sort: query.sort,
      order: query.order,
    }
  }

  async getDetail(slug: string, installed: Map<string, InstalledSkillState>, locale: MarketplaceLocale): Promise<MarketplaceSkillDetail> {
    const payload = await this.queryLayer.getDetail(slug)
    return this.adapterLayer.adaptDetail(slug, payload, locale, installed.get(slug))
  }

  async download(slug: string): Promise<ArrayBuffer> {
    return this.queryLayer.download(slug)
  }
}

class RecommendedSource implements RegistrySource {
  readonly info: RegistrySourceInfo = {
    id: 'recommended',
    label: 'Recommended',
    description: 'Curated recommended skills.',
    capabilities: {
      search: true,
      list: true,
      detail: true,
      download: false,
      update: false,
      auth: 'none',
      cursorPagination: true,
      defaultSort: 'score',
      sortDirection: true,
      sorts: TENCENT_SORTS,
    },
  }

  constructor(
    private readonly getEntries: () => RecommendedEntry[],
  ) {}

  async list(query: NormalizedMarketplaceQuery, installed: Map<string, InstalledSkillState>): Promise<MarketplacePage> {
    const filtered = sortRecommendedEntries(
      filterRecommendedEntries(this.getEntries(), query.query, query.locale, query.category)
        .filter((entry) => !installed.has(entry.slug)),
      query.sort,
      query.order,
    )
    const offset = parseOffsetCursor(query.cursor, RECOMMENDED_CURSOR_PREFIX)
    const items = filtered
      .slice(offset, offset + query.limit)
      .map((entry) => buildRecommendedMarketplaceSkill(entry, query.locale, installed.get(entry.slug)))
    const nextOffset = offset + query.limit

    return {
      items,
      nextCursor: nextOffset < filtered.length ? `${RECOMMENDED_CURSOR_PREFIX}${nextOffset}` : null,
      query: query.query,
      sort: query.sort,
      order: query.order,
    }
  }

  async getDetail(slug: string, installed: Map<string, InstalledSkillState>, locale: MarketplaceLocale): Promise<MarketplaceSkillDetail> {
    const entry = this.getEntries().find((item) => item.slug === slug)
    if (!entry) {
      throw new Error(`Skill "${slug}" was not found`)
    }
    return buildRecommendedMarketplaceSkill(entry, locale, installed.get(slug))
  }

  async download(): Promise<ArrayBuffer> {
    throw new Error('Recommended skills must be installed from a marketplace source')
  }
}

class TencentQueryLayer implements MarketplaceSourceQueryLayer<TencentSearchResultItem, TencentSearchResultItem> {
  private readonly itemCache = new Map<string, TencentSearchResultItem>()

  constructor(
    private readonly http: RegistryHttpClient,
    private readonly getConfig: () => TencentSourceConfig,
  ) {}

  async search(query: NormalizedMarketplaceQuery): Promise<TencentSearchResultItem[]> {
    const page = await this.searchPage(query)
    return page.items
  }

  async searchPage(query: NormalizedMarketplaceQuery): Promise<TencentSearchPage> {
    const { searchUrl } = this.getConfig()
    const url = new URL(searchUrl)
    const page = parseTencentListCursor(query.cursor).page
    const { sortBy, order } = resolveTencentSortParams(query.sort, query.order)
    url.searchParams.set('page', String(page))
    url.searchParams.set('pageSize', String(query.limit))
    url.searchParams.set('sortBy', sortBy)
    url.searchParams.set('order', order)
    if (query.query) {
      url.searchParams.set('keyword', query.query)
    }
    if (query.category) {
      url.searchParams.set('category', query.category)
    }
    const payload = await this.http.fetchJson<TencentSkillsListResponse>(url.toString(), {
      headers: { Accept: 'application/json' },
    })

    if (payload.code !== undefined && payload.code !== 0) {
      throw new Error(payload.message || 'Tencent marketplace request failed')
    }

    const items = (payload.data?.skills ?? [])
      .filter((item): item is TencentSkillsListItem & { slug: string; name: string } => (
        typeof item.slug === 'string' && item.slug.length > 0 && typeof item.name === 'string'
      ))
      .map((item) => ({
        slug: item.slug,
        displayName: item.name,
        description: item.description ?? null,
        descriptionZh: item.description_zh ?? null,
        score: item.score,
        version: item.version ?? null,
        updatedAt: item.updated_at ?? null,
        downloads: item.downloads ?? null,
        installs: item.installs ?? null,
        stars: item.stars ?? null,
        category: normalizeTencentMarketplaceCategory(item.category),
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
        ownerName: item.ownerName ?? null,
        homepage: item.homepage ?? null,
      }))
    this.rememberItems(items)

    const total = typeof payload.data?.total === 'number' ? payload.data.total : items.length

    return {
      items,
      total,
      page,
    }
  }

  async getDetail(slug: string): Promise<TencentSearchResultItem> {
    const cached = this.itemCache.get(slug)
    if (cached) {
      return cached
    }

    const matched = await this.searchExactSlug(slug)
    if (matched) {
      return matched
    }

    throw new Error(`Skill "${slug}" was not found`)
  }

  async download(slug: string): Promise<ArrayBuffer> {
    const { downloadUrl } = this.getConfig()
    return this.http.fetchBuffer(`${downloadUrl}?slug=${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/zip,application/octet-stream,*/*' },
    }, 'Tencent archive download failed')
  }

  private async searchExactSlug(slug: string): Promise<TencentSearchResultItem | null> {
    return findExactTencentSlug({
      slug,
      pageSize: MAX_MARKETPLACE_LIMIT,
      fetchPage: (cursor) => this.searchPage({
        query: slug,
        limit: MAX_MARKETPLACE_LIMIT,
        cursor,
        sort: 'score',
        order: 'desc',
        locale: 'zh',
        category: undefined,
        highlightedOnly: false,
        nonSuspiciousOnly: true,
      }),
    })
  }

  private rememberItems(items: TencentSearchResultItem[]): void {
    for (const item of items) {
      this.itemCache.set(item.slug, item)
    }
  }
}

class TencentAdapterLayer implements MarketplaceSourceAdapterLayer<TencentSearchResultItem, TencentSearchResultItem> {
  adaptSearchItem(item: TencentSearchResultItem, locale: MarketplaceLocale, installedState?: InstalledSkillState): MarketplaceSkill {
    return buildNormalizedMarketplaceSkill({
      slug: item.slug,
      displayName: item.displayName,
      summary: resolveTencentMarketplaceSummary(locale, item.descriptionZh, item.description),
      installedState,
      latestVersion: item.version ?? null,
      updatedAt: item.updatedAt ?? null,
      downloads: item.downloads ?? null,
      stars: item.stars ?? null,
      installs: item.installs ?? null,
      category: item.category,
      ownerName: item.ownerName ?? null,
      url: item.homepage ?? null,
    })
  }

  adaptDetail(slug: string, payload: TencentSearchResultItem, locale: MarketplaceLocale, installedState?: InstalledSkillState): MarketplaceSkillDetail {
    const normalizedSlug = payload.slug || slug

    return buildNormalizedMarketplaceDetail({
      slug: normalizedSlug,
      displayName: payload.displayName || normalizedSlug,
      summary: resolveTencentMarketplaceSummary(locale, payload.descriptionZh, payload.description),
      installedState,
      latestVersion: payload.version ?? null,
      updatedAt: payload.updatedAt ?? null,
      downloads: payload.downloads ?? null,
      stars: payload.stars ?? null,
      installs: payload.installs ?? null,
      category: payload.category,
      ownerName: payload.ownerName ?? null,
      url: payload.homepage ?? null,
      author: payload.ownerName
        ? {
            name: payload.ownerName,
            handle: null,
            image: null,
          }
        : undefined,
      moderation: null,
    })
  }
}

class TencentSource implements RegistrySource {
  readonly info: RegistrySourceInfo = {
    id: 'tencent',
    label: 'Tencent',
    description: 'Tencent SkillHub marketplace source.',
    capabilities: {
      search: true,
      list: true,
      detail: true,
      download: true,
      update: true,
      auth: 'none',
      cursorPagination: true,
      defaultSort: 'score',
      sortDirection: true,
      sorts: TENCENT_SORTS,
    },
  }

  private readonly queryLayer: TencentQueryLayer
  private readonly adapterLayer = new TencentAdapterLayer()

  constructor(
    http: RegistryHttpClient,
    getConfig: () => TencentSourceConfig,
  ) {
    this.queryLayer = new TencentQueryLayer(http, getConfig)
  }

  async list(query: NormalizedMarketplaceQuery, installed: Map<string, InstalledSkillState>): Promise<MarketplacePage> {
    const items: MarketplaceSkill[] = []
    const initialCursorState = parseTencentListCursor(query.cursor)
    let cursor = formatTencentListCursor(initialCursorState.page, 0)
    let offset = initialCursorState.offset
    let nextCursor: string | null = null
    const seenPages = new Set<number>([initialCursorState.page])

    while (items.length < query.limit) {
      const page = await this.queryLayer.searchPage({ ...query, cursor })
      const pageSlice = takeMarketplacePageSlice(
        page.items,
        offset,
        query.limit - items.length,
        (item) => !installed.has(item.slug),
        (item) => this.adapterLayer.adaptSearchItem(item, query.locale, installed.get(item.slug)),
      )

      items.push(...pageSlice.items)

      const candidateNextCursor = page.page * query.limit < page.total
        ? formatTencentListCursor(page.page + 1, 0)
        : null
      if (pageSlice.nextOffset !== null) {
        nextCursor = formatTencentListCursor(page.page, pageSlice.nextOffset)
        break
      }
      if (items.length >= query.limit) {
        nextCursor = candidateNextCursor
        break
      }
      if (!candidateNextCursor || seenPages.has(page.page + 1)) {
        nextCursor = null
          break
        }

      seenPages.add(page.page + 1)
      cursor = candidateNextCursor
      offset = 0
    }

    return {
      items,
      nextCursor,
      query: query.query,
      sort: query.sort,
      order: query.order,
    }
  }

  async getDetail(slug: string, installed: Map<string, InstalledSkillState>, locale: MarketplaceLocale): Promise<MarketplaceSkillDetail> {
    const payload = await this.queryLayer.getDetail(slug)
    return this.adapterLayer.adaptDetail(slug, payload, locale, installed.get(slug))
  }

  async download(slug: string): Promise<ArrayBuffer> {
    return this.queryLayer.download(slug)
  }
}

export class RegistryManager {
  private recommended: RecommendedEntry[] = []
  private readonly http: RegistryHttpClient
  private readonly sources: Map<RegistrySelectableSource, RegistrySource>

  constructor(
    private readonly skillsLoader: SkillsLoader,
    private readonly options: RegistryManagerOptions = {},
  ) {
    this.loadRecommendedList()
    this.http = new RegistryHttpClient(this.fetchImpl(), this.sleep.bind(this))
    this.sources = new Map<RegistrySelectableSource, RegistrySource>([
      ['recommended', new RecommendedSource(() => this.recommended)],
      ['clawhub', new ClawHubSource(this.http, () => this.resolveClawhubToken())],
      ['tencent', new TencentSource(this.http, () => this.resolveTencentConfig())],
    ])
  }

  listSources(): RegistrySourceInfo[] {
    return Array.from(this.sources.values())
      .map((source) => source.info)
      .sort(compareRegistrySourceInfo)
  }

  getRecommended(): RecommendedSkill[] {
    const installed = this.collectInstalledSkillStates()
    return this.recommended
      .filter((entry) => !installed.has(entry.slug))
      .map((entry) => buildRecommendedMarketplaceSkill(entry, 'en'))
  }

  async searchSkills(query: string, sourceId: RegistrySelectableSource = 'clawhub', locale: MarketplaceLocale = 'zh'): Promise<RecommendedSkill[]> {
    const page = await this.listMarketplaceForSource(sourceId, { query, limit: MAX_MARKETPLACE_LIMIT, locale })
    return page.items
  }

  async listMarketplace(query: MarketplaceQuery = {}): Promise<MarketplacePage> {
    const sourceId = query.source ?? 'clawhub'
    return this.listMarketplaceForSource(sourceId, query)
  }

  async listMarketplaceForSource(sourceId: RegistrySelectableSource, query: MarketplaceQuery = {}): Promise<MarketplacePage> {
    const installed = this.collectInstalledSkillStates()
    const source = this.requireSource(sourceId)
    const normalized = this.normalizeMarketplaceQuery(query, source)

    try {
      return await source.list(normalized, installed)
    } catch (error) {
      const logger = getLogger()
      const message = error instanceof Error ? error.message : String(error)
      logger.warn({ source: sourceId, query: normalized.query, error: message }, 'Failed to load remote marketplace source')
      throw error
    }
  }

  async getMarketplaceSkill(slug: string, sourceId: RegistrySelectableSource = 'clawhub', locale: MarketplaceLocale = 'zh'): Promise<MarketplaceSkillDetail> {
    return this.getMarketplaceSkillForSource(sourceId, slug, locale)
  }

  async getMarketplaceSkillForSource(sourceId: RegistrySelectableSource, slug: string, locale: MarketplaceLocale = 'zh'): Promise<MarketplaceSkillDetail> {
    const normalizedSlug = slug.trim().toLowerCase()
    if (!normalizedSlug) {
      throw new Error('Missing slug')
    }

    return this.requireSource(sourceId).getDetail(normalizedSlug, this.collectInstalledSkillStates(), locale)
  }

  async installSkill(slug: string, sourceId: RegistrySelectableSource = 'clawhub'): Promise<void> {
    return this.installSkillFromSource(sourceId, slug)
  }

  async installSkillFromSource(sourceId: RegistrySelectableSource, slug: string): Promise<void> {
    if (sourceId === 'recommended') {
      throw new Error('Recommended skills must be installed from a marketplace source')
    }
    const detail = await this.getMarketplaceSkillForSource(sourceId, slug)
    await this.installOrUpdateSkill(sourceId, detail, 'install')
  }

  async updateSkill(slug: string, sourceId: RegistrySelectableSource = 'clawhub'): Promise<void> {
    return this.updateSkillFromSource(sourceId, slug)
  }

  async updateSkillFromSource(sourceId: RegistrySelectableSource, slug: string): Promise<void> {
    const normalizedSlug = slug.trim().toLowerCase()
    if (!normalizedSlug) {
      throw new Error('Missing slug')
    }
    if (sourceId === 'recommended') {
      throw new Error('Recommended skills must be installed from a marketplace source')
    }

    const sourceLabel = this.requireSource(sourceId).info.label
    const installed = this.readInstalledRegistryMeta(normalizedSlug)
    if (!installed) {
      throw new Error(`Skill "${normalizedSlug}" is not installed`)
    }
    if (installed.source !== sourceId) {
      throw new Error(`Skill "${normalizedSlug}" was not installed from ${sourceLabel}`)
    }

    const detail = await this.getMarketplaceSkillForSource(sourceId, installed.slug)
    if (!detail.latestVersion) {
      throw new Error(`Unable to determine the latest version for "${installed.slug}"`)
    }
    if (installed.version && installed.version === detail.latestVersion) {
      throw new Error(`Skill "${installed.slug}" is already up to date`)
    }

    await this.installOrUpdateSkill(sourceId, detail, 'update')
  }

  async uninstallSkill(slug: string, sourceId: RegistrySelectableSource = 'clawhub'): Promise<void> {
    return this.uninstallSkillFromSource(sourceId, slug)
  }

  async uninstallSkillFromSource(sourceId: RegistrySelectableSource, slug: string): Promise<void> {
    const normalizedSlug = slug.trim().toLowerCase()
    if (!normalizedSlug) {
      throw new Error('Missing slug')
    }
    if (sourceId === 'recommended') {
      throw new Error('Recommended skills must be installed from a marketplace source')
    }

    const sourceLabel = this.requireSource(sourceId).info.label
    const userSkillsDir = this.resolveUserSkillsDir()
    const targetDir = resolve(userSkillsDir, normalizedSlug)

    if (!existsSync(targetDir)) {
      throw new Error(`Skill "${normalizedSlug}" is not installed`)
    }

    const meta = this.readRegistryMeta(targetDir)
    if (!meta || meta.source !== sourceId || meta.slug !== normalizedSlug) {
      throw new Error(`Skill "${normalizedSlug}" was not installed from ${sourceLabel}`)
    }

    rmSync(targetDir, { recursive: true, force: true })
    this.skillsLoader.refresh()
  }

  private async installOrUpdateSkill(
    sourceId: Exclude<RegistrySelectableSource, 'recommended'>,
    detail: MarketplaceSkillDetail,
    mode: 'install' | 'update',
  ): Promise<void> {
    const userSkillsDir = this.resolveUserSkillsDir()
    const targetDir = resolve(userSkillsDir, detail.slug)
    const tempDir = resolve(userSkillsDir, `.tmp-${mode}-${detail.slug}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
    const backupDir = resolve(userSkillsDir, `.bak-${detail.slug}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
    const shouldReplace = mode === 'update'

    if (mode === 'install' && existsSync(targetDir)) {
      throw new Error(`Skill "${detail.slug}" is already installed`)
    }
    if (mode === 'update' && !existsSync(targetDir)) {
      throw new Error(`Skill "${detail.slug}" is not installed`)
    }

    mkdirSync(userSkillsDir, { recursive: true })

    const archive = await this.requireSource(sourceId).download(detail.slug)
    mkdirSync(tempDir, { recursive: true })
    let movedOldTarget = false

    try {
      const entries = unpackZipArchive(new Uint8Array(archive))
      const skillEntry = entries.find((entry) => entry.relativePath === 'SKILL.md')
      if (!skillEntry) {
        throw new Error('Archive does not contain a root SKILL.md')
      }

      writeArchiveEntries(tempDir, entries)
      parseFrontmatter(readFileSync(resolve(tempDir, 'SKILL.md'), 'utf-8'))

      const meta: SkillRegistryMeta = {
        source: sourceId,
        slug: detail.slug,
        installedAt: new Date().toISOString(),
        displayName: detail.displayName,
        version: detail.latestVersion ?? undefined,
        homepageUrl: detail.url ?? undefined,
      }
      writeFileSync(resolve(tempDir, '.registry.json'), JSON.stringify(meta, null, 2), 'utf-8')

      if (shouldReplace) {
        const currentMeta = this.readRegistryMeta(targetDir)
        if (!currentMeta || currentMeta.source !== sourceId || currentMeta.slug !== detail.slug) {
          throw new Error(`Skill "${detail.slug}" was not installed from ${this.requireSource(sourceId).info.label}`)
        }
        renameSync(targetDir, backupDir)
        movedOldTarget = true
      }

      renameSync(tempDir, targetDir)
      if (movedOldTarget) {
        rmSync(backupDir, { recursive: true, force: true })
      }

      this.skillsLoader.refresh()
    } catch (error) {
      rmSync(tempDir, { recursive: true, force: true })
      if (movedOldTarget) {
        if (!existsSync(targetDir) && existsSync(backupDir)) {
          renameSync(backupDir, targetDir)
        } else {
          rmSync(backupDir, { recursive: true, force: true })
        }
      }
      throw error
    }
  }

  private normalizeMarketplaceQuery(query: MarketplaceQuery, source: RegistrySource): NormalizedMarketplaceQuery {
    const supportedSorts = source.info.capabilities.sorts
    const fallbackSort = source.info.capabilities.defaultSort ?? supportedSorts[0] ?? 'downloads'
    const sort = query.sort && supportedSorts.includes(query.sort) ? query.sort : fallbackSort
    const limit = Math.min(MAX_MARKETPLACE_LIMIT, Math.max(1, Math.trunc(query.limit ?? DEFAULT_MARKETPLACE_LIMIT)))
    const order = normalizeMarketplaceOrder(query.order, sort)

    return {
      query: (query.query ?? '').trim(),
      limit,
      cursor: query.cursor ?? null,
      sort,
      order,
      locale: normalizeMarketplaceLocale(query.locale),
      category: query.category,
      highlightedOnly: Boolean(query.highlightedOnly),
      nonSuspiciousOnly: query.nonSuspiciousOnly ?? true,
    }
  }

  private collectInstalledSkillStates(): Map<string, InstalledSkillState> {
    const installed = new Map<string, InstalledSkillState>()
    const userSkillsDir = this.resolveUserSkillsDir()
    if (!existsSync(userSkillsDir)) {
      return installed
    }

    for (const entry of readdirSync(userSkillsDir)) {
      const skillDir = resolve(userSkillsDir, entry)
      try {
        if (!statSync(skillDir).isDirectory()) continue
      } catch {
        continue
      }

      const meta = this.readRegistryMeta(skillDir)
      if (!meta || !existsSync(resolve(skillDir, 'SKILL.md'))) {
        continue
      }

      installed.set(meta.slug, {
        slug: meta.slug,
        installedSkillName: this.readInstalledSkillName(skillDir),
        installSource: meta.source,
        version: meta.version,
      })
    }

    return installed
  }

  private readInstalledRegistryMeta(slug: string): SkillRegistryMeta | null {
    const skillDir = resolve(this.resolveUserSkillsDir(), slug)
    if (!existsSync(resolve(skillDir, 'SKILL.md'))) {
      return null
    }
    const meta = this.readRegistryMeta(skillDir)
    if (!meta || meta.slug !== slug) {
      return null
    }
    return meta
  }

  private readRegistryMeta(skillDir: string): SkillRegistryMeta | null {
    const filePath = resolve(skillDir, '.registry.json')
    if (!existsSync(filePath)) {
      return null
    }

    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<SkillRegistryMeta>
      if (typeof parsed.source === 'string' && typeof parsed.slug === 'string' && typeof parsed.installedAt === 'string') {
        return parsed as SkillRegistryMeta
      }
    } catch {
      // ignore invalid registry metadata
    }

    return null
  }

  private readInstalledSkillName(skillDir: string): string | undefined {
    const skillPath = resolve(skillDir, 'SKILL.md')
    if (!existsSync(skillPath)) {
      return undefined
    }

    try {
      const content = readFileSync(skillPath, 'utf-8')
      return parseFrontmatter(content).frontmatter.name
    } catch {
      return undefined
    }
  }

  private requireSource(sourceId: RegistrySelectableSource): RegistrySource {
    const source = this.sources.get(sourceId)
    if (!source) {
      throw new Error(`Unknown registry source: ${sourceId}`)
    }
    return source
  }

  private resolveClawhubToken(): string {
    return this.options.clawhubTokenGetter?.() ?? this.readRegistrySourceSettings()?.clawhub.token ?? ''
  }

  private resolveTencentConfig(): TencentSourceConfig {
    const settings = this.readRegistrySourceSettings()?.tencent
    return {
      enabled: this.options.tencentEnabled ?? settings?.enabled ?? true,
      indexUrl: this.options.tencentIndexUrl ?? settings?.indexUrl ?? TENCENT_INDEX_URL,
      searchUrl: this.options.tencentSearchUrl ?? settings?.searchUrl ?? TENCENT_SEARCH_URL,
      downloadUrl: this.options.tencentDownloadUrl ?? settings?.downloadUrl ?? TENCENT_DOWNLOAD_URL,
    }
  }

  private resolveUserSkillsDir(): string {
    return this.options.userSkillsDir ?? getPaths().userSkills
  }

  private loadRecommendedList(): void {
    this.recommended = recommendedSkillsData.flatMap((entry) => {
      if (!recommendedCategorySet.has(entry.category)) {
        getLogger().warn({ slug: entry.slug, category: entry.category }, 'Skipping recommended skill with unsupported category')
        return []
      }
      return [{
        slug: entry.slug,
        displayName: entry.displayName,
        summary: entry.summary,
        category: entry.category,
        tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
      }]
    })
    getLogger().debug({ count: this.recommended.length }, 'Recommendation list loaded')
  }

  private fetchImpl(): typeof fetch {
    return this.options.fetchImpl ?? fetch
  }

  private async sleep(ms: number): Promise<void> {
    if (this.options.sleep) {
      await this.options.sleep(ms)
      return
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
  }

  private readRegistrySourceSettings() {
    try {
      return getSettings().registrySources
    } catch {
      return null
    }
  }
}

interface NormalizedMarketplaceSkillInput {
  slug: string
  displayName: string
  summary: string
  installedState?: InstalledSkillState
  latestVersion?: string | null
  updatedAt?: number | null
  downloads?: number | null
  stars?: number | null
  installs?: number | null
  category?: MarketplaceCategory | null
  ownerName?: string | null
  url?: string | null
}

interface NormalizedMarketplaceDetailInput extends NormalizedMarketplaceSkillInput {
  author?: {
    name?: string | null
    handle?: string | null
    image?: string | null
  }
  moderation?: {
    isSuspicious: boolean
    isMalwareBlocked: boolean
    verdict: string
    summary?: string | null
  } | null
}

function buildNormalizedMarketplaceSkill(input: NormalizedMarketplaceSkillInput): MarketplaceSkill {
  const latestVersion = input.latestVersion ?? null
  const installedVersion = input.installedState?.version

  return {
    slug: input.slug,
    displayName: input.displayName,
    summary: input.summary,
    latestVersion,
    installed: Boolean(input.installedState),
    installedSkillName: input.installedState?.installedSkillName,
    installedVersion,
    hasUpdate: Boolean(installedVersion && latestVersion && installedVersion !== latestVersion),
    updatedAt: input.updatedAt ?? null,
    downloads: input.downloads ?? null,
    stars: input.stars ?? null,
    installs: input.installs ?? null,
    category: input.category ?? undefined,
    ownerName: input.ownerName ?? null,
    url: input.url ?? null,
  }
}

function buildNormalizedMarketplaceDetail(input: NormalizedMarketplaceDetailInput): MarketplaceSkillDetail {
  return {
    ...buildNormalizedMarketplaceSkill(input),
    author: input.author,
    moderation: input.moderation ?? null,
  }
}

function filterRecommendedEntries(
  entries: RecommendedEntry[],
  query: string,
  locale: MarketplaceLocale,
  category?: TencentMarketplaceCategory,
): RecommendedEntry[] {
  const needle = query.trim().toLowerCase()
  return entries.filter((entry) => {
    if (category && entry.category !== category) {
      return false
    }
    if (!needle) return true
    return buildRecommendedSearchTexts(entry, locale).some((text) => text.toLowerCase().includes(needle))
  })
}

function buildRecommendedMarketplaceSkill(
  entry: RecommendedEntry,
  locale: MarketplaceLocale,
  installedState?: InstalledSkillState,
): MarketplaceSkillDetail {
  const sourceEntry = resolveRecommendedSourceEntry(entry)

  return buildNormalizedMarketplaceDetail({
    slug: entry.slug,
    displayName: entry.displayName,
    summary: resolveRecommendedMarketplaceSummary(entry, locale),
    installedState,
    latestVersion: sourceEntry?.version ?? null,
    updatedAt: sourceEntry?.updated_at ?? null,
    downloads: sourceEntry?.downloads ?? null,
    stars: sourceEntry?.stars ?? null,
    installs: sourceEntry?.installs ?? null,
    category: entry.category,
    ownerName: sourceEntry?.ownerName ?? null,
    url: sourceEntry?.homepage ?? null,
    author: sourceEntry?.ownerName
      ? {
          name: sourceEntry.ownerName,
          handle: null,
          image: null,
        }
      : undefined,
    moderation: null,
  })
}

function resolveRecommendedMarketplaceSummary(entry: RecommendedEntry, locale: MarketplaceLocale): string {
  const sourceEntry = resolveRecommendedSourceEntry(entry)
  const curatedSummary = entry.summary.trim()
  const zhSummary = normalizeTencentMarketplaceSummary(sourceEntry?.description_zh ?? '')
  const sourceSummary = normalizeTencentMarketplaceSummary(sourceEntry?.description ?? '')

  if (locale === 'zh') {
    return zhSummary || curatedSummary || sourceSummary
  }

  return curatedSummary || sourceSummary || zhSummary
}

function resolveRecommendedSourceEntry(entry: RecommendedEntry): RecommendationSourceEntry | undefined {
  return recommendationSourceIndex.get(entry.slug)
}

function buildRecommendedSearchTexts(entry: RecommendedEntry, locale: MarketplaceLocale): string[] {
  const sourceEntry = resolveRecommendedSourceEntry(entry)
  const texts = [
    entry.slug,
    entry.displayName,
    entry.summary,
    resolveRecommendedMarketplaceSummary(entry, locale),
    sourceEntry?.description ?? '',
    ...entry.tags,
  ]

  if (locale === 'zh') {
    texts.push(sourceEntry?.description_zh ?? '')
  }

  return Array.from(new Set(texts.map((text) => text.trim()).filter((text) => text.length > 0)))
}

function sortRecommendedEntries(
  entries: RecommendedEntry[],
  sort: MarketplaceSort,
  order: MarketplaceOrder,
): RecommendedEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const comparison = compareRecommendedEntries(a.entry, b.entry, sort, order)
      if (comparison !== 0) {
        return comparison
      }
      return a.index - b.index
    })
    .map(({ entry }) => entry)
}

function compareRecommendedEntries(
  a: RecommendedEntry,
  b: RecommendedEntry,
  sort: MarketplaceSort,
  order: MarketplaceOrder,
): number {
  const direction = order === 'asc' ? 1 : -1
  const aSource = resolveRecommendedSourceEntry(a)
  const bSource = resolveRecommendedSourceEntry(b)

  switch (sort) {
    case 'score':
      return compareNullableNumber(aSource?.score, bSource?.score, direction)
    case 'downloads':
      return compareNullableNumber(aSource?.downloads, bSource?.downloads, direction)
    case 'stars':
      return compareNullableNumber(aSource?.stars, bSource?.stars, direction)
    case 'installs':
      return compareNullableNumber(aSource?.installs, bSource?.installs, direction)
    case 'name':
      return a.displayName.localeCompare(b.displayName) * direction
    case 'newest':
    case 'updated':
      return compareNullableNumber(aSource?.updated_at, bSource?.updated_at, direction)
    default:
      return 0
  }
}

function compareNullableNumber(
  a: number | null | undefined,
  b: number | null | undefined,
  direction: 1 | -1,
): number {
  const aValue = typeof a === 'number' && Number.isFinite(a) ? a : Number.NEGATIVE_INFINITY
  const bValue = typeof b === 'number' && Number.isFinite(b) ? b : Number.NEGATIVE_INFINITY
  return (aValue - bValue) * direction
}

function resolveTencentMarketplaceSummary(
  locale: MarketplaceLocale,
  descriptionZh?: string | null,
  description?: string | null,
): string {
  const zhSummary = normalizeTencentMarketplaceSummary(descriptionZh ?? '')
  const enSummary = normalizeTencentMarketplaceSummary(description ?? '')

  if (locale === 'zh') {
    return zhSummary || enSummary
  }

  return enSummary || zhSummary
}

function normalizeTencentMarketplaceSummary(summary: string): string {
  const normalized = summary.replace(/\r\n/g, '\n').trim()
  if (!normalized || !/\p{Script=Han}/u.test(normalized)) {
    return normalized
  }

  const lines = normalized
    .split('\n')
    .map((line) => extractTencentChineseLine(line))
    .filter((line) => line.length > 0)

  const deduped = dedupeTencentSummaryLines(lines)
  return deduped.length > 0 ? deduped.join('\n') : normalized
}

function extractTencentChineseLine(line: string): string {
  const trimmed = line.trim()
  if (!trimmed || !/\p{Script=Han}/u.test(trimmed)) {
    return ''
  }

  const matches = trimmed.match(/[^.!?。！？；;\n]*\p{Script=Han}[^.!?。！？；;\n]*[.!?。！？；;]?/gu) ?? []
  if (matches.length === 0) {
    return trimmed
  }

  return matches.map((segment) => segment.trim()).filter((segment) => segment.length > 0).join('')
}

function dedupeTencentSummaryLines(lines: string[]): string[] {
  const seen = new Set<string>()
  const deduped: string[] = []

  for (const line of lines) {
    const key = line.replace(/\s+/g, ' ').replace(/[.!?。！？；;]+$/u, '').trim()
    if (!key || seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push(line)
  }

  return deduped
}

function parseOffsetCursor(cursor: string | null, prefix: string): number {
  if (!cursor || !cursor.startsWith(prefix)) {
    return 0
  }
  const value = Number.parseInt(cursor.slice(prefix.length), 10)
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function normalizeMarketplaceOrder(order: MarketplaceOrder | undefined, sort: MarketplaceSort): MarketplaceOrder {
  if (order === 'asc' || order === 'desc') {
    return order
  }
  return sort === 'name' ? 'asc' : 'desc'
}

function normalizeMarketplaceLocale(locale: MarketplaceLocale | undefined): MarketplaceLocale {
  return locale === 'en' ? 'en' : 'zh'
}

function normalizeTencentMarketplaceCategory(category?: string | null): TencentMarketplaceCategory | 'other' {
  const normalized = category?.trim().toLowerCase() ?? ''

  switch (normalized) {
    case 'ai-intelligence':
      return 'ai-intelligence'
    case 'developer-tools':
    case 'browser':
      return 'developer-tools'
    case 'productivity':
      return 'productivity'
    case 'data-analysis':
      return 'data-analysis'
    case 'content-creation':
      return 'content-creation'
    case 'security-compliance':
      return 'security-compliance'
    case 'communication-collaboration':
      return 'communication-collaboration'
    case 'other':
    case '其他':
    default:
      return 'other'
  }
}

function resolveClawHubSort(sort: MarketplaceSort): 'newest' | 'updated' | 'downloads' | 'installs' | 'stars' | 'name' {
  switch (sort) {
    case 'newest':
    case 'updated':
    case 'downloads':
    case 'installs':
    case 'stars':
    case 'name':
      return sort
    case 'score':
      return 'downloads'
  }
}

function resolveTencentSortParams(sort: MarketplaceSort, requestedOrder?: MarketplaceOrder): { sortBy: string; order: MarketplaceOrder } {
  switch (sort) {
    case 'score':
      return { sortBy: 'score', order: normalizeMarketplaceOrder(requestedOrder, 'score') }
    case 'downloads':
      return { sortBy: 'downloads', order: normalizeMarketplaceOrder(requestedOrder, 'downloads') }
    case 'installs':
      return { sortBy: 'installs', order: normalizeMarketplaceOrder(requestedOrder, 'installs') }
    case 'stars':
      return { sortBy: 'stars', order: normalizeMarketplaceOrder(requestedOrder, 'stars') }
    case 'newest':
    case 'updated':
    case 'name':
      return { sortBy: 'score', order: normalizeMarketplaceOrder(requestedOrder, 'score') }
    default:
      return { sortBy: 'score', order: normalizeMarketplaceOrder(requestedOrder, 'score') }
  }
}

function compareRegistrySourceInfo(a: RegistrySourceInfo, b: RegistrySourceInfo): number {
  if (a.id === 'recommended') return -1
  if (b.id === 'recommended') return 1
  return a.id.localeCompare(b.id)
}

function normalizeStats(stats: unknown): MarketplaceStats {
  const safe = stats && typeof stats === 'object' ? (stats as Record<string, unknown>) : {}
  return {
    downloads: readNumberStat(safe.downloads),
    stars: readNumberStat(safe.stars),
    installsCurrent: readNumberStat(safe.installsCurrent),
    installsAllTime: readNumberStat(safe.installsAllTime),
  }
}

function normalizeMetadata(metadata?: { os?: string[] | null; systems?: string[] | null } | null) {
  if (!metadata) {
    return undefined
  }

  return {
    os: Array.isArray(metadata.os) ? metadata.os.map(String) : [],
    systems: Array.isArray(metadata.systems) ? metadata.systems.map(String) : [],
  }
}

function readNumberStat(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function resolveLatestVersion(tags?: Record<string, string>): string | null {
  if (!tags) {
    return null
  }
  return typeof tags.latest === 'string' ? tags.latest : null
}

function resolveClawHubDetailUrl(ownerHandle?: string | null, slug?: string | null): string | null {
  if (!ownerHandle || !slug) {
    return null
  }
  return `https://clawhub.ai/${ownerHandle}/${slug}`
}
