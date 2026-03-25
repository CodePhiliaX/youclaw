import { useEffect, useState, useCallback } from "react"
import { useI18n } from "@/i18n"
import { useAppRuntimeStore } from "@/stores/app"
import type { DependencyStatus } from "@/api/client"
import { Download, Loader2, CheckCircle2, AlertTriangle, Terminal, Copy, Check, ChevronRight, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { installTool } from "@/api/client"
import { isTauri, openExternal } from "@/api/transport"
import logoUrl from "@/assets/logo.png"
import { GIT_DOWNLOAD_URL } from "@/config/tools"
const COMPACT_SIZE = { width: 520, height: 720 }
const DEFAULT_SIZE = { width: 1400, height: 900 }

async function resizeWindow(width: number, height: number) {
  if (!isTauri) return
  const { getCurrentWindow } = await import("@tauri-apps/api/window")
  const { LogicalSize } = await import("@tauri-apps/api/dpi")
  const win = getCurrentWindow()
  await win.setMinSize(new LogicalSize(width, height))
  await win.setSize(new LogicalSize(width, height))
  await win.center()
}

async function restoreMinSize() {
  if (!isTauri) return
  const { getCurrentWindow } = await import("@tauri-apps/api/window")
  const { LogicalSize } = await import("@tauri-apps/api/dpi")
  await getCurrentWindow().setMinSize(new LogicalSize(800, 600))
}

// Small inline component for copyable terminal commands
function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: ignore clipboard errors
    }
  }, [command])

  return (
    <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 font-mono text-xs">
      <Terminal size={14} className="text-muted-foreground shrink-0" />
      <code className="flex-1 text-foreground select-all break-all">{command}</code>
      <button
        onClick={handleCopy}
        className="shrink-0 p-1 rounded hover:bg-muted-foreground/10 text-muted-foreground transition-colors"
        title="Copy"
      >
        {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
      </button>
    </div>
  )
}

// Dependency metadata: descriptions and platform-specific install guidance
function getDependencyInfo(name: string, isWindows: boolean, t: any) {
  const depI18n = t.envSetup?.[name]
  const altLabel = t.envSetup?.orAlternative ?? "Or alternatively:"

  switch (name) {
    case "git":
      return {
        displayName: depI18n?.name ?? "Git",
        description: depI18n?.description ?? "Required for version control and agent operations.",
        guidance: isWindows
          ? {
              type: "download" as const,
              label: depI18n?.winDownload ?? "Download Git Installer",
              url: GIT_DOWNLOAD_URL,
              steps: depI18n?.winSteps as string[] | undefined,
            }
          : {
              type: "command" as const,
              primary: depI18n?.macCommand ?? "xcode-select --install",
              alternative: { label: altLabel, command: depI18n?.macAlt ?? "brew install git" },
            },
      }
    case "bun":
      return {
        displayName: depI18n?.name ?? "Bun",
        description: depI18n?.description ?? "Required runtime for AI agent operations.",
        guidance: isWindows
          ? {
              type: "command" as const,
              primary: depI18n?.winCommand ?? 'powershell -c "irm bun.sh/install.ps1 | iex"',
              alternative: { label: altLabel, command: depI18n?.winAlt ?? "winget install Oven-sh.Bun" },
            }
          : {
              type: "command" as const,
              primary: depI18n?.macCommand ?? "curl -fsSL https://bun.sh/install | bash",
              alternative: { label: altLabel, command: depI18n?.macAlt ?? "brew install oven-sh/bun/bun" },
            },
      }
    case "node":
      return {
        displayName: depI18n?.name ?? "Node.js (>=18)",
        description: depI18n?.description ?? "Required on Windows for AI agent SDK compatibility.",
        guidance: {
          type: "command" as const,
          primary: depI18n?.winCommand ?? "winget install OpenJS.NodeJS.LTS",
          alternative: { label: altLabel, command: depI18n?.winAlt ?? "Download from https://nodejs.org" },
        },
      }
    default:
      return {
        displayName: name,
        description: `${name} is required`,
        guidance: null,
      }
  }
}

interface EnvSetupProps {
  dependencies: DependencyStatus[]
}

export function EnvSetup({ dependencies }: EnvSetupProps) {
  const { t } = useI18n()
  const recheckEnv = useAppRuntimeStore((s) => s.recheckEnv)
  const envReady = useAppRuntimeStore((s) => s.envReady)
  const [detected, setDetected] = useState(false)
  const isWindows = navigator.userAgent.includes("Windows")

  // Filter to only missing required dependencies
  const missingDeps = dependencies.filter((d) => d.required && !d.available)

  // Shrink window to compact size on mount
  useEffect(() => {
    resizeWindow(COMPACT_SIZE.width, COMPACT_SIZE.height)
  }, [])

  // Poll for env readiness every 3 seconds
  useEffect(() => {
    if (envReady) return

    const interval = setInterval(async () => {
      const ready = await recheckEnv()
      if (ready) {
        setDetected(true)
        clearInterval(interval)
        // Restore default window size
        await resizeWindow(DEFAULT_SIZE.width, DEFAULT_SIZE.height)
        await restoreMinSize()
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [envReady, recheckEnv])

  return (
    <div className="h-screen w-screen flex flex-col bg-gradient-to-br from-background to-muted/30">
      <div className="flex-1 flex items-center justify-center overflow-auto p-8">
        <div className="w-full max-w-lg space-y-6">
          {/* Logo & Title */}
          <div className="text-center">
            <div className="inline-block transition-transform hover:scale-105 duration-300">
              <img
                src={logoUrl}
                alt="YouClaw Logo"
                className="w-20 h-20 p-2 mx-auto rounded-2xl shadow-lg border border-border/50 bg-white"
              />
            </div>
            <h1 className="mt-5 text-2xl font-bold text-foreground tracking-tight">YouClaw</h1>
          </div>

          {/* Header Card */}
          <div className="bg-card rounded-2xl shadow-lg border border-border/50 p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="bg-amber-500/10 p-2.5 rounded-xl text-amber-500 shrink-0 mt-0.5">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {t.envSetup.title}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  {t.envSetup.description}
                </p>
              </div>
            </div>

            {/* Dependency Cards */}
            <div className="space-y-4">
              {missingDeps.map((dep) => {
                const info = getDependencyInfo(dep.name, isWindows, t)
                return (
                  <DependencyCard
                    key={dep.name}
                    dep={dep}
                    info={info}
                    isWindows={isWindows}
                    t={t}
                    recheckEnv={recheckEnv}
                  />
                )
              })}
            </div>

            {/* Detection Status */}
            <div className="flex items-center justify-center gap-2 pt-2 border-t border-border/50">
              {detected ? (
                <>
                  <CheckCircle2 size={16} className="text-green-500" />
                  <span className="text-sm font-medium text-green-600 dark:text-green-400">
                    {t.envSetup.detected}
                  </span>
                </>
              ) : (
                <>
                  <Loader2 size={16} className="animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {t.envSetup.detecting}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Individual dependency card component with one-click install
function DependencyCard({
  dep,
  info,
  isWindows,
  t,
  recheckEnv,
}: {
  dep: DependencyStatus
  info: ReturnType<typeof getDependencyInfo>
  isWindows: boolean
  t: any
  recheckEnv: () => Promise<boolean>
}) {
  const guidance = info.guidance
  const [installStatus, setInstallStatus] = useState<'idle' | 'installing' | 'success' | 'error'>('idle')
  const [manualOpen, setManualOpen] = useState(false)

  // Determine platform hint
  const platformHint = (() => {
    if (dep.name === 'git' && !isWindows) return t.envSetup.macGitHint
    if ((dep.name === 'git' || dep.name === 'node') && isWindows) return t.envSetup.winAdminHint
    return null
  })()

  const handleInstall = useCallback(async () => {
    setInstallStatus('installing')
    try {
      const result = await installTool(dep.name)
      if (result.ok) {
        setInstallStatus('success')
        await recheckEnv()
      } else {
        setInstallStatus('error')
        setManualOpen(true)
      }
    } catch {
      setInstallStatus('error')
      setManualOpen(true)
    }
  }, [dep.name, recheckEnv])

  return (
    <div className="bg-muted/30 rounded-xl border border-border/30 p-4 space-y-3">
      {/* Dependency name and description */}
      <div className="flex items-start gap-2">
        <div className="bg-red-500/10 p-1.5 rounded-lg text-red-500 shrink-0 mt-0.5">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{info.displayName}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{info.description}</p>
        </div>
      </div>

      {/* One-click install button */}
      <div className="space-y-2">
        {installStatus === 'success' ? (
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium">
            <CheckCircle2 size={16} />
            {t.envSetup.installSuccess}
          </div>
        ) : installStatus === 'error' ? (
          <div className="text-sm text-red-500 font-medium">
            {t.envSetup.installFailed}
          </div>
        ) : (
          <Button
            variant="default"
            size="sm"
            className="w-full gap-2 py-5 text-sm font-semibold rounded-xl shadow-lg shadow-primary/20 active:scale-[0.98] transition-all duration-200"
            disabled={installStatus === 'installing'}
            onClick={handleInstall}
          >
            {installStatus === 'installing' ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {t.envSetup.installing.replace('{name}', info.displayName)}
              </>
            ) : (
              <>
                <Download size={16} />
                {t.envSetup.installButton} {info.displayName}
              </>
            )}
          </Button>
        )}

        {/* Platform hint */}
        {platformHint && installStatus === 'idle' && (
          <p className="text-xs text-muted-foreground text-center">{platformHint}</p>
        )}
      </div>

      {/* Collapsible manual install section */}
      {guidance && (
        <div>
          <button
            onClick={() => setManualOpen((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {manualOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {t.envSetup.manualInstall}
          </button>

          {manualOpen && (
            <div className="mt-2 space-y-2">
              {guidance.type === "download" && (
                <div className="space-y-3">
                  <Button
                    size="sm"
                    onClick={() => openExternal(guidance.url)}
                    className="w-full gap-2 py-5 text-sm font-semibold rounded-xl shadow-lg shadow-primary/20 active:scale-[0.98] transition-all duration-200"
                  >
                    <Download size={16} />
                    {guidance.label}
                  </Button>
                  {guidance.steps && (
                    <div className="space-y-1.5">
                      <ol className="space-y-1">
                        {guidance.steps.map((step, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <span className="shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center mt-0.5">
                              {i + 1}
                            </span>
                            <span className="leading-relaxed">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}

              {guidance.type === "command" && (
                <div className="space-y-2">
                  <CopyableCommand command={guidance.primary} />
                  {guidance.alternative && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">{guidance.alternative.label}</p>
                      <CopyableCommand command={guidance.alternative.command} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
