import { createAgentSession, createCodingTools, SessionManager, AuthStorage } from '@mariozechner/pi-coding-agent'
import type { AgentSession, AgentSessionEvent } from '@mariozechner/pi-coding-agent'
import { mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { getEnv } from '../config/index.ts'
import { getLogger } from '../logger/index.ts'
import { getSession, saveSession } from '../db/index.ts'
import type { EventBus } from '../events/index.ts'
import { ErrorCode } from '../events/types.ts'
import type { PromptBuilder } from './prompt-builder.ts'
import type { HooksManager } from './hooks.ts'
import { preprocessAttachments } from './document-converter.ts'
import { abortRegistry } from './abort-registry.ts'
import { getActiveModelConfig } from '../settings/manager.ts'
import { getAuthToken } from '../routes/auth.ts'
import { resolvePiModel } from './model-resolver.ts'
import type { SkillsLoader } from '../skills/loader.ts'
import { createSkillTool } from './tools/skill-tool.ts'
import type { AgentConfig, ProcessParams } from './types.ts'

export class AgentRuntime {
  private config: AgentConfig
  private eventBus: EventBus
  private promptBuilder: PromptBuilder
  private hooksManager: HooksManager | null
  private skillsLoader: SkillsLoader | null

  constructor(
    config: AgentConfig,
    eventBus: EventBus,
    promptBuilder: PromptBuilder,
    hooksManager?: HooksManager,
    skillsLoader?: SkillsLoader,
  ) {
    this.config = config
    this.eventBus = eventBus
    this.promptBuilder = promptBuilder
    this.hooksManager = hooksManager ?? null
    this.skillsLoader = skillsLoader ?? null
  }

  /**
   * Process a user message and return the agent's reply
   */
  async process(params: ProcessParams): Promise<string> {
    const { chatId, prompt, agentId } = params
    const logger = getLogger()

    // Notify processing started
    this.emitProcessing(agentId, chatId, true)

    // on_session_start hook
    if (this.hooksManager) {
      await this.hooksManager.execute(agentId, 'on_session_start', {
        agentId,
        chatId,
        phase: 'on_session_start',
        payload: { chatId },
      })
    }

    // Look up existing session
    const existingSessionId = getSession(agentId, chatId)
    logger.info({
      agentId, chatId,
      hasSession: !!existingSessionId,
      promptPreview: prompt.length > 100 ? prompt.slice(0, 100) + '...' : prompt,
      category: 'agent',
    }, 'Processing message')

    const startTime = Date.now()
    try {
      // pre_process hook
      let finalPrompt = prompt
      if (this.hooksManager) {
        const preCtx = await this.hooksManager.execute(agentId, 'pre_process', {
          agentId,
          chatId,
          phase: 'pre_process',
          payload: { prompt, chatId },
        })
        if (preCtx.abort) {
          return preCtx.abortReason ?? 'Message blocked by hook'
        }
        if (preCtx.modifiedPayload?.prompt) {
          finalPrompt = preCtx.modifiedPayload.prompt as string
        }
      }

      // Resolve model
      const modelConfig = getActiveModelConfig()
      if (!modelConfig) {
        throw new Error('No model config available. Please configure a model in Settings.')
      }

      // Handle builtin provider auth
      if (modelConfig.provider === 'builtin') {
        const authToken = getAuthToken()
        if (!authToken) {
          throw new Error('Not logged in: Please log in to use built-in models')
        }
      }

      logger.info({ provider: modelConfig.provider, model: modelConfig.modelId, baseUrl: modelConfig.baseUrl || '(default)' }, 'Model config loaded')

      const { fullText, sessionId } = await this.executeQuery(
        finalPrompt,
        agentId,
        chatId,
        existingSessionId,
        modelConfig,
        params.requestedSkills,
        params.attachments,
      )

      // Save session
      if (sessionId) {
        saveSession(agentId, chatId, sessionId)
      }

      // post_process hook
      let finalText = fullText
      if (this.hooksManager) {
        const postCtx = await this.hooksManager.execute(agentId, 'post_process', {
          agentId,
          chatId,
          phase: 'post_process',
          payload: { fullText, chatId },
        })
        if (postCtx.modifiedPayload?.fullText) {
          finalText = postCtx.modifiedPayload.fullText as string
        }
      }

      // Broadcast completion event
      this.eventBus.emit({
        type: 'complete',
        agentId,
        chatId,
        fullText: finalText,
        sessionId,
      })

      const durationMs = Date.now() - startTime
      logger.info({ agentId, chatId, sessionId, responseLength: finalText.length, durationMs, category: 'agent' }, 'Message processing completed')

      // on_session_end hook
      if (this.hooksManager) {
        await this.hooksManager.execute(agentId, 'on_session_end', {
          agentId,
          chatId,
          phase: 'on_session_end',
          payload: { sessionId, fullText: finalText },
        })
      }

      return finalText
    } catch (err) {
      const rawError = err instanceof Error ? err.message : String(err)
      logger.error({ agentId, chatId, error: rawError, durationMs: Date.now() - startTime, category: 'agent' }, 'Message processing failed')

      const { message: userError, errorCode } = this.humanizeError(rawError)
      logger.info({ agentId, chatId, errorCode, userError, category: 'agent' }, 'Error code identification result')

      // on_error hook
      if (this.hooksManager) {
        await this.hooksManager.execute(agentId, 'on_error', {
          agentId,
          chatId,
          phase: 'on_error',
          payload: { error: rawError },
        })
      }

      this.eventBus.emit({
        type: 'error',
        agentId,
        chatId,
        error: userError,
        errorCode,
      })

      return `Error: ${userError}`
    } finally {
      this.emitProcessing(agentId, chatId, false)
    }
  }

  /**
   * Execute agent query via pi-mono in-process session
   */
  private async executeQuery(
    prompt: string,
    agentId: string,
    chatId: string,
    existingSessionId: string | null,
    modelConfig: { apiKey: string; baseUrl: string; modelId: string; provider: string },
    requestedSkills?: string[],
    attachments?: Array<{ filename: string; mediaType: string; data: string; size: number }>,
  ): Promise<{ fullText: string; sessionId: string }> {
    const logger = getLogger()
    const env = getEnv()
    const abortController = new AbortController()
    abortRegistry.register(chatId, abortController)

    let fullText = ''

    // Build system prompt
    const systemPrompt = this.promptBuilder.build(
      this.config.workspaceDir,
      this.config,
      { agentId, chatId, requestedSkills },
    )

    const cwd = this.config.workspaceDir

    // Resolve pi-ai model
    const model = resolvePiModel(modelConfig)

    // Create AuthStorage with API key
    const authStorage = AuthStorage.inMemory()
    authStorage.setRuntimeApiKey(model.provider, modelConfig.apiKey)

    // Handle custom headers for builtin provider
    if (modelConfig.provider === 'builtin') {
      const authToken = getAuthToken()
      if (authToken) {
        // Set custom headers on the model for builtin provider
        model.headers = { ...model.headers, rdxtoken: authToken }
      }
    }

    // Resolve session file path
    const sessionsDir = resolve(env.DATA_DIR, 'sessions', agentId)
    mkdirSync(sessionsDir, { recursive: true })
    const sessionFilePath = resolve(sessionsDir, `${chatId}.jsonl`)

    // Create or open session manager
    let sessionManager: SessionManager
    if (existingSessionId && existsSync(sessionFilePath)) {
      sessionManager = SessionManager.open(sessionFilePath, sessionsDir)
    } else {
      sessionManager = SessionManager.create(cwd, sessionsDir)
    }

    const sessionId = sessionManager.getSessionId()

    // Create coding tools (built-in: read, bash, edit, write)
    const tools = createCodingTools(cwd)

    // Create custom tools
    const customTools = []
    if (this.skillsLoader) {
      customTools.push(createSkillTool(this.skillsLoader))
    }

    logger.info({
      agentId, chatId,
      systemPromptLength: systemPrompt.length,
      model: model.id,
      provider: model.provider,
      isResume: !!existingSessionId,
      category: 'agent',
    }, 'Creating agent session')

    const queryStartTime = Date.now()

    try {
      // Create agent session
      const { session } = await createAgentSession({
        cwd,
        model,
        tools,
        customTools,
        authStorage,
        sessionManager,
      })

      // Override system prompt
      session.agent.setSystemPrompt(systemPrompt)

      // Subscribe to session events and map to YouClaw EventBus
      const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
        this.handleSessionEvent(event, agentId, chatId, (text) => {
          fullText += text
        })
      })

      // Send prompt
      try {
        // Handle image attachments
        if (attachments && attachments.length > 0) {
          const images = attachments
            .filter((a) => a.mediaType.startsWith('image/'))
            .map((a) => ({
              type: 'image' as const,
              data: a.data,
              mimeType: a.mediaType,
            }))

          await session.prompt(prompt, { images: images.length > 0 ? images : undefined })
        } else {
          await session.prompt(prompt)
        }
      } catch (err) {
        // User-initiated abort — return partial text gracefully
        if (abortController.signal.aborted) {
          logger.info({ agentId, chatId, category: 'agent' }, 'Agent session aborted by user, returning partial text')
          unsubscribe()
          return { fullText, sessionId }
        }
        throw err
      }

      // Wire abort signal to session
      abortController.signal.addEventListener('abort', () => {
        session.abort().catch(() => {})
      }, { once: true })

      unsubscribe()

      const durationMs = Date.now() - queryStartTime
      logger.info({
        agentId, chatId,
        totalDurationMs: durationMs,
        category: 'agent',
      }, 'Agent session finished')

      return { fullText, sessionId }
    } finally {
      abortRegistry.unregister(chatId)
    }
  }

  /**
   * Handle a pi-mono session event and map to YouClaw EventBus events
   */
  private handleSessionEvent(
    event: AgentSessionEvent,
    agentId: string,
    chatId: string,
    appendText: (text: string) => void,
  ): void {
    switch (event.type) {
      case 'message_update': {
        // Extract text delta from the assistant message event
        const assistantEvent = event.assistantMessageEvent
        if (assistantEvent.type === 'text_delta') {
          appendText(assistantEvent.delta)
          this.emitStream(agentId, chatId, assistantEvent.delta)
        }
        break
      }

      case 'tool_execution_start': {
        const logger = getLogger()
        logger.info({
          agentId, chatId,
          tool: event.toolName,
          input: JSON.stringify(event.args).slice(0, 500),
          category: 'tool_use',
        }, `Tool call: ${event.toolName}`)

        // pre_tool_use hook
        if (this.hooksManager) {
          this.hooksManager.execute(agentId, 'pre_tool_use', {
            agentId,
            chatId,
            phase: 'pre_tool_use',
            payload: { tool: event.toolName, input: event.args },
          }).then((ctx) => {
            if (ctx.abort) {
              this.emitStream(agentId, chatId, `\n[Tool ${event.toolName} blocked by hook: ${ctx.abortReason ?? 'unknown reason'}]\n`)
            }
          }).catch(() => {
            // Hook errors should not affect main flow
          })
        }

        this.emitToolUse(agentId, chatId, event.toolName, event.args)
        break
      }

      case 'agent_end':
      case 'auto_compaction_start':
      case 'auto_compaction_end':
        // These are informational, no mapping needed
        break
    }
  }

  /**
   * Convert errors to user-readable messages with error codes
   */
  private humanizeError(raw: string): { message: string; errorCode: ErrorCode } {
    if (/request interrupted by user/i.test(raw)) {
      return { message: raw, errorCode: ErrorCode.UNKNOWN }
    }
    if (/insufficient|credit|balance|quota|insufficient_credits/i.test(raw)) {
      return { message: 'Insufficient credits or API quota. Please check your account balance.', errorCode: ErrorCode.INSUFFICIENT_CREDITS }
    }
    if (/not logged in|please log in/i.test(raw)) {
      return { message: 'Please log in to use built-in models.', errorCode: ErrorCode.AUTH_FAILED }
    }
    if (/unauthorized|authentication_error|invalid.*token|invalid.*key|\b401\b/i.test(raw)) {
      return { message: 'Model authentication failed. Please check your API Key in Settings → Models.', errorCode: ErrorCode.AUTH_FAILED }
    }
    if (/rate.?limit|too many requests|429/i.test(raw)) {
      return { message: 'Request rate limited. Please try again later.', errorCode: ErrorCode.RATE_LIMITED }
    }
    if (/ECONNREFUSED|ENOTFOUND|fetch failed|network/i.test(raw)) {
      return { message: 'Cannot reach the model API. Please check your network connection and Base URL.', errorCode: ErrorCode.NETWORK_ERROR }
    }
    if (/\b50[0-9]\b|server error|bad gateway|service unavailable/i.test(raw)) {
      return { message: 'The model API returned a server error. This is usually temporary — please retry.', errorCode: ErrorCode.MODEL_CONNECTION_FAILED }
    }
    return { message: raw, errorCode: ErrorCode.UNKNOWN }
  }

  // --- Emit helper methods ---

  private emitProcessing(agentId: string, chatId: string, isProcessing: boolean): void {
    this.eventBus.emit({ type: 'processing', agentId, chatId, isProcessing })
  }

  private emitStream(agentId: string, chatId: string, text: string): void {
    this.eventBus.emit({ type: 'stream', agentId, chatId, text })
  }

  private emitToolUse(agentId: string, chatId: string, tool: string, input: unknown): void {
    this.eventBus.emit({
      type: 'tool_use',
      agentId,
      chatId,
      tool,
      input: JSON.stringify(input).slice(0, 200),
    })
  }
}
