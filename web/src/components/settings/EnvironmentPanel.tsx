import { useState, useEffect } from 'react'
import { useI18n } from '@/i18n'
import { useAppStore } from '@/stores/app'
import { checkEnv, installTool, type DependencyStatus } from '@/api/client'
import { CheckCircle2, XCircle, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function EnvironmentPanel() {
  const { t } = useI18n()
  const showGlobalBubble = useAppStore((s) => s.showGlobalBubble)
  const [dependencies, setDependencies] = useState<DependencyStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [installingTool, setInstallingTool] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    try {
      const result = await checkEnv()
      setDependencies(result.dependencies)
    } catch { /* ignore */ }
    setLoading(false)
  }

  const handleInstall = async (tool: string) => {
    setInstallingTool(tool)
    try {
      const result = await installTool(tool)
      if (result.ok) {
        showGlobalBubble({ message: `${tool} ${t.envSetup.installSuccess}`, type: 'success' })
      } else {
        showGlobalBubble({ message: result.stderr || t.envSetup.installFailed, type: 'error', durationMs: 6000 })
      }
    } catch (err: any) {
      showGlobalBubble({ message: err.message || t.envSetup.installFailed, type: 'error', durationMs: 6000 })
    }
    setInstallingTool(null)
    await refresh()
  }

  useEffect(() => { refresh() }, [])

  return (
    <div className="space-y-6">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{t.envPanel.title}</h3>
          <p className="text-sm text-muted-foreground">{t.envPanel.description}</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          <span className="ml-1.5">{t.envPanel.refresh}</span>
        </Button>
      </div>

      {/* Dependencies list */}
      <div className="space-y-3">
        {dependencies.map((dep) => (
          <div key={dep.name} className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-card">
            <div className="flex items-center gap-3">
              {dep.available ? (
                <CheckCircle2 size={18} className="text-green-500 shrink-0" />
              ) : (
                <XCircle size={18} className="text-red-400 shrink-0" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{dep.name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-md ${dep.required ? 'bg-red-500/10 text-red-400' : 'bg-muted text-muted-foreground'}`}>
                    {dep.required ? t.envPanel.required : t.envPanel.optional}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-md ${dep.available ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                    {dep.available ? t.envPanel.installed : t.envPanel.notInstalled}
                  </span>
                </div>
                {dep.available && dep.version && (
                  <p className="text-xs text-muted-foreground mt-0.5">{dep.version}</p>
                )}
                {dep.available && dep.path && (
                  <p className="text-xs text-muted-foreground font-mono truncate max-w-[300px]">{dep.path}</p>
                )}
              </div>
            </div>
            {!dep.available && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleInstall(dep.name)}
                disabled={installingTool === dep.name}
              >
                {installingTool === dep.name ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  t.envSetup.installButton
                )}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
