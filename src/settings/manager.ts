import { getDatabase } from '../db/index.ts'
import { getEnv } from '../config/index.ts'
import {
  ActiveModelProvider,
  RegistrySourceSettingSchema,
  SettingsSchema,
  type Settings,
  type CustomModel,
} from './schema.ts'

// Key in kv_state table
const SETTINGS_KEY = 'settings'

function resolveEnvModelRef(env: ReturnType<typeof getEnv>): string {
  if (env.MODEL_PROVIDER === 'builtin') {
    return env.MODEL_ID
  }
  return env.MODEL_ID.includes('/') ? env.MODEL_ID : `${env.MODEL_PROVIDER}/${env.MODEL_ID}`
}

/**
 * Read settings from kv_state, returning defaults if missing.
 */
export function getSettings(): Settings {
  const db = getDatabase()
  const row = db.query("SELECT value FROM kv_state WHERE key = ?").get(SETTINGS_KEY) as { value: string } | null
  if (!row) {
    return normalizeSettings(SettingsSchema.parse({}))
  }
  try {
    return normalizeSettings(SettingsSchema.parse(JSON.parse(row.value)))
  } catch {
    return normalizeSettings(SettingsSchema.parse({}))
  }
}

/**
 * Partially update settings with deep merge, then write back as a whole.
 */
export function updateSettings(partial: Partial<Settings>): Settings {
  const db = getDatabase()
  const current = getSettings()
  const hasDefaultRegistrySource = Object.prototype.hasOwnProperty.call(partial, 'defaultRegistrySource')

  // Deep merge
  const merged: Settings = {
    activeModel: partial.activeModel ?? current.activeModel,
    customModels: partial.customModels ?? current.customModels,
    defaultRegistrySource: hasDefaultRegistrySource ? partial.defaultRegistrySource : current.defaultRegistrySource,
    registrySources: {
      clawhub: {
        ...current.registrySources.clawhub,
        ...partial.registrySources?.clawhub,
      },
      tencent: {
        ...current.registrySources.tencent,
        ...partial.registrySources?.tencent,
      },
    },
  }

  // Validate and write
  const validated = normalizeSettings(SettingsSchema.parse(merged))
  db.run(
    "INSERT OR REPLACE INTO kv_state (key, value) VALUES (?, ?)",
    [SETTINGS_KEY, JSON.stringify(validated)]
  )
  return validated
}

export function isRegistrySourceSetting(value: unknown): value is Settings['defaultRegistrySource'] {
  return RegistrySourceSettingSchema.safeParse(value).success
}

/**
 * Return the active model config for runtime use
 * Returns null to fall back to env vars
 */
export function getActiveModelConfig(): { apiKey: string; baseUrl: string; modelId: string; provider: string } | null {
  const settings = getSettings()
  const env = getEnv()

  if (settings.activeModel.provider === ActiveModelProvider.Builtin) {
    const builtinUrl = env.YOUCLAW_BUILTIN_API_URL
    const builtinToken = env.YOUCLAW_BUILTIN_AUTH_TOKEN
    if (builtinUrl && builtinToken) {
      return {
        apiKey: builtinToken,
        baseUrl: builtinUrl,
        modelId: resolveEnvModelRef(env),
        provider: 'builtin',
      }
    }
    if (env.MODEL_API_KEY) {
      return {
        apiKey: env.MODEL_API_KEY,
        baseUrl: env.MODEL_BASE_URL || '',
        modelId: resolveEnvModelRef(env),
        provider: 'builtin',
      }
    }
    return null
  }

  if (settings.activeModel.provider === ActiveModelProvider.Custom && settings.activeModel.id) {
    const model = settings.customModels.find((m: CustomModel) => m.id === settings.activeModel.id)
    if (model) {
      return {
        apiKey: model.apiKey,
        baseUrl: model.baseUrl,
        modelId: model.modelId,
        provider: model.provider,
      }
    }
  }

  // Custom model not found, returning null to fall back to env vars
  return null
}

function normalizeSettings(settings: Settings): Settings {
  return {
    ...settings,
    customModels: settings.customModels.map(normalizeCustomModel),
  }
}

function normalizeCustomModel(model: CustomModel): CustomModel {
  const inferredProvider = inferCustomModelProvider(model)
  if (inferredProvider === model.provider) {
    return model
  }

  return {
    ...model,
    provider: inferredProvider,
  }
}

function inferCustomModelProvider(model: CustomModel): CustomModel['provider'] {
  const modelId = model.modelId.trim()
  const lowerModelId = modelId.toLowerCase()
  const lowerBaseUrl = model.baseUrl.trim().toLowerCase()

  if (lowerModelId.startsWith('minimax-cn/')) return 'minimax-cn'
  if (lowerModelId.startsWith('minimax/') || lowerModelId.startsWith('minimax-')) return 'minimax'
  if (modelId.startsWith('MiniMax-')) return 'minimax'
  if (lowerModelId.startsWith('glm/') || lowerModelId.startsWith('glm-')) return 'glm'
  if (lowerModelId.startsWith('deepseek/') || lowerModelId.startsWith('deepseek-')) return 'deepseek'
  if (
    lowerModelId.startsWith('qwen/')
    || lowerModelId.startsWith('qwen-')
    || lowerModelId.startsWith('qwen')
    || lowerModelId.startsWith('qwq-')
    || lowerModelId.startsWith('qvq-')
  ) return 'qwen'
  if (
    lowerModelId.startsWith('moonshot/')
    || lowerModelId.startsWith('moonshot-')
    || lowerModelId.startsWith('kimi-')
    || lowerModelId.startsWith('kimi/')
  ) return 'moonshot'
  if (lowerModelId.startsWith('doubao/') || lowerModelId.startsWith('doubao-')) return 'doubao'
  if (lowerModelId.startsWith('siliconflow/')) return 'siliconflow'
  if (lowerModelId.startsWith('openrouter/')) return 'openrouter'
  if (lowerModelId.startsWith('groq/')) return 'groq'
  if (lowerModelId.startsWith('xai/') || lowerModelId.startsWith('grok-') || lowerModelId.startsWith('grok/')) return 'xai'
  if (
    lowerModelId.startsWith('mistral/')
    || lowerModelId.startsWith('mistral-')
    || lowerModelId.startsWith('ministral-')
    || lowerModelId.startsWith('magistral-')
    || lowerModelId.startsWith('devstral-')
  ) return 'mistral'
  if (lowerModelId.startsWith('together/')) return 'together'
  if (lowerModelId.startsWith('fireworks/')) return 'fireworks'
  if (lowerModelId.startsWith('ollama/')) return 'ollama'

  if (lowerBaseUrl.includes('minimax')) {
    return lowerBaseUrl.includes('/cn') ? 'minimax-cn' : 'minimax'
  }
  if (lowerBaseUrl.includes('bigmodel.cn')) return 'glm'
  if (lowerBaseUrl.includes('deepseek.com')) return 'deepseek'
  if (lowerBaseUrl.includes('dashscope.aliyuncs.com') || lowerBaseUrl.includes('aliyuncs.com/compatible-mode')) return 'qwen'
  if (lowerBaseUrl.includes('moonshot.cn')) return 'moonshot'
  if (
    lowerBaseUrl.includes('volces.com')
    || lowerBaseUrl.includes('volcengine.com')
    || lowerBaseUrl.includes('ark.cn-')
  ) return 'doubao'
  if (lowerBaseUrl.includes('siliconflow.cn')) return 'siliconflow'
  if (lowerBaseUrl.includes('openrouter.ai')) return 'openrouter'
  if (lowerBaseUrl.includes('groq.com')) return 'groq'
  if (lowerBaseUrl.includes('api.x.ai') || lowerBaseUrl.includes('x.ai/v1')) return 'xai'
  if (lowerBaseUrl.includes('mistral.ai')) return 'mistral'
  if (lowerBaseUrl.includes('together.xyz') || lowerBaseUrl.includes('together.ai')) return 'together'
  if (lowerBaseUrl.includes('fireworks.ai')) return 'fireworks'
  if (lowerBaseUrl.includes('localhost:11434') || lowerBaseUrl.includes('127.0.0.1:11434') || lowerBaseUrl.includes('ollama')) {
    return 'ollama'
  }

  return model.provider
}

/**
 * Return the built-in model's modelId for frontend display
 */
export function getBuiltinModelId(): string | null {
  const env = getEnv()
  if (env.YOUCLAW_BUILTIN_API_URL && env.YOUCLAW_BUILTIN_AUTH_TOKEN) {
    return resolveEnvModelRef(env)
  }
  if (env.MODEL_API_KEY) {
    return resolveEnvModelRef(env)
  }
  return null
}
