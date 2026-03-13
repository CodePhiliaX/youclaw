import { z } from 'zod/v4'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 手动加载 .env 文件到 process.env（不覆盖已有值）
 * 替代 Bun 的自动 .env 加载，兼容 Node.js/tsx 运行时
 */
function loadDotEnv(): void {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const envPath = resolve(__dirname, '../../.env')

  let content: string
  try {
    content = readFileSync(envPath, 'utf-8')
  } catch {
    return // .env 不存在，跳过
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    // 跳过空行和注释
    if (!trimmed || trimmed.startsWith('#')) continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue

    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()

    // 去除引号包裹
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    // 不覆盖已有环境变量（系统/命令行设置的优先）
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  PORT: z.coerce.number().default(3000),
  DATA_DIR: z.string().default('./data'),
  AGENT_MODEL: z.string().default('claude-sonnet-4-6'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  FEISHU_APP_ID: z.string().optional(),
  FEISHU_APP_SECRET: z.string().optional(),
  QQ_BOT_APP_ID: z.string().optional(),
  QQ_BOT_SECRET: z.string().optional(),
  WECOM_CORP_ID: z.string().optional(),
  WECOM_CORP_SECRET: z.string().optional(),
  WECOM_AGENT_ID: z.string().optional(),
  WECOM_TOKEN: z.string().optional(),
  WECOM_ENCODING_AES_KEY: z.string().optional(),
  DINGTALK_CLIENT_ID: z.string().optional(),
  DINGTALK_SECRET: z.string().optional(),
})

export type EnvConfig = z.infer<typeof envSchema>

let _config: EnvConfig | null = null

export function loadEnv(): EnvConfig {
  if (_config) return _config

  // Node.js/tsx 不会自动加载 .env，需要手动加载
  loadDotEnv()

  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('环境变量校验失败:')
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`)
    }
    process.exit(1)
  }

  _config = result.data

  if (!_config.ANTHROPIC_API_KEY) {
    console.warn('ANTHROPIC_API_KEY 未设置，Agent 功能将不可用。请在设置中配置 API Key。')
  }

  return _config
}

export function getEnv(): EnvConfig {
  if (!_config) throw new Error('环境变量未初始化，请先调用 loadEnv()')
  return _config
}
