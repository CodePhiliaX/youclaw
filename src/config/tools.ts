/**
 * External tool download URLs and version configuration.
 * All values derived from the single source of truth: /tools.json
 */

import toolsConfig from '../../tools.json'

export const CDN_BASE: string = toolsConfig.cdnBase

// Bun runtime
export const BUN_VERSION: string = toolsConfig.bun.version
export const BUN_CDN_BASE = `${CDN_BASE}/bun`
export const BUN_GITHUB_BASE = `${toolsConfig.bun.githubBase}/bun-v${BUN_VERSION}`

// Git for Windows
export const GIT_VERSION: string = toolsConfig.git.version
export const GIT_CDN_URL = `${CDN_BASE}/git/${toolsConfig.git.fileName}`
