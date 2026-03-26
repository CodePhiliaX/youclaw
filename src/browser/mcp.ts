import { mkdirSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { Type } from '@mariozechner/pi-ai'
import type { ToolDefinition } from '@mariozechner/pi-coding-agent'
import { getPaths } from '../config/index.ts'
import { getLogger } from '../logger/index.ts'
import type { BrowserManager } from './manager.ts'
import { createBrowserActionRouter } from './router.ts'
import type { BrowserTarget } from './types.ts'

function createScreenshotPath(chatId: string): string {
  const dir = resolve(getPaths().data, 'browser-artifacts', chatId)
  mkdirSync(dir, { recursive: true })
  return resolve(dir, `browser-${Date.now()}.png`)
}

function createJsonTool<T extends Record<string, unknown>>(
  name: string,
  description: string,
  parameters: ToolDefinition['parameters'],
  run: (args: T) => Promise<unknown>,
  formatError: (args: T, message: string) => string,
): ToolDefinition {
  return {
    name: `mcp__browser__${name}`,
    label: `mcp__browser__${name}`,
    description,
    parameters,
    async execute(_toolCallId, args: T) {
      try {
        const result = await run(args)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2),
          }],
          details: {},
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        throw new Error(formatError(args, msg))
      }
    },
  }
}

export function createBrowserMcpServer(params: {
  browserManager: BrowserManager
  chatId: string
  agentId: string
  profileId: string
  target: BrowserTarget
}): ToolDefinition[] {
  const { browserManager, chatId, agentId, profileId, target } = params
  const router = createBrowserActionRouter({
    browserManager,
    chatId,
    agentId,
    profileId,
    target,
  })

  return [
    createJsonTool(
      'status',
      'Get the status of the current browser profile runtime.',
      Type.Object({}),
      async () => router.getStatus(),
      (_args, message) => `Failed to get browser status: ${message}`,
    ),
    createJsonTool(
      'list_tabs',
      'List browser tabs for the current profile.',
      Type.Object({}),
      async () => router.listTabs(),
      (_args, message) => `Failed to list tabs: ${message}`,
    ),
    createJsonTool(
      'open_tab',
      'Open a new browser tab. Optionally navigate to a URL immediately.',
      Type.Object({
        url: Type.Optional(Type.String({ description: 'Optional absolute URL to open in the new tab' })),
      }),
      async (args: { url?: string }) => router.openTab(args.url),
      (_args, message) => `Failed to open tab: ${message}`,
    ),
    createJsonTool(
      'navigate',
      'Navigate the current browser tab to a URL.',
      Type.Object({
        url: Type.String({ description: 'Absolute URL to navigate to' }),
      }),
      async (args: { url: string }) => router.navigate(args.url),
      (_args, message) => `Failed to navigate: ${message}`,
    ),
    createJsonTool(
      'snapshot',
      'Capture a text snapshot of the current tab and assign refs to visible interactive elements.',
      Type.Object({}),
      async () => router.snapshot(),
      (_args, message) => `Failed to capture snapshot: ${message}`,
    ),
    createJsonTool(
      'act',
      'Interact with a visible element ref from the latest browser snapshot. Prefer this over raw CSS selectors.',
      Type.Object({
        ref: Type.String({ description: 'Element ref returned by the latest browser snapshot' }),
        action: Type.Union([
          Type.Literal('click'),
          Type.Literal('type'),
          Type.Literal('select'),
          Type.Literal('check'),
          Type.Literal('uncheck'),
        ], { description: 'Interaction to perform with the element ref' }),
        text: Type.Optional(Type.String({ description: 'Required when action is type' })),
        option: Type.Optional(Type.String({ description: 'Required when action is select; matches option label first, then value' })),
      }),
      async (args: {
        ref: string
        action: 'click' | 'type' | 'select' | 'check' | 'uncheck'
        text?: string
        option?: string
      }) => router.act(args),
      (args, message) => `Failed to act on ref ${args.ref}: ${message}`,
    ),
    createJsonTool(
      'screenshot',
      'Capture a screenshot of the current tab.',
      Type.Object({
        path: Type.Optional(Type.String({ description: 'Optional absolute output path for the screenshot PNG' })),
      }),
      async (args: { path?: string }) => {
        const targetPath = args.path || createScreenshotPath(chatId)
        const result = await router.screenshot(targetPath)
        return {
          ...result,
          filename: basename(result.path),
        }
      },
      (_args, message) => `Failed to take screenshot: ${message}`,
    ),
    createJsonTool(
      'click',
      'Click the first DOM element matching a CSS selector in the current tab. Prefer snapshot + act when possible.',
      Type.Object({
        selector: Type.String({ description: 'CSS selector for the element to click' }),
      }),
      async (args: { selector: string }) => router.click(args.selector),
      (args, message) => `Failed to click selector ${args.selector}: ${message}`,
    ),
    createJsonTool(
      'type',
      'Fill an input or textarea identified by a CSS selector in the current tab. Prefer snapshot + act when possible.',
      Type.Object({
        selector: Type.String({ description: 'CSS selector for the input element' }),
        text: Type.String({ description: 'Text to enter into the field' }),
      }),
      async (args: { selector: string; text: string }) => router.type(args.selector, args.text),
      (args, message) => `Failed to type into selector ${args.selector}: ${message}`,
    ),
    createJsonTool(
      'press_key',
      'Send a keyboard shortcut or key to the current tab.',
      Type.Object({
        key: Type.String({ description: 'Key name accepted by Playwright, for example Enter or Meta+L' }),
      }),
      async (args: { key: string }) => router.pressKey(args.key),
      (args, message) => `Failed to press key ${args.key}: ${message}`,
    ),
    createJsonTool(
      'close_tab',
      'Close the current tab or a tab identified by URL.',
      Type.Object({
        url: Type.Optional(Type.String({ description: 'Optional exact tab URL to close' })),
      }),
      async (args: { url?: string }) => router.closeTab(args.url),
      (_args, message) => `Failed to close tab: ${message}`,
    ),
  ]
}

export function logBrowserToolRegistration(profileId: string, target: BrowserTarget): void {
  const logger = getLogger()
  logger.info({ profileId, target, category: 'browser' }, 'Built-in browser toolset registered')
}
