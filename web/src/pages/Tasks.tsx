import { useState, useEffect, useCallback } from 'react'
import {
  getTaskList,
  createScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  runScheduledTask,
  getScheduledTaskLogs,
  getAgents,
} from '../api/client'
import type { ScheduledTaskDTO, TaskRunLogDTO } from '../api/client'
import { cn } from '../lib/utils'
import { useI18n } from '../i18n'
import {
  Clock,
  Plus,
  Play,
  Pause,
  Trash2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Timer,
  CalendarClock,
  X,
} from 'lucide-react'

type Agent = { id: string; name: string }

function formatRelative(iso: string | null): string {
  if (!iso) return '-'
  const date = new Date(iso)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const absDiff = Math.abs(diffMs)

  if (absDiff < 60_000) return diffMs > 0 ? 'in <1m' : '<1m ago'
  if (absDiff < 3_600_000) {
    const m = Math.round(absDiff / 60_000)
    return diffMs > 0 ? `in ${m}m` : `${m}m ago`
  }
  if (absDiff < 86_400_000) {
    const h = Math.round(absDiff / 3_600_000)
    return diffMs > 0 ? `in ${h}h` : `${h}h ago`
  }
  return date.toLocaleString()
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function scheduleLabel(type: string, value: string): string {
  if (type === 'cron') return `cron: ${value}`
  if (type === 'interval') {
    const ms = parseInt(value, 10)
    if (ms < 60_000) return `every ${ms / 1000}s`
    if (ms < 3_600_000) return `every ${ms / 60_000}m`
    return `every ${ms / 3_600_000}h`
  }
  if (type === 'once') return `once: ${new Date(value).toLocaleString()}`
  return value
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-500/20 text-green-400',
    paused: 'bg-yellow-500/20 text-yellow-400',
    completed: 'bg-zinc-500/20 text-zinc-400',
  }
  return (
    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', colors[status] ?? 'bg-zinc-500/20 text-zinc-400')}>
      {status}
    </span>
  )
}

export function Tasks() {
  const { t } = useI18n()
  const [tasks, setTasks] = useState<ScheduledTaskDTO[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [logs, setLogs] = useState<TaskRunLogDTO[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  const loadTasks = useCallback(() => {
    getTaskList().then(setTasks).catch(() => {})
  }, [])

  useEffect(() => {
    loadTasks()
    getAgents().then((list) => setAgents(list.map((a) => ({ id: a.id, name: a.name })))).catch(() => {})
  }, [loadTasks])

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    setLogsLoading(true)
    try {
      const data = await getScheduledTaskLogs(id)
      setLogs(data)
    } catch {
      setLogs([])
    } finally {
      setLogsLoading(false)
    }
  }

  const handleRun = async (id: string) => {
    await runScheduledTask(id).catch(() => {})
    loadTasks()
  }

  const handleTogglePause = async (task: ScheduledTaskDTO) => {
    const newStatus = task.status === 'active' ? 'paused' : 'active'
    await updateScheduledTask(task.id, { status: newStatus }).catch(() => {})
    loadTasks()
  }

  const handleDelete = async (id: string) => {
    await deleteScheduledTask(id).catch(() => {})
    loadTasks()
  }

  const agentName = (agentId: string) => {
    const a = agents.find((x) => x.id === agentId)
    return a?.name ?? agentId
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t.tasks.title}</h1>
          <span className="text-xs text-muted-foreground ml-1">({tasks.length})</span>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t.tasks.createTask}
        </button>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>{t.tasks.noTasks}</p>
              <p className="text-xs mt-1">{t.tasks.noTasksHint}</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tasks.map((task) => (
              <div key={task.id}>
                {/* Task Row */}
                <div
                  className="flex items-center gap-4 px-4 py-3 hover:bg-accent/30 cursor-pointer transition-colors"
                  onClick={() => toggleExpand(task.id)}
                >
                  <div className="text-muted-foreground">
                    {expandedId === task.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{task.prompt.length > 60 ? task.prompt.slice(0, 60) + '...' : task.prompt}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>{agentName(task.agent_id)}</span>
                      <span className="flex items-center gap-1">
                        <Timer className="h-3 w-3" />
                        {scheduleLabel(task.schedule_type, task.schedule_value)}
                      </span>
                      <span>Next: {formatRelative(task.next_run)}</span>
                    </div>
                  </div>
                  <StatusBadge status={task.status} />
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleRun(task.id)}
                      className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                      title={t.tasks.runNow}
                    >
                      <Play className="h-4 w-4" />
                    </button>
                    {task.status !== 'completed' && (
                      <button
                        onClick={() => handleTogglePause(task)}
                        className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                        title={task.status === 'active' ? t.tasks.pause : t.tasks.resume}
                      >
                        <Pause className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(task.id)}
                      className="p-1.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-red-400 transition-colors"
                      title={t.common.delete}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Detail */}
                {expandedId === task.id && (
                  <div className="px-4 pb-4 pt-1 bg-accent/10">
                    <div className="ml-8 space-y-3">
                      {/* Prompt */}
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">{t.tasks.prompt}</div>
                        <div className="text-sm bg-background rounded p-2 border border-border whitespace-pre-wrap">{task.prompt}</div>
                      </div>

                      {/* Meta Info */}
                      <div className="grid grid-cols-3 gap-4 text-xs">
                        <div>
                          <span className="text-muted-foreground">{t.tasks.taskId}: </span>
                          <span className="font-mono">{task.id.slice(0, 8)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t.tasks.created}: </span>
                          <span>{new Date(task.created_at).toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t.tasks.lastRun}: </span>
                          <span>{task.last_run ? new Date(task.last_run).toLocaleString() : '-'}</span>
                        </div>
                      </div>

                      {/* Run Logs */}
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">{t.tasks.recentRuns}</div>
                        {logsLoading ? (
                          <div className="text-xs text-muted-foreground">{t.common.loading}</div>
                        ) : logs.length === 0 ? (
                          <div className="text-xs text-muted-foreground">{t.tasks.noRuns}</div>
                        ) : (
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {logs.slice(0, 20).map((log) => (
                              <div
                                key={log.id}
                                className="flex items-center gap-3 text-xs py-1.5 px-2 rounded bg-background border border-border"
                              >
                                {log.status === 'success' ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
                                ) : (
                                  <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
                                )}
                                <span className="text-muted-foreground">{new Date(log.run_at).toLocaleString()}</span>
                                <span className="text-muted-foreground">{formatDuration(log.duration_ms)}</span>
                                {log.error && <span className="text-red-400 truncate flex-1">{log.error}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <CreateTaskModal
          agents={agents}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            loadTasks()
          }}
        />
      )}
    </div>
  )
}

function CreateTaskModal({
  agents,
  onClose,
  onCreated,
}: {
  agents: Agent[]
  onClose: () => void
  onCreated: () => void
}) {
  const { t } = useI18n()
  const [agentId, setAgentId] = useState(agents[0]?.id ?? '')
  const [prompt, setPrompt] = useState('')
  const [scheduleType, setScheduleType] = useState<'cron' | 'interval' | 'once'>('interval')
  const [scheduleValue, setScheduleValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agentId || !prompt || !scheduleValue) {
      setError(t.tasks.allRequired)
      return
    }

    setSubmitting(true)
    setError('')

    try {
      let finalValue = scheduleValue
      // interval: 将分钟转为毫秒
      if (scheduleType === 'interval') {
        const mins = parseFloat(scheduleValue)
        if (isNaN(mins) || mins <= 0) {
          setError(t.tasks.invalidInterval)
          setSubmitting(false)
          return
        }
        finalValue = String(Math.round(mins * 60_000))
      }
      // once: 确保是 ISO 格式
      if (scheduleType === 'once') {
        const d = new Date(scheduleValue)
        if (isNaN(d.getTime())) {
          setError(t.tasks.invalidDate)
          setSubmitting(false)
          return
        }
        finalValue = d.toISOString()
      }

      const chatId = `task:${crypto.randomUUID().slice(0, 8)}`
      await createScheduledTask({
        agentId,
        chatId,
        prompt,
        scheduleType,
        scheduleValue: finalValue,
      })
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-background border border-border rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-semibold text-sm">{t.tasks.createTitle}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Agent */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">{t.tasks.agent}</label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md bg-accent/30 border border-border focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.id})
                </option>
              ))}
            </select>
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">{t.tasks.prompt}</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder={t.tasks.promptPlaceholder}
              className="w-full px-3 py-2 text-sm rounded-md bg-accent/30 border border-border focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          {/* Schedule Type */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">{t.tasks.scheduleType}</label>
            <div className="flex gap-2">
              {(['interval', 'cron', 'once'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    setScheduleType(st)
                    setScheduleValue('')
                  }}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded-md border transition-colors',
                    scheduleType === st
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-accent/30 border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {st === 'interval' ? t.tasks.interval : st === 'cron' ? t.tasks.cron : t.tasks.once}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule Value */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              {scheduleType === 'interval' && t.tasks.intervalMinutes}
              {scheduleType === 'cron' && t.tasks.cronExpression}
              {scheduleType === 'once' && t.tasks.runAt}
            </label>
            <input
              type={scheduleType === 'once' ? 'datetime-local' : 'text'}
              value={scheduleValue}
              onChange={(e) => setScheduleValue(e.target.value)}
              placeholder={
                scheduleType === 'interval'
                  ? t.tasks.intervalPlaceholder
                  : scheduleType === 'cron'
                    ? t.tasks.cronPlaceholder
                    : ''
              }
              className="w-full px-3 py-2 text-sm rounded-md bg-accent/30 border border-border focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {scheduleType === 'cron' && (
              <p className="text-xs text-muted-foreground mt-1">{t.tasks.cronHelp}</p>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md border border-border text-muted-foreground hover:bg-accent transition-colors"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {submitting ? t.tasks.creating : t.common.create}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
