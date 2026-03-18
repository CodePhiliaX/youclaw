import { existsSync } from 'node:fs'

/**
 * Detect system Chrome executable path.
 * Returns the first found candidate path, or null if none found.
 */
export function detectChromePath(): string | null {
  const candidates =
    process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : process.platform === 'win32'
        ? [
            `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
            `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
          ]
        : ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium']

  for (const p of candidates) {
    if (p && existsSync(p)) return p
  }
  return null
}
