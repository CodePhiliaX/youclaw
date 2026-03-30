export interface ClawHubListCursorState {
  cursor: string | null
  offset: number
}

export interface TencentListCursorState {
  page: number
  offset: number
}

const CLAWHUB_LIST_CURSOR_PREFIX = 'clawhub-list:'
const TENCENT_CURSOR_PREFIX = 'tencent:'

export function createCursorLoopKey(cursor: string | null): string {
  return cursor ?? '__start__'
}

export function parseClawHubListCursor(cursor: string | null): ClawHubListCursorState {
  if (!cursor) {
    return { cursor: null, offset: 0 }
  }

  if (!cursor.startsWith(CLAWHUB_LIST_CURSOR_PREFIX)) {
    return { cursor, offset: 0 }
  }

  try {
    const payload = JSON.parse(Buffer.from(cursor.slice(CLAWHUB_LIST_CURSOR_PREFIX.length), 'base64url').toString('utf-8')) as {
      cursor?: unknown
      offset?: unknown
    }

    return {
      cursor: typeof payload.cursor === 'string' && payload.cursor.length > 0 ? payload.cursor : null,
      offset: typeof payload.offset === 'number' && Number.isInteger(payload.offset) && payload.offset >= 0 ? payload.offset : 0,
    }
  } catch {
    return { cursor: null, offset: 0 }
  }
}

export function formatClawHubListCursor(cursor: string | null, offset: number): string {
  return `${CLAWHUB_LIST_CURSOR_PREFIX}${Buffer
    .from(JSON.stringify({ cursor, offset: Math.max(0, Math.trunc(offset)) }))
    .toString('base64url')}`
}

export function parseTencentListCursor(cursor: string | null): TencentListCursorState {
  const page = parseTencentPage(cursor)
  if (!cursor || !cursor.startsWith(TENCENT_CURSOR_PREFIX)) {
    return { page, offset: 0 }
  }

  const rawValue = cursor.slice(TENCENT_CURSOR_PREFIX.length)
  const separatorIndex = rawValue.indexOf(':')
  if (separatorIndex === -1) {
    return { page, offset: 0 }
  }

  const offset = Number.parseInt(rawValue.slice(separatorIndex + 1), 10)
  return {
    page,
    offset: Number.isFinite(offset) && offset >= 0 ? offset : 0,
  }
}

export function formatTencentListCursor(page: number, offset: number): string {
  const safePage = Math.max(1, Math.trunc(page))
  const safeOffset = Math.max(0, Math.trunc(offset))
  return safeOffset > 0
    ? `${TENCENT_CURSOR_PREFIX}${safePage}:${safeOffset}`
    : `${TENCENT_CURSOR_PREFIX}${safePage}`
}

function parseTencentPage(cursor: string | null): number {
  if (!cursor || !cursor.startsWith(TENCENT_CURSOR_PREFIX)) {
    return 1
  }

  const rawValue = cursor.slice(TENCENT_CURSOR_PREFIX.length)
  const pageValue = rawValue.split(':', 1)[0] ?? ''
  const page = Number.parseInt(pageValue, 10)
  return Number.isFinite(page) && page >= 1 ? page : 1
}
