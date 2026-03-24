/**
 * External tool download URLs for manual install guidance.
 * All values derived from the single source of truth: /tools.json
 */

import toolsConfig from '../../../tools.json'

export const CDN_BASE: string = toolsConfig.cdnBase

// Git for Windows (manual download link)
export const GIT_DOWNLOAD_URL = `${CDN_BASE}/git/${toolsConfig.git.fileName}`
