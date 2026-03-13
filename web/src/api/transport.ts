// Transport 抽象层：自动检测 Tauri / Web 环境

export const isTauri = typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__

export function getTauriInvoke(): (cmd: string, args?: Record<string, unknown>) => Promise<unknown> {
  if (!isTauri) throw new Error("Not in Tauri environment")
  return (window as any).__TAURI_INTERNALS__.invoke
}

// 缓存后端 baseUrl，避免重复读 store
let _cachedBaseUrl: string | null = null

/**
 * 获取后端 baseUrl
 * - Tauri 模式：从 store 读 port，默认 3000
 * - Web 模式：空字符串（走 Vite proxy）
 */
export async function getBackendBaseUrl(): Promise<string> {
  if (!isTauri) return ''
  if (_cachedBaseUrl !== null) return _cachedBaseUrl

  try {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load('settings.json')
    const port = (await store.get<string>('port')) || '3000'
    _cachedBaseUrl = `http://localhost:${port}`
  } catch {
    _cachedBaseUrl = 'http://localhost:3000'
  }
  return _cachedBaseUrl
}

/**
 * 同步获取 baseUrl（用于 EventSource 等不支持 async 的场景）
 * 必须先调用 initBaseUrl() 初始化
 */
export function getBaseUrlSync(): string {
  if (!isTauri) return ''
  return _cachedBaseUrl ?? 'http://localhost:3000'
}

/** 应用启动时调用一次，预加载 baseUrl。Tauri 模式下等待 sidecar ready 事件获取端口 */
export async function initBaseUrl(): Promise<void> {
  if (!isTauri) return

  try {
    const { listen } = await import('@tauri-apps/api/event')
    await new Promise<void>((resolve) => {
      // 最多等 30s，超时后从 store 读取兜底
      const timeout = setTimeout(async () => {
        await getBackendBaseUrl()
        resolve()
      }, 30000)

      listen<{ status: string; message: string }>('sidecar-event', (event) => {
        if (event.payload.status === 'ready') {
          clearTimeout(timeout)
          // 从 "Backend ready on port XXXXX" 提取端口
          const match = event.payload.message.match(/port\s+(\d+)/)
          if (match) {
            _cachedBaseUrl = `http://localhost:${match[1]}`
          }
          resolve()
        }
      })
    })
  } catch {
    await getBackendBaseUrl()
  }
}
