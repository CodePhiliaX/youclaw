import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'

const isWindows = process.platform === 'win32'
const SEP = isWindows ? ';' : ':'

let cachedEnv: NodeJS.ProcessEnv | null = null

/**
 * Return common Git install directories on Windows.
 * Newly installed Git won't be in process.env.PATH, so we probe well-known locations.
 */
function getWindowsGitPaths(): string[] {
  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const localAppData = process.env['LOCALAPPDATA'] || ''
  const userProfile = process.env['USERPROFILE'] || ''

  return [
    resolve(programFiles, 'Git', 'cmd'),
    resolve(programFiles, 'Git', 'bin'),
    resolve(programFilesX86, 'Git', 'cmd'),
    resolve(programFilesX86, 'Git', 'bin'),
    ...(localAppData ? [resolve(localAppData, 'Programs', 'Git', 'cmd')] : []),
    ...(userProfile ? [resolve(userProfile, 'scoop', 'apps', 'git', 'current', 'cmd')] : []),
  ]
}

/**
 * Return a copy of process.env with common tool directories appended to PATH.
 * Result is cached until resetShellEnvCache() is called.
 */
export function getShellEnv(): NodeJS.ProcessEnv {
  if (cachedEnv) return cachedEnv

  const env = { ...process.env }
  const home = process.env.HOME || process.env.USERPROFILE || ''
  if (!home) {
    cachedEnv = env
    return env
  }

  const candidates = isWindows
    ? [
        resolve(home, '.bun/bin'),
        resolve(home, '.local/bin'),
        resolve(home, '.cargo/bin'),
        resolve(home, 'scoop/shims'),
        ...getWindowsGitPaths(),
      ]
    : [
        resolve(home, '.bun/bin'),
        resolve(home, '.local/bin'),
        resolve(home, '.cargo/bin'),
        '/usr/local/bin',
        '/opt/homebrew/bin',
      ]

  const extras = candidates.filter((p) => existsSync(p))
  if (extras.length > 0) {
    // Windows env vars are case-insensitive but Node.js env object is case-sensitive.
    // The system may use 'Path' instead of 'PATH'. Update both to ensure 'where' picks it up.
    const currentPath = env.PATH || env.Path || ''
    const newPath = [currentPath, ...extras].filter(Boolean).join(SEP)
    env.PATH = newPath
    if (isWindows) {
      env.Path = newPath
    }
  }

  cachedEnv = env
  return env
}

/**
 * Cross-platform executable lookup using the enhanced PATH.
 * Returns the resolved path or null if not found.
 *
 * First probes well-known directories directly (fast, no subprocess),
 * then falls back to system 'where'/'which' command.
 */
export function which(cmd: string): string | null {
  const env = getShellEnv()
  const pathStr = env.PATH || env.Path || ''
  const ext = isWindows ? '.exe' : ''

  // Fast path: directly check each PATH directory for the executable
  for (const dir of pathStr.split(SEP)) {
    if (!dir) continue
    const fullPath = resolve(dir, cmd + ext)
    if (existsSync(fullPath)) return fullPath
    // On Windows, also try without .exe (cmd might already include it)
    if (isWindows && !cmd.includes('.')) {
      const withoutExt = resolve(dir, cmd)
      if (existsSync(withoutExt)) return withoutExt
    }
  }

  // Fallback: use system which/where command
  try {
    const bin = isWindows ? 'where' : 'which'
    return execSync(`${bin} ${cmd}`, {
      encoding: 'utf-8',
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim().split('\n')[0] || null
  } catch {
    return null
  }
}

/** Clear the cached env so subsequent calls to getShellEnv() rebuild it. */
export function resetShellEnvCache(): void {
  cachedEnv = null
}
