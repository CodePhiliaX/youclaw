import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { appendFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const DEFAULT_PORT = 62601
const STARTED_AT = new Date().toISOString()
const SHELL_DISABLED_MESSAGE = 'Gateway shell build: API disabled for runtime verification.'

const SHELL_SETTINGS = {
  activeModel: {
    provider: 'custom',
    id: 'gateway-shell',
  },
  customModels: [
    {
      id: 'gateway-shell',
      name: 'Gateway Shell',
      provider: 'custom',
      apiKey: '',
      baseUrl: '',
      modelId: 'gateway-shell',
    },
  ],
  defaultRegistrySource: 'clawhub',
  registrySources: {
    clawhub: {
      enabled: false,
      apiBaseUrl: '',
      downloadUrl: '',
      token: '',
    },
    tencent: {
      enabled: false,
      indexUrl: '',
      searchUrl: '',
      downloadUrl: '',
    },
  },
  builtinModelId: null,
} as const

function getRuntimeLabel(): string {
  if (typeof Bun !== 'undefined') {
    return `bun ${Bun.version}`
  }
  return `node ${process.versions.node}`
}

function getPort(): number {
  const parsed = Number.parseInt(process.env.PORT ?? '', 10)
  if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
    return parsed
  }
  return DEFAULT_PORT
}

function writeStartupCrashLog(errorText: string): void {
  try {
    const baseDir = process.env.DATA_DIR
      ? resolve(process.env.DATA_DIR)
      : resolve(tmpdir(), 'youclaw-data')
    mkdirSync(baseDir, { recursive: true })
    appendFileSync(
      resolve(baseDir, 'startup-crash.log'),
      `[${new Date().toISOString()}] ${errorText}\n`,
      'utf-8',
    )
  } catch {
    // Best effort only.
  }
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(body)
}

function noContent(res: ServerResponse, status = 204): void {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store',
  })
  res.end()
}

function sendSse(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })
  res.write(`event: connected\ndata: ${JSON.stringify({
    type: 'connected',
    mode: 'gateway-shell',
    runtime: getRuntimeLabel(),
    startedAt: STARTED_AT,
  })}\n\n`)

  const timer = setInterval(() => {
    res.write(`: keepalive ${Date.now()}\n\n`)
  }, 15000)

  req.on('close', () => {
    clearInterval(timer)
    res.end()
  })
}

function handleDisabledApi(res: ServerResponse, path: string): void {
  json(res, 503, {
    error: SHELL_DISABLED_MESSAGE,
    mode: 'gateway-shell',
    path,
    runtime: getRuntimeLabel(),
  })
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const method = req.method ?? 'GET'
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
  const runtime = getRuntimeLabel()

  if (method === 'OPTIONS') {
    noContent(res)
    return
  }

  if ((method === 'GET' || method === 'HEAD') && url.pathname === '/api/health') {
    const payload = {
      ok: true,
      mode: 'gateway-shell',
      runtime,
      pid: process.pid,
      platform: process.platform,
      startedAt: STARTED_AT,
      port: getPort(),
    }
    if (method === 'HEAD') {
      noContent(res, 200)
      return
    }
    json(res, 200, payload)
    return
  }

  if (method === 'GET' && url.pathname === '/api/status') {
    json(res, 200, {
      uptime: Math.floor(process.uptime()),
      platform: process.platform,
      nodeVersion: runtime,
      agents: { total: 1, active: 1 },
      telegram: { connected: false },
      channels: [],
      database: {
        path: '(disabled in gateway shell build)',
        sizeBytes: 0,
      },
      startedAt: STARTED_AT,
    })
    return
  }

  if (method === 'GET' && url.pathname === '/api/auth/cloud-status') {
    json(res, 200, { enabled: false })
    return
  }

  if (method === 'GET' && url.pathname === '/api/settings') {
    json(res, 200, SHELL_SETTINGS)
    return
  }

  if (method === 'PATCH' && url.pathname === '/api/settings') {
    json(res, 200, SHELL_SETTINGS)
    return
  }

  if (method === 'GET' && url.pathname === '/api/registry/sources') {
    json(res, 200, [])
    return
  }

  if (method === 'GET' && url.pathname === '/api/git-check') {
    json(res, 200, { available: true, path: null })
    return
  }

  if (method === 'GET' && url.pathname === '/api/agents') {
    json(res, 200, [
      {
        id: 'default',
        name: `Gateway Shell (${runtime})`,
        workspaceDir: process.cwd(),
        status: 'shell',
        hasConfig: false,
      },
    ])
    return
  }

  if (method === 'GET' && url.pathname === '/api/chats') {
    json(res, 200, [])
    return
  }

  if (method === 'GET' && url.pathname === '/api/browser-profiles') {
    json(res, 200, [])
    return
  }

  if (method === 'GET' && url.pathname.startsWith('/api/stream/')) {
    sendSse(req, res)
    return
  }

  if (url.pathname.startsWith('/api/')) {
    handleDisabledApi(res, url.pathname)
    return
  }

  json(res, 404, { error: 'Not found' })
}

async function main(): Promise<void> {
  const port = getPort()
  const server = createServer(handleRequest)

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', rejectPromise)
      resolvePromise()
    })
  })

  console.log(`[gateway-shell] runtime=${getRuntimeLabel()} port=${port}`)

  const shutdown = () => {
    console.log('[gateway-shell] shutting down')
    server.close(() => process.exit(0))
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'EADDRINUSE') {
    const port = getPort()
    console.error(`[PORT_CONFLICT] Port ${port} is already in use`)
    process.exit(1)
  }

  const errorText = err instanceof Error ? err.stack ?? err.message : String(err)
  const context = [
    `PORT=${process.env.PORT ?? '(unset)'}`,
    `DATA_DIR=${process.env.DATA_DIR ?? '(unset)'}`,
    `TEMP=${process.env.TEMP ?? '(unset)'}`,
    `BUN_TMPDIR=${process.env.BUN_TMPDIR ?? '(unset)'}`,
  ].join(' ')

  console.error('[gateway-shell] fatal error:', errorText)
  writeStartupCrashLog(`[context: ${context}] ${errorText}`)
  process.exit(1)
})
