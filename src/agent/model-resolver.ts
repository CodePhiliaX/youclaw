import { getModel } from '@mariozechner/pi-ai'
import type { Api, Model } from '@mariozechner/pi-ai'
import { getLogger } from '../logger/index.ts'

// Known provider -> pi-ai provider mapping
const PROVIDER_MAP: Record<string, string> = {
  minimax: 'minimax',
  glm: 'glm',
  qwen: 'qwen',
  doubao: 'doubao',
  ollama: 'ollama',
  deepseek: 'deepseek',
  openai: 'openai',
  gemini: 'google',
  anthropic: 'anthropic',
  moonshot: 'moonshot',
  siliconflow: 'siliconflow',
  openrouter: 'openrouter',
  groq: 'groq',
  xai: 'xai',
  mistral: 'mistral',
  together: 'together',
  fireworks: 'fireworks',

}

// Default model IDs per provider for fallback
const DEFAULT_MODEL_IDS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4.1',
  google: 'gemini-2.5-flash',
}

export interface ModelConfig {
  apiKey: string
  baseUrl: string
  modelId: string
  provider: string
}

/**
 * Resolve a YouClaw model config to a pi-ai Model object.
 *
 * Strategy:
 * 1. Try to resolve via pi-ai's built-in model registry (getModel)
 * 2. If that fails (custom/unknown model), construct a Model manually for the anthropic API
 */
export function resolvePiModel(config: ModelConfig): Model<Api> {
  const logger = getLogger()
  const piProvider = PROVIDER_MAP[config.provider] ?? config.provider
  const qualifiedModel = parseQualifiedModelId(config.modelId)

  // Try resolving from pi-ai's built-in registry
  try {
    const model = getModel(piProvider as any, config.modelId as any)
    if (model) {
      return applyBaseUrlOverride(model, config.baseUrl, config.modelId, false)
    }
  } catch {
    // Model not in registry, fall back to manual construction
  }

  // For provider/modelId combos that include a slash (e.g., "minimax/MiniMax-M2.5-highspeed"),
  // try splitting and resolving
  if (qualifiedModel) {
    try {
      const model = getModel(qualifiedModel.provider as any, qualifiedModel.modelId as any)
      if (model) {
        // For proxy/custom base URLs, preserve the original qualified model id so
        // the upstream router can still see `provider/model` instead of the
        // stripped provider-specific registry id.
        return applyBaseUrlOverride(model, config.baseUrl, config.modelId, true)
      }
    } catch {
      // continue to manual construction
    }
  }

  const manualProvider = qualifiedModel?.provider ?? piProvider
  logger.info({ provider: manualProvider, modelId: config.modelId }, 'Model not in pi-ai registry, constructing manually')

  // Manual construction for custom/unknown models
  const api = resolveApi(manualProvider)

  return {
    id: config.modelId,
    name: config.modelId,
    api,
    provider: manualProvider,
    baseUrl: config.baseUrl || resolveDefaultBaseUrl(manualProvider),
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 8192,
  } as Model<Api>
}

/**
 * Resolve the default API type for a provider
 */
function resolveApi(provider: string): Api {
  switch (provider) {
    case 'anthropic':
    case 'minimax':
    case 'minimax-cn':
      return 'anthropic-messages'
    case 'openai':
      return 'openai-responses'
    case 'google':
      return 'google-generative-ai'
    case 'mistral':
      return 'mistral-conversations'
    default:
      // Most custom providers are OpenAI-compatible
      return 'openai-completions'
  }
}

/**
 * Resolve default base URL for known providers
 */
function resolveDefaultBaseUrl(provider: string): string {
  switch (provider) {
    case 'anthropic':
      return 'https://api.anthropic.com'
    case 'minimax':
      return 'https://api.minimax.io/anthropic'
    case 'openai':
      return 'https://api.openai.com'
    case 'google':
      return 'https://generativelanguage.googleapis.com'
    case 'glm':
      return 'https://open.bigmodel.cn/api/paas/v4'
    case 'deepseek':
      return 'https://api.deepseek.com'
    case 'qwen':
      return 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    case 'moonshot':
      return 'https://api.moonshot.cn/v1'
    case 'doubao':
      return 'https://ark.cn-beijing.volces.com/api/v3'
    case 'siliconflow':
      return 'https://api.siliconflow.cn/v1'
    case 'openrouter':
      return 'https://openrouter.ai/api/v1'
    case 'groq':
      return 'https://api.groq.com/openai/v1'
    case 'xai':
      return 'https://api.x.ai/v1'
    case 'mistral':
      return 'https://api.mistral.ai'
    case 'together':
      return 'https://api.together.xyz/v1'
    case 'fireworks':
      return 'https://api.fireworks.ai/inference/v1'
    case 'ollama':
      return 'http://localhost:11434/v1'
    default:
      return ''
  }
}

function parseQualifiedModelId(modelId: string): { provider: string; modelId: string } | null {
  if (!modelId.includes('/')) return null
  const [providerPart, rawModelId] = modelId.split('/', 2)
  if (!providerPart || !rawModelId) return null
  return {
    provider: PROVIDER_MAP[providerPart] ?? providerPart,
    modelId: rawModelId,
  }
}

function applyBaseUrlOverride<T extends Model<Api>>(
  model: T,
  baseUrl: string,
  originalModelId: string,
  preserveQualifiedModelId: boolean,
): T {
  if (!baseUrl) {
    return model
  }

  if (!preserveQualifiedModelId) {
    return { ...model, baseUrl } as T
  }

  return {
    ...model,
    id: originalModelId,
    name: originalModelId,
    baseUrl,
  } as T
}
