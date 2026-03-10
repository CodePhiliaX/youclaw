import { useState, useEffect, useCallback } from 'react'
import { getAgents, getAgentDocs, updateAgentDoc, createAgent, deleteAgent } from '../api/client'
import { useNavigate } from 'react-router-dom'
import {
  Bot, FolderOpen, MessageSquare, Plus, Trash2,
  FileText, Save, Pencil, X, ChevronRight,
  Activity, Clock, AlertCircle, Layers,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useI18n } from '../i18n'

type AgentState = {
  sessionId: string | null
  isProcessing: boolean
  lastProcessedAt: string | null
  totalProcessed: number
  lastError: string | null
  queueDepth: number
}

type Agent = {
  id: string
  name: string
  model: string
  workspaceDir: string
  state: AgentState | null
}

// 文档文件列表和对应图标描述
const DOC_FILES = [
  { name: 'SOUL.md', label: 'Soul', desc: 'Personality & Style' },
  { name: 'AGENT.md', label: 'Agent', desc: 'Capabilities & Rules' },
  { name: 'USER.md', label: 'User', desc: 'User Info & Preferences' },
  { name: 'TOOLS.md', label: 'Tools', desc: 'Tool Notes & APIs' },
] as const

type ViewMode = 'detail' | 'create'

export function Agents() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [agents, setAgents] = useState<Agent[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('detail')

  // 文档相关状态
  const [docs, setDocs] = useState<Record<string, string>>({})
  const [editingDoc, setEditingDoc] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // 创建 Agent 表单
  const [newId, setNewId] = useState('')
  const [newName, setNewName] = useState('')
  const [newModel, setNewModel] = useState('claude-sonnet-4-6')
  const [isCreating, setIsCreating] = useState(false)

  // 展开的文档
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null)

  const loadAgents = useCallback(() => {
    getAgents().then((list) => setAgents(list as Agent[])).catch(() => {})
  }, [])

  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  // 加载选中 agent 的文档
  useEffect(() => {
    if (selected) {
      getAgentDocs(selected)
        .then(setDocs)
        .catch(() => setDocs({}))
      setEditingDoc(null)
      setExpandedDoc(null)
    }
  }, [selected])

  const selectedAgent = agents.find((a) => a.id === selected)

  // 保存文档
  const handleSaveDoc = async () => {
    if (!selected || !editingDoc) return
    setIsSaving(true)
    try {
      await updateAgentDoc(selected, editingDoc, editContent)
      setDocs((prev) => ({ ...prev, [editingDoc]: editContent }))
      setEditingDoc(null)
    } catch {
      // 静默处理
    } finally {
      setIsSaving(false)
    }
  }

  // 创建 Agent
  const handleCreate = async () => {
    if (!newId.trim() || !newName.trim()) return
    setIsCreating(true)
    try {
      await createAgent({ id: newId.trim(), name: newName.trim(), model: newModel })
      loadAgents()
      setSelected(newId.trim())
      setViewMode('detail')
      setNewId('')
      setNewName('')
      setNewModel('claude-sonnet-4-6')
    } catch {
      // 静默处理
    } finally {
      setIsCreating(false)
    }
  }

  // 删除 Agent
  const handleDelete = async (agentId: string) => {
    if (agentId === 'default') return
    if (!confirm(t.agents.confirmDelete)) return
    try {
      await deleteAgent(agentId)
      loadAgents()
      if (selected === agentId) {
        setSelected(null)
      }
    } catch {
      // 静默处理
    }
  }

  return (
    <div className="flex h-full">
      {/* 左侧：Agent 列表 */}
      <div className="w-[260px] border-r border-border flex flex-col">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-sm">{t.agents.title}</h2>
          <button
            onClick={() => {
              setViewMode('create')
              setSelected(null)
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            title={t.agents.createAgent}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => {
                setSelected(agent.id)
                setViewMode('detail')
              }}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2 text-sm rounded-md text-left transition-colors group',
                selected === agent.id && viewMode === 'detail'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50',
              )}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0',
                  agent.state?.isProcessing ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400',
                )}
              >
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{agent.name}</div>
                <div className="text-xs text-muted-foreground truncate">{agent.id}</div>
              </div>
              {agent.state && agent.state.queueDepth > 0 && (
                <span className="text-xs bg-primary/20 text-primary rounded-full px-1.5 py-0.5">
                  {agent.state.queueDepth}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 右侧 */}
      <div className="flex-1 overflow-y-auto">
        {viewMode === 'create' ? (
          <CreateAgentForm
            t={t}
            newId={newId}
            setNewId={setNewId}
            newName={newName}
            setNewName={setNewName}
            newModel={newModel}
            setNewModel={setNewModel}
            isCreating={isCreating}
            onCreate={handleCreate}
            onCancel={() => {
              setViewMode('detail')
              if (agents.length > 0 && !selected) {
                setSelected(agents[0]!.id)
              }
            }}
          />
        ) : selectedAgent ? (
          <AgentDetail
            t={t}
            agent={selectedAgent}
            docs={docs}
            editingDoc={editingDoc}
            editContent={editContent}
            isSaving={isSaving}
            expandedDoc={expandedDoc}
            onExpandDoc={(name) => setExpandedDoc(expandedDoc === name ? null : name)}
            onEditDoc={(name) => {
              setEditingDoc(name)
              setEditContent(docs[name] ?? '')
            }}
            onCancelEdit={() => setEditingDoc(null)}
            onSaveDoc={handleSaveDoc}
            setEditContent={setEditContent}
            onStartChat={() => navigate('/')}
            onDelete={() => handleDelete(selectedAgent.id)}
          />
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

// === 创建 Agent 表单 ===
function CreateAgentForm({
  t,
  newId,
  setNewId,
  newName,
  setNewName,
  newModel,
  setNewModel,
  isCreating,
  onCreate,
  onCancel,
}: {
  t: ReturnType<typeof useI18n>['t']
  newId: string
  setNewId: (v: string) => void
  newName: string
  setNewName: (v: string) => void
  newModel: string
  setNewModel: (v: string) => void
  isCreating: boolean
  onCreate: () => void
  onCancel: () => void
}) {
  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-lg font-semibold mb-6">{t.agents.createTitle}</h1>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">{t.agents.agentId}</label>
          <input
            value={newId}
            onChange={(e) => setNewId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder={t.agents.agentIdPlaceholder}
            className="w-full px-3 py-2 text-sm rounded-md bg-muted border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground mt-1">{t.agents.agentIdHint}</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">{t.agents.agentName}</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t.agents.agentNamePlaceholder}
            className="w-full px-3 py-2 text-sm rounded-md bg-muted border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">{t.agents.model}</label>
          <input
            value={newModel}
            onChange={(e) => setNewModel(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md bg-muted border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={onCreate}
            disabled={isCreating || !newId.trim() || !newName.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {isCreating ? t.agents.creating : t.common.create}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-md text-muted-foreground hover:bg-accent transition-colors"
          >
            {t.common.cancel}
          </button>
        </div>
      </div>
    </div>
  )
}

// === Agent 详情视图 ===
function AgentDetail({
  t,
  agent,
  docs,
  editingDoc,
  editContent,
  isSaving,
  expandedDoc,
  onExpandDoc,
  onEditDoc,
  onCancelEdit,
  onSaveDoc,
  setEditContent,
  onStartChat,
  onDelete,
}: {
  t: ReturnType<typeof useI18n>['t']
  agent: Agent
  docs: Record<string, string>
  editingDoc: string | null
  editContent: string
  isSaving: boolean
  expandedDoc: string | null
  onExpandDoc: (name: string) => void
  onEditDoc: (name: string) => void
  onCancelEdit: () => void
  onSaveDoc: () => void
  setEditContent: (v: string) => void
  onStartChat: () => void
  onDelete: () => void
}) {
  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{agent.name}</h1>
            <p className="text-sm text-muted-foreground">{agent.id} · {agent.model}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onStartChat}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <MessageSquare className="h-4 w-4" />
            {t.agents.startChat}
          </button>
          {agent.id !== 'default' && (
            <button
              onClick={onDelete}
              className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 状态卡片 */}
      {agent.state && (
        <div className="grid grid-cols-4 gap-3">
          <StatusCard
            icon={<Activity className="h-4 w-4" />}
            label={t.agents.status}
            value={agent.state.isProcessing ? 'Processing' : 'Idle'}
            color={agent.state.isProcessing ? 'yellow' : 'green'}
          />
          <StatusCard
            icon={<Layers className="h-4 w-4" />}
            label={t.agents.totalProcessed}
            value={String(agent.state.totalProcessed)}
          />
          <StatusCard
            icon={<Clock className="h-4 w-4" />}
            label={t.agents.lastProcessed}
            value={agent.state.lastProcessedAt ? new Date(agent.state.lastProcessedAt).toLocaleString() : t.agents.never}
          />
          <StatusCard
            icon={<AlertCircle className="h-4 w-4" />}
            label={t.agents.queueDepth}
            value={String(agent.state.queueDepth)}
          />
        </div>
      )}

      {/* 基本信息 */}
      <div className="grid gap-3">
        <InfoRow label={t.agents.workspace} value={
          <span className="flex items-center gap-1 text-xs font-mono">
            <FolderOpen className="h-3 w-3" />
            {agent.workspaceDir}
          </span>
        } />
        {agent.state?.lastError && (
          <InfoRow label={t.agents.lastError} value={
            <span className="text-destructive text-xs">{agent.state.lastError}</span>
          } />
        )}
      </div>

      {/* 文档区 */}
      <div>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4" />
          {t.agents.docs}
        </h2>
        <div className="space-y-2">
          {DOC_FILES.map((doc) => (
            <DocSection
              key={doc.name}
              t={t}
              docName={doc.name}
              docLabel={doc.label}
              docDesc={doc.desc}
              content={docs[doc.name] ?? ''}
              isExpanded={expandedDoc === doc.name}
              isEditing={editingDoc === doc.name}
              editContent={editContent}
              isSaving={isSaving}
              onToggle={() => onExpandDoc(doc.name)}
              onEdit={() => onEditDoc(doc.name)}
              onCancel={onCancelEdit}
              onSave={onSaveDoc}
              setEditContent={setEditContent}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// === 文档折叠编辑区 ===
function DocSection({
  t,
  docName,
  docLabel,
  docDesc,
  content,
  isExpanded,
  isEditing,
  editContent,
  isSaving,
  onToggle,
  onEdit,
  onCancel,
  onSave,
  setEditContent,
}: {
  t: ReturnType<typeof useI18n>['t']
  docName: string
  docLabel: string
  docDesc: string
  content: string
  isExpanded: boolean
  isEditing: boolean
  editContent: string
  isSaving: boolean
  onToggle: () => void
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
  setEditContent: (v: string) => void
}) {
  return (
    <div className="border border-border rounded-md overflow-hidden">
      {/* 标题栏 */}
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-accent/30 transition-colors"
      >
        <ChevronRight className={cn('h-3.5 w-3.5 transition-transform shrink-0', isExpanded && 'rotate-90')} />
        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-medium">{docLabel}</span>
        <span className="text-xs text-muted-foreground">({docName})</span>
        <span className="text-xs text-muted-foreground ml-auto">{docDesc}</span>
      </button>

      {/* 展开内容 */}
      {isExpanded && (
        <div className="border-t border-border">
          {/* 工具栏 */}
          <div className="flex items-center justify-end px-3 py-1.5 bg-muted/30 border-b border-border/50">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={onCancel}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded-md text-muted-foreground hover:bg-accent transition-colors"
                >
                  <X className="h-3 w-3" />
                  {t.common.cancel}
                </button>
                <button
                  onClick={onSave}
                  disabled={isSaving}
                  className="flex items-center gap-1 px-3 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <Save className="h-3 w-3" />
                  {isSaving ? t.agents.saving : t.common.save}
                </button>
              </div>
            ) : (
              <button
                onClick={onEdit}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded-md text-muted-foreground hover:bg-accent transition-colors"
              >
                <Pencil className="h-3 w-3" />
                {t.agents.editDoc}
              </button>
            )}
          </div>

          {/* 编辑/预览区 */}
          <div className="p-3">
            {isEditing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full min-h-[200px] bg-transparent text-sm font-mono resize-y focus:outline-none text-foreground placeholder:text-muted-foreground"
                placeholder={t.agents.noContent}
              />
            ) : (
              <pre className="text-sm whitespace-pre-wrap font-mono text-foreground/80 min-h-[60px]">
                {content.trim() || (
                  <span className="text-muted-foreground italic">{t.agents.noContent}</span>
                )}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// === 状态卡片 ===
function StatusCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color?: 'green' | 'yellow' | 'red'
}) {
  return (
    <div className="rounded-md border border-border p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        {icon}
        {label}
      </div>
      <div className={cn(
        'text-sm font-medium',
        color === 'green' && 'text-green-400',
        color === 'yellow' && 'text-yellow-400',
        color === 'red' && 'text-destructive',
      )}>
        {value}
      </div>
    </div>
  )
}

// === 信息行 ===
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  )
}
