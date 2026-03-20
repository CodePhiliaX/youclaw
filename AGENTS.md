# Repository Guidelines

## Project Structure & Module Organization
The Bun backend lives in [`src/`](/Users/jerry/Program/ATA/YouClaw/src), organized by domain: `agent/`, `channel/`, `db/`, `routes/`, `scheduler/`, `memory/`, and `skills/`. End-to-end and database-heavy tests live in [`tests/`](/Users/jerry/Program/ATA/YouClaw/tests), with occasional colocated tests such as [`src/agent/manager.test.ts`](/Users/jerry/Program/ATA/YouClaw/src/agent/manager.test.ts). The React/Vite frontend lives in [`web/src/`](/Users/jerry/Program/ATA/YouClaw/web/src); static assets are in [`web/public/`](/Users/jerry/Program/ATA/YouClaw/web/public) and [`web/src/assets/`](/Users/jerry/Program/ATA/YouClaw/web/src/assets). Runtime data is stored under [`data/`](/Users/jerry/Program/ATA/YouClaw/data), while agent definitions live in [`agents/<agent-id>/`](/Users/jerry/Program/ATA/YouClaw/agents/default).

## Build, Test, and Development Commands
Use Bun for both workspaces.

- `bun run dev`: start the backend with hot reload on port `PORT` (default `62601`).
- `bun run start`: run the backend without hot reload.
- `bun run dev:web`: start the frontend dev server from `web/`.
- `bun test`: run the Bun test suite.
- `bun run typecheck`: run root TypeScript checks.
- `cd web && bun run lint`: lint the frontend with ESLint.
- `cd web && bun run build`: type-check and build the frontend bundle.

## Coding Style & Naming Conventions
Write TypeScript with 2-space indentation, single quotes, and no semicolons; match nearby files when in doubt. Keep backend modules small and domain-focused. Use `PascalCase` for React components/pages (`Tasks.tsx`), `camelCase` for functions/hooks (`useChat.ts`), and descriptive directory names (`src/routes`, `web/src/components/ui`). Frontend lint rules are defined in [`web/eslint.config.js`](/Users/jerry/Program/ATA/YouClaw/web/eslint.config.js); no Prettier config is checked in, so avoid formatting-only churn.

## Testing Guidelines
Tests use `bun:test`. Name files `*.test.ts` and prefer colocated tests for tight unit coverage or [`tests/`](/Users/jerry/Program/ATA/YouClaw/tests) for integration scenarios. Reuse [`tests/setup.ts`](/Users/jerry/Program/ATA/YouClaw/tests/setup.ts) for shared env and SQLite setup. No coverage threshold is enforced today; add regression tests for any route, scheduler, DB, or i18n behavior you change.

## Commit & Pull Request Guidelines
Follow the existing Conventional Commit style seen in history: `feat(skills): ...`, `refactor: ...`, `docs: ...`. Keep commits focused and scoped to one concern. PRs should include a short summary, impacted areas (`backend`, `web`, `agents`, `skills`), linked issues when applicable, and screenshots for UI changes. List the commands you ran, and explicitly call out any pre-existing lint/typecheck failures that are outside your diff.

## Security & Configuration Tips
Required env: `ANTHROPIC_API_KEY`. Common optional vars: `PORT`, `DATA_DIR`, `AGENT_MODEL`, `LOG_LEVEL`, and `TELEGRAM_BOT_TOKEN`. Do not commit secrets or generated runtime data from `data/`.
