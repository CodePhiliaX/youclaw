# YouClaw

桌面端 AI 助手应用，参考 nanoClaw/OpenClaw 设计。

## 命令

```bash
pnpm dev             # 启动后端开发模式 (hot reload)
pnpm dev:web         # 启动前端开发模式
pnpm dev:electron    # 启动 Electron 开发模式
pnpm start           # 生产模式启动
pnpm typecheck       # TypeScript 类型检查
pnpm test            # 运行测试
pnpm pack            # 打包 Electron 应用（本地测试）
pnpm dist            # 构建可分发安装包
```

## 技术栈

- **运行时**: Node.js >= 22
- **包管理**: pnpm
- **后端**: Hono (HTTP) + node:sqlite (数据库) + Pino (日志)
- **Agent**: @anthropic-ai/claude-agent-sdk
- **前端**: Vite + React + shadcn/ui + Tailwind CSS
- **校验**: Zod (v4, 使用 `zod/v4` 导入)
- **定时任务**: croner (cron 表达式解析)
- **Telegram**: grammY
- **配置格式**: YAML (yaml 库)

## 架构

- 详见 `plans/architecture.md`
- 三层结构：入口层（Telegram/Web/API）→ 核心层（AgentManager/Scheduler/Memory/Skills）→ 存储层（SQLite/文件系统）
- EventBus 解耦 Agent 执行和多端输出
- IPC Watcher 通过文件系统实现 Agent ↔ 主进程通信（定时任务的增删改查）

## 项目结构

```
src/
├── agent/          # AgentManager（加载 agent.yaml）、AgentRuntime（claude-agent-sdk）、AgentQueue（并发队列）、PromptBuilder、SubagentTracker
├── channel/        # MessageRouter（消息路由）、TelegramChannel
├── config/         # env.ts（Zod 校验环境变量）、paths.ts（路径常量）
├── db/             # node:sqlite 初始化、消息/会话/定时任务 CRUD
├── events/         # EventBus + 类型定义（stream/tool_use/complete/error/subagent_*）
├── ipc/            # IpcWatcher（文件轮询 IPC）、任务快照写入
├── logger/         # Pino 日志
├── memory/         # MemoryManager（per-agent MEMORY.md + logs）
├── routes/         # Hono API 路由（agents/messages/stream/skills/memory/tasks/system/health）
├── scheduler/      # Scheduler（30s 轮询、cron/interval/once、退避、卡住检测）
├── skills/         # SkillsLoader（三级优先级: workspace > builtin > user）、SkillsWatcher（热更新）、资格检查、frontmatter 解析、/skill 调用语法
agents/
├── <id>/           # agent.yaml + SOUL.md + TOOLS.md + USER.md + AGENT.md + skills/ + memory/ + prompts/
skills/             # 项目级 skills（SKILL.md 格式，YAML frontmatter）
prompts/            # system.md（系统提示词）、env.md（环境描述）
web/src/
├── pages/          # Chat、Agents、Skills、Memory、Tasks、System
├── api/            # HTTP client
├── i18n/           # 中英文国际化
├── components/     # layout + shadcn/ui
```

## 环境变量

- `ANTHROPIC_API_KEY` (必填)
- `PORT` (默认 3000)
- `DATA_DIR` (默认 ./data)
- `AGENT_MODEL` (默认 claude-sonnet-4-6)
- `LOG_LEVEL` (debug/info/warn/error, 默认 info)
- `TELEGRAM_BOT_TOKEN` (可选, 启用 Telegram channel)

## 约定

- 使用 `node:sqlite`（Node 内置 SQLite）作为数据库驱动，无需 native addon
- 使用 `node:fs` 的 readFileSync/writeFileSync（非 Bun.file）
- 使用 `dotenv` 或 `.env` 文件加载环境变量
- 提交信息使用 Conventional Commits（英文）
- 代码注释使用中文
- Agent 配置使用 YAML 格式（`agent.yaml`），Zod schema 校验
- Skills 使用 Markdown + YAML frontmatter 格式（`SKILL.md`），三级加载优先级：Agent workspace > 项目 `skills/` > `~/.youclaw/skills/`
- 数据库迁移使用 try/catch ALTER TABLE 模式（无独立迁移工具）
- API 路由统一挂载在 `/api` 前缀下
