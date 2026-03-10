import { useState, useEffect, useCallback } from 'react'
import { getAgents, getMemory, updateMemory, getMemoryLogs, getMemoryLog } from '../api/client'
import { Brain, Save, Pencil, X, ChevronRight, Calendar, FileText } from 'lucide-react'
import { cn } from '../lib/utils'
import { useI18n } from '../i18n'

type Agent = {
  id: string
  name: string
}

export function Memory() {
  const { t } = useI18n()
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [memoryContent, setMemoryContent] = useState('')
  const [editContent, setEditContent] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [logDates, setLogDates] = useState<string[]>([])
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const [logContent, setLogContent] = useState<Record<string, string>>({})

  // 加载 agents 列表
  useEffect(() => {
    getAgents()
      .then((list) => {
        setAgents(list)
        if (list.length > 0 && !selectedAgentId) {
          setSelectedAgentId(list[0]!.id)
        }
      })
      .catch(() => {})
  }, [])

  // 当选择 agent 变化时，加载记忆和日志
  const loadMemoryData = useCallback((agentId: string) => {
    if (!agentId) return

    getMemory(agentId)
      .then((res) => {
        setMemoryContent(res.content)
        setEditContent(res.content)
      })
      .catch(() => {
        setMemoryContent('')
        setEditContent('')
      })

    getMemoryLogs(agentId)
      .then(setLogDates)
      .catch(() => setLogDates([]))

    setExpandedDate(null)
    setLogContent({})
    setIsEditing(false)
  }, [])

  useEffect(() => {
    if (selectedAgentId) {
      loadMemoryData(selectedAgentId)
    }
  }, [selectedAgentId, loadMemoryData])

  // 保存 MEMORY.md
  const handleSave = async () => {
    if (!selectedAgentId) return
    setIsSaving(true)
    try {
      await updateMemory(selectedAgentId, editContent)
      setMemoryContent(editContent)
      setIsEditing(false)
    } catch {
      // 静默处理
    } finally {
      setIsSaving(false)
    }
  }

  // 展开/收起日志
  const toggleDate = async (date: string) => {
    if (expandedDate === date) {
      setExpandedDate(null)
      return
    }

    setExpandedDate(date)

    if (!logContent[date] && selectedAgentId) {
      try {
        const res = await getMemoryLog(selectedAgentId, date)
        setLogContent((prev) => ({ ...prev, [date]: res.content }))
      } catch {
        setLogContent((prev) => ({ ...prev, [date]: t.memory.loadFailed }))
      }
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部：Agent 选择器 */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <Brain className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-sm font-semibold">{t.memory.title}</h1>
        <select
          value={selectedAgentId}
          onChange={(e) => setSelectedAgentId(e.target.value)}
          className="ml-4 px-3 py-1.5 text-sm rounded-md bg-muted border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name} ({agent.id})
            </option>
          ))}
        </select>
      </div>

      {/* 主内容：左右分栏 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左栏：MEMORY.md */}
        <div className="flex-1 flex flex-col border-r border-border min-w-0">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t.memory.memoryFile}</span>
            </div>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <button
                    onClick={() => {
                      setEditContent(memoryContent)
                      setIsEditing(false)
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded-md text-muted-foreground hover:bg-accent transition-colors"
                  >
                    <X className="h-3 w-3" />
                    {t.common.cancel}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-1 px-3 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    <Save className="h-3 w-3" />
                    {isSaving ? t.memory.saving : t.common.save}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setEditContent(memoryContent)
                    setIsEditing(true)
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded-md text-muted-foreground hover:bg-accent transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                  {t.common.edit}
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {isEditing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-full bg-transparent text-sm font-mono resize-none focus:outline-none text-foreground placeholder:text-muted-foreground"
                placeholder={t.memory.writePlaceholder}
              />
            ) : (
              <div className="text-sm whitespace-pre-wrap font-mono text-foreground/80">
                {memoryContent || (
                  <span className="text-muted-foreground italic">
                    {t.memory.noContent}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 右栏：每日日志 */}
        <div className="w-[380px] flex flex-col min-w-0">
          <div className="flex items-center gap-2 p-3 border-b border-border">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t.memory.dailyLogs}</span>
            <span className="text-xs text-muted-foreground">({logDates.length})</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {logDates.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <Calendar className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">{t.memory.noLogs}</p>
                </div>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {logDates.map((date) => (
                  <div key={date}>
                    <button
                      onClick={() => toggleDate(date)}
                      className={cn(
                        'flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md text-left transition-colors',
                        expandedDate === date
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent/50',
                      )}
                    >
                      <ChevronRight
                        className={cn(
                          'h-3 w-3 transition-transform',
                          expandedDate === date && 'rotate-90',
                        )}
                      />
                      <Calendar className="h-3.5 w-3.5" />
                      <span className="font-mono">{date}</span>
                    </button>

                    {expandedDate === date && (
                      <div className="mt-1 mx-2 p-3 rounded-md bg-muted/50 border border-border/50">
                        <pre className="text-xs whitespace-pre-wrap font-mono text-foreground/70 overflow-x-auto">
                          {logContent[date] ?? t.common.loading}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
