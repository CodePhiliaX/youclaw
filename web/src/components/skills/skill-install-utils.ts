/**
 * Map executable names (from skill dependencies) to env tool names (from /api/install-tool).
 * If a dependency can be installed via the environment module, we show a one-click install button.
 */
const DEP_TO_ENV_TOOL: Record<string, string> = {
  uv: 'uv',
  uvx: 'uv', // uvx is part of the uv package
  python: 'python',
  python3: 'python',
  bun: 'bun',
  git: 'git',
  node: 'node',
}

/**
 * Resolve which env tools are needed for a list of missing skill dependencies.
 * Returns deduplicated list of env tool names that can be installed via /api/install-tool.
 */
export function resolveEnvTools(missingDeps: string[]): string[] {
  const tools = new Set<string>()
  for (const dep of missingDeps) {
    const tool = DEP_TO_ENV_TOOL[dep]
    if (tool) tools.add(tool)
  }
  return Array.from(tools)
}
