import { describe, expect, test } from 'bun:test'
import './setup-light.ts'
import { resolvePiModel } from '../src/agent/model-resolver.ts'

describe('resolvePiModel', () => {
  test('preserves qualified proxy model ids for built-in cloud routes', () => {
    const model = resolvePiModel({
      apiKey: 'token',
      baseUrl: 'https://readmex.com/api',
      modelId: 'minimax/MiniMax-M2.5-highspeed',
      provider: 'builtin',
    })

    expect(model.provider).toBe('minimax')
    expect(model.api).toBe('anthropic-messages')
    expect(model.baseUrl).toBe('https://readmex.com/api')
    expect(model.id).toBe('minimax/MiniMax-M2.5-highspeed')
  })

  test('infers minimax anthropic api for proxy models missing from the local registry', () => {
    const model = resolvePiModel({
      apiKey: 'token',
      baseUrl: 'https://readmex.com/api',
      modelId: 'minimax/MiniMax-M2.7-highspeed',
      provider: 'builtin',
    })

    expect(model.provider).toBe('minimax')
    expect(model.api).toBe('anthropic-messages')
    expect(model.baseUrl).toBe('https://readmex.com/api')
    expect(model.id).toBe('minimax/MiniMax-M2.7-highspeed')
  })

  test('uses the GLM OpenAI-compatible defaults for manual models', () => {
    const model = resolvePiModel({
      apiKey: 'token',
      baseUrl: '',
      modelId: 'glm-4.6',
      provider: 'glm',
    })

    expect(model.provider).toBe('glm')
    expect(model.api).toBe('openai-completions')
    expect(model.baseUrl).toBe('https://open.bigmodel.cn/api/paas/v4')
    expect(model.id).toBe('glm-4.6')
  })

  test('uses the OpenRouter v1 base url for manual models', () => {
    const model = resolvePiModel({
      apiKey: 'token',
      baseUrl: '',
      modelId: 'openai/gpt-4.1-mini',
      provider: 'openrouter',
    })

    expect(model.provider).toBe('openrouter')
    expect(model.api).toBe('openai-completions')
    expect(model.baseUrl).toBe('https://openrouter.ai/api/v1')
    expect(model.id).toBe('openai/gpt-4.1-mini')
  })
})
