import type {
  ChannelPlugin,
  OpenClawPluginApi,
  OpenClawConfig,
  PluginRuntime,
} from './plugin-sdk.ts'
import { getPaths } from '../config/paths.ts'

export type RegisteredOpenClawPlugin = {
  channel?: ChannelPlugin
  cliCommands: string[]
}

function unsupported(name: string): never {
  throw new Error(`Unsupported OpenClaw runtime call in YouClaw compatibility mode: ${name}`)
}

export function createNoopPluginRuntime(): PluginRuntime {
  return {
    channel: {
      commands: {
        shouldComputeCommandAuthorized: (rawBody) => rawBody.trim().startsWith('/'),
        resolveCommandAuthorizedFromAuthorizers: ({ authorizers }) => authorizers.some((entry) => entry.allowed),
      },
      media: {
        saveMediaBuffer: async () => unsupported('channel.media.saveMediaBuffer'),
      },
      routing: {
        resolveAgentRoute: () => ({
          agentId: undefined,
          sessionKey: 'main',
          mainSessionKey: 'main',
        }),
      },
      session: {
        resolveStorePath: () => getPaths().data,
        recordInboundSession: async () => undefined,
      },
      reply: {
        finalizeInboundContext: (ctx) => ctx,
        resolveHumanDelayConfig: () => ({ enabled: false }),
        createReplyDispatcherWithTyping: () => ({
          dispatcher: null,
          replyOptions: {},
          markDispatchIdle: () => undefined,
        }),
        withReplyDispatcher: async () => unsupported('channel.reply.withReplyDispatcher'),
        dispatchReplyFromConfig: async () => unsupported('channel.reply.dispatchReplyFromConfig'),
      },
    },
  }
}

export function activateOpenClawPluginEntry(
  entry: { register: (api: OpenClawPluginApi) => void },
  runtime: PluginRuntime = createNoopPluginRuntime(),
  config: OpenClawConfig = {},
): RegisteredOpenClawPlugin {
  let channel: ChannelPlugin | undefined
  const cliCommands: string[] = []

  entry.register({
    runtime,
    registrationMode: 'full',
    registerChannel: ({ plugin }) => {
      channel = plugin
    },
    registerCli: (_register, opts) => {
      if (Array.isArray(opts?.commands)) {
        cliCommands.push(...opts.commands)
      }
    },
  })

  return { channel, cliCommands }
}
