import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getPaths } from '../config/index.ts'
import { inferChannelType } from '../channel/config-schema.ts'
import { getLogger } from '../logger/index.ts'
import type { SkillsLoader } from '../skills/index.ts'
import type { MemoryManager } from '../memory/index.ts'
import type { AgentConfig } from './types.ts'

// Workspace MD file loading order
const WORKSPACE_FILES = ['SOUL.md', 'USER.md', 'AGENT.md', 'TOOLS.md'] as const

export class PromptBuilder {
  constructor(
    private skillsLoader: SkillsLoader | null,
    private memoryManager: MemoryManager | null,
  ) {}

  /**
   * Build the complete system prompt
   * Loading order: SOUL.md -> USER.md -> AGENT.md -> TOOLS.md -> Memory -> Env
   */
  build(
    workspaceDir: string,
    config: AgentConfig,
    context?: { agentId: string; chatId: string; requestedSkills?: string[]; browserProfileId?: string },
  ): string {
    const parts: string[] = []

    // Memory file absolute paths
    const agentMemoryDir = resolve(workspaceDir, 'memory')
    const agentMemoryPath = resolve(agentMemoryDir, 'MEMORY.md')
    const globalMemoryPath = resolve(getPaths().agents, '_global', 'memory', 'MEMORY.md')

    // IPC absolute paths (agent writes here, IPC Watcher reads from here)
    const agentId = context?.agentId ?? 'default'
    const ipcTasksDir = resolve(getPaths().data, 'ipc', agentId, 'tasks')
    const ipcCurrentTasksPath = resolve(getPaths().data, 'ipc', agentId, 'current_tasks.json')

    // Load workspace MD files in order
    for (const filename of WORKSPACE_FILES) {
      let content = this.loadMdFile(workspaceDir, filename)
      if (content) {
        // Replace memory path placeholders with absolute paths
        content = content
          .replaceAll('{{agentMemoryDir}}', agentMemoryDir)
          .replaceAll('{{agentMemoryPath}}', agentMemoryPath)
          .replaceAll('{{globalMemoryPath}}', globalMemoryPath)
          .replaceAll('{{ipcTasksDir}}', ipcTasksDir)
          .replaceAll('{{ipcCurrentTasksPath}}', ipcCurrentTasksPath)
        parts.push(content)
      }
    }

    // If workspace has no MD files, fall back to global system.md
    if (parts.length === 0) {
      const fallback = this.loadGlobalSystemPrompt()
      if (fallback) {
        parts.push(fallback)
      }
    }

    if (context?.browserProfileId) {
      parts.push(
        `## Browser Tools\n` +
        `This chat is connected to browser profile "${context.browserProfileId}". ` +
        `Use the built-in \`mcp__browser__*\` tools for browser interaction instead of composing external browser CLI commands. ` +
        `Do NOT invoke the legacy \`agent-browser\` skill and do NOT run \`agent-browser\` from Bash when these browser tools are available.`
      )
    }

    // Inject memory context
    if (this.memoryManager && context) {
      const memoryConfig = config.memory
      const memoryContext = this.memoryManager.getMemoryContext(context.agentId, {
        recentDays: memoryConfig?.recentDays,
        maxContextChars: memoryConfig?.maxContextChars,
      })
      if (memoryContext) {
        parts.push(memoryContext)
      }
    }

    // Inject environment context
    const envContext = this.buildEnvContext()
    if (envContext) {
      parts.push(envContext)
    }

    const channelContext = this.buildChannelContext(context?.chatId)
    if (channelContext) {
      parts.push(channelContext)
    }

    // Inject image tool usage rule (built-in minimax MCP is always available)
    parts.push(
      `## Image Handling Rule\n` +
      `When the user sends or references image files (jpg, png, gif, webp, bmp, svg, etc.), you MUST use the \`mcp__minimax__understand_image\` tool to analyze them.\n` +
      `NEVER use the \`Read\` tool on image files — it cannot interpret visual content and will only return useless binary data.\n` +
      `This rule is absolute and has no exceptions.`
    )

    parts.push(
      `## Document Handling Rule\n` +
      `When parsed document ids are available, you MUST use the \`mcp__document__search_document\` and \`mcp__document__read_document_chunk\` tools first.\n` +
      `Do NOT use the \`Read\` tool on the original document file when a parsed document is available.\n` +
      `If document parsing fails, be explicit about the failure instead of pretending the document was read.`
    )

    // Inject current context (needed when agent creates scheduled tasks)
    if (context) {
      parts.push(
        `\n## Current Context\n- Agent ID: ${context.agentId}\n- Chat ID: ${context.chatId}\n- IPC Directory: ${ipcTasksDir}`,
      )
    }

    return parts.join('\n\n')
  }

  /**
   * Load workspace MD file, skip if missing (no error)
   */
  private loadMdFile(workspaceDir: string, filename: string): string | null {
    const filePath = resolve(workspaceDir, filename)

    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf-8').trim()
        if (content) {
          getLogger().debug({ filename, source: 'workspace' }, 'Prompt file loaded')
          return content
        }
      } catch (err) {
        getLogger().warn({ filename, error: err instanceof Error ? err.message : String(err) }, 'Failed to read prompt file')
      }
    }

    return null
  }

  /**
   * Fall back to global prompts/system.md
   */
  private loadGlobalSystemPrompt(): string | null {
    const systemPath = resolve(getPaths().prompts, 'system.md')
    if (existsSync(systemPath)) {
      try {
        return readFileSync(systemPath, 'utf-8').trim()
      } catch {
        return null
      }
    }
    return null
  }

  /**
   * Build environment context (dynamically generated from prompts/env.md template)
   */
  private buildEnvContext(): string | null {
    const envPath = resolve(getPaths().prompts, 'env.md')
    if (!existsSync(envPath)) return null

    try {
      let envPrompt = readFileSync(envPath, 'utf-8')
      envPrompt = envPrompt
        .replace('{{date}}', new Date().toISOString().split('T')[0]!)
        .replace('{{os}}', process.platform)
        .replace('{{platform}}', process.arch)
        .replace('{{cwd}}', process.cwd())
      return envPrompt.trim()
    } catch {
      return null
    }
  }
  private buildChannelContext(chatId?: string): string | null {
    if (!chatId) return null

    const channel = inferChannelType(chatId)
    if (channel !== 'wechat-personal') return null

    const recipientId = this.parseWechatPersonalPeerId(chatId)
    if (!recipientId) return null

    return [
      '## Channel Context',
      '',
      '- Current channel: wechat-personal',
      `- Current recipient WeChat ID: ${recipientId}`,
      '- This channel supports sending text, images, and files back to the current user.',
      '- To send an image or file, use the `mcp__message__send_to_current_chat` tool and set `media` to an absolute local file path or an HTTPS URL.',
      '- To send plain text back to the user without media, use the `mcp__message__send_to_current_chat` tool with `text`.',
      '- For the current conversation, do not claim that WeChat cannot send images or files. Send them directly with `mcp__message__send_to_current_chat` instead.',
      '- You normally do not need to set `to` manually for the current conversation recipient.',
      '- If you generate or save a file before sending it, always use an absolute path such as `/tmp/example.png`.',
    ].join('\n')
  }

  private parseWechatPersonalPeerId(chatId: string): string | null {
    if (!chatId.startsWith('wxp:')) return null
    const rest = chatId.slice(4)
    const firstColon = rest.indexOf(':')
    if (firstColon <= 0 || firstColon === rest.length - 1) return null
    return rest.slice(firstColon + 1)
  }
}
