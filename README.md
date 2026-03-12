# YouClaw

Desktop AI assistant powered by Claude, inspired by nanoClaw / OpenClaw.

- Multi-agent management with YAML config
- Scheduled tasks (cron / interval / once)
- Persistent per-agent memory
- Skills system compatible with OpenClaw SKILL.md format
- Web UI (React + shadcn/ui) with SSE streaming
- Telegram channel support
- Electron desktop app packaging

## Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js >= 22 |
| Package Manager | pnpm |
| Backend | Hono + SQLite (node:sqlite) + Pino |
| Agent | `@anthropic-ai/claude-agent-sdk` |
| Frontend | Vite + React + shadcn/ui + Tailwind CSS |
| Telegram | grammY |
| Scheduled Tasks | croner |

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/) >= 9
- An [Anthropic API key](https://console.anthropic.com/)

### Setup

```bash
# Clone
git clone https://github.com/CodePhiliaX/youClaw.git
cd youClaw

# Install dependencies
pnpm install
cd web && pnpm install && cd ..

# Configure environment
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY
```

### Run

```bash
# Start backend (hot reload)
pnpm dev

# Start frontend (in another terminal)
pnpm dev:web
```

Open http://localhost:5173 for the Web UI. The API server runs on http://localhost:3000.

### Production

```bash
pnpm start
```

### Electron (Desktop App)

```bash
# Development
pnpm dev:electron

# Package (macOS arm64, local testing)
pnpm pack

# Build distributable
pnpm dist
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | - | Anthropic API key |
| `ANTHROPIC_BASE_URL` | No | - | Custom API base URL |
| `PORT` | No | `3000` | Backend server port |
| `DATA_DIR` | No | `./data` | Data storage directory |
| `AGENT_MODEL` | No | `claude-sonnet-4-6` | Default Claude model |
| `LOG_LEVEL` | No | `info` | Log level (debug/info/warn/error) |
| `TELEGRAM_BOT_TOKEN` | No | - | Enable Telegram channel |

## Project Structure

```
src/
├── agent/          # AgentManager, AgentRuntime, AgentQueue, PromptBuilder
├── channel/        # MessageRouter, TelegramChannel
├── config/         # Environment validation, path constants
├── db/             # SQLite init, CRUD operations
├── events/         # EventBus (stream/tool_use/complete/error)
├── ipc/            # File-polling IPC between Agent and main process
├── logger/         # Pino logger
├── memory/         # Per-agent MEMORY.md and conversation logs
├── routes/         # Hono API routes (/api/*)
├── scheduler/      # Cron/interval/once task scheduler
├── skills/         # Skills loader, watcher, frontmatter parser
agents/             # Agent configs (agent.yaml + SOUL.md + skills/)
skills/             # Project-level skills (SKILL.md format)
prompts/            # System & environment prompts
web/src/            # React frontend
electron/           # Electron main process
```

## Commands

```bash
pnpm dev             # Backend dev server (hot reload)
pnpm dev:web         # Frontend dev server
pnpm dev:electron    # Electron dev mode
pnpm start           # Production mode
pnpm typecheck       # TypeScript type check
pnpm test            # Run tests
pnpm pack            # Package Electron app (local testing)
pnpm dist            # Build distributable
```

## License

ISC
