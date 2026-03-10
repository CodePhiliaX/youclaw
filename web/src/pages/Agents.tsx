import { useState, useEffect } from 'react'
import { getAgents } from '../api/client'
import { useNavigate } from 'react-router-dom'
import { Bot, FolderOpen, MessageSquare } from 'lucide-react'
import { cn } from '../lib/utils'
import { useI18n } from '../i18n'

type Agent = {
  id: string
  name: string
  workspaceDir: string
  status: string
  hasConfig: boolean
}

export function Agents() {
  const { t } = useI18n()
  const [agents, setAgents] = useState<Agent[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    getAgents().then(setAgents).catch(() => {})
  }, [])

  const selectedAgent = agents.find(a => a.id === selected)

  return (
    <div className="flex h-full">
      {/* 左侧：Agent 列表 */}
      <div className="w-[260px] border-r border-border flex flex-col">
        <div className="p-3 border-b border-border">
          <h2 className="font-semibold text-sm">{t.agents.title}</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {agents.map(agent => (
            <button
              key={agent.id}
              onClick={() => setSelected(agent.id)}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md text-left transition-colors',
                selected === agent.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'
              )}
            >
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium',
                agent.status === 'idle' ? 'bg-green-500/20 text-green-400' : 'bg-muted'
              )}>
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{agent.name}</div>
                <div className="text-xs text-muted-foreground">{agent.id}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 右侧：Agent 详情 */}
      <div className="flex-1 p-6">
        {selectedAgent ? (
          <div className="max-w-2xl space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">{selectedAgent.name}</h1>
                <p className="text-sm text-muted-foreground">{t.agents.id}: {selectedAgent.id}</p>
              </div>
            </div>

            <div className="grid gap-4">
              <InfoRow label={t.agents.status} value={
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  {selectedAgent.status}
                </span>
              } />
              <InfoRow label={t.agents.workspace} value={
                <span className="flex items-center gap-1">
                  <FolderOpen className="h-3 w-3" />
                  {selectedAgent.workspaceDir}
                </span>
              } />
              <InfoRow label={t.agents.config} value={selectedAgent.hasConfig ? t.agents.configFound : t.agents.noConfig} />
            </div>

            <div className="flex gap-2 pt-4">
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <MessageSquare className="h-4 w-4" />
                {t.agents.startChat}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Bot className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>{t.agents.selectAgent}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  )
}
