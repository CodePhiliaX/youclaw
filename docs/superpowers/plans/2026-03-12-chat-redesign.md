# Chat 页面重设计 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Chat page and global navigation to match Claude.ai style — collapsible sidebar with nav+chat list, refactored Chat page with ToolUse visualization, PromptInput adoption.

**Architecture:** Replace Topbar+Sidebar with a single AppSidebar (52px collapsed / 260px expanded). Extract chat state into ChatContext at Shell level. Decompose Chat.tsx god component into focused sub-components. Add ToolUseBlock for tool_use event visualization.

**Tech Stack:** React 19, React Router 7, Tailwind CSS 4, shadcn/ui (Radix), Streamdown, lucide-react, use-stick-to-bottom

**Spec:** `docs/superpowers/specs/2026-03-12-chat-redesign-design.md`

---

## File Structure

```
web/src/
├── hooks/
│   ├── useSidebar.tsx          (NEW) Sidebar collapse state + localStorage
│   ├── useChatContext.tsx      (NEW) ChatContext provider + hook
│   ├── useChat.ts             (MODIFY) Add toolUse, stop(), chatStatus
│   └── useSSE.ts              (MODIFY) Add input to SSEEvent type
├── lib/
│   └── chat-utils.ts          (NEW) groupChatsByDate, ChatItem type
├── components/
│   ├── layout/
│   │   ├── AppSidebar.tsx     (NEW) Collapsible sidebar
│   │   ├── Shell.tsx          (MODIFY) Remove Topbar, add ChatProvider
│   │   ├── Sidebar.tsx        (DELETE after AppSidebar works)
│   │   └── Topbar.tsx         (DELETE after AppSidebar works)
│   └── chat/
│       ├── ChatWelcome.tsx    (NEW) Welcome page for new chat
│       ├── ChatMessages.tsx   (NEW) Message list container
│       ├── UserMessage.tsx    (NEW) User message bubble
│       ├── AssistantMessage.tsx (NEW) AI message with actions
│       ├── ToolUseBlock.tsx   (NEW) Collapsible tool_use display
│       └── ChatInput.tsx      (NEW) PromptInput-based input area
├── pages/
│   └── Chat.tsx               (MODIFY) Slim down, consume ChatContext
└── i18n/
    ├── en.ts                  (MODIFY) Add sidebar + chat keys
    └── zh.ts                  (MODIFY) Add sidebar + chat keys
```

---

## Chunk 1: Foundation (Hooks, Utils, i18n)

### Task 1: Add i18n keys

**Files:**
- Modify: `web/src/i18n/en.ts`
- Modify: `web/src/i18n/zh.ts`

- [ ] **Step 1: Add sidebar and new chat keys to en.ts**

Add after the `topbar` section:
```typescript
sidebar: {
  collapse: 'Collapse sidebar',
  expand: 'Expand sidebar',
  newChat: 'New chat',
  search: 'Search chats...',
  more: 'More',
},
```

Add to the `chat` section (note: `toolUsing` **replaces** the existing key of the same name — the existing `toolUsing: 'Using tool: {tool}'` must be changed to the new format below):
```typescript
welcome: 'What can I help you with?',
toolUsing: 'Using {tool}...',   // REPLACE existing toolUsing key
toolUsed: 'Used {count} tools',
regenerate: 'Regenerate',
```

- [ ] **Step 2: Add matching keys to zh.ts**

```typescript
sidebar: {
  collapse: '收起侧栏',
  expand: '展开侧栏',
  newChat: '新建对话',
  search: '搜索对话...',
  more: '更多',
},
```

```typescript
welcome: '有什么可以帮你的？',
toolUsing: '正在使用 {tool}...',   // REPLACE existing toolUsing key
toolUsed: '使用了 {count} 个工具',
regenerate: '重新生成',
```

- [ ] **Step 3: Verify typecheck passes**

Run: `cd web && npx tsc --noEmit`
Expected: No errors (zh.ts must structurally match en.ts via `Translations` type)

- [ ] **Step 4: Commit**

```bash
git add web/src/i18n/en.ts web/src/i18n/zh.ts
git commit -m "feat(i18n): add sidebar and chat redesign translation keys"
```

---

### Task 2: Create useSidebar hook

**Files:**
- Create: `web/src/hooks/useSidebar.tsx`

- [ ] **Step 1: Create useSidebar hook**

```typescript
import { useState, useCallback, useEffect, createContext, useContext, type ReactNode } from 'react'

const STORAGE_KEY = 'youclaw-sidebar-collapsed'

interface SidebarContextType {
  isCollapsed: boolean
  toggle: () => void
  collapse: () => void
  expand: () => void
}

const SidebarContext = createContext<SidebarContextType | null>(null)

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider')
  return ctx
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(isCollapsed)) } catch {}
  }, [isCollapsed])

  // 键盘快捷键 Cmd/Ctrl+Shift+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 's') {
        e.preventDefault()
        setIsCollapsed(prev => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const toggle = useCallback(() => setIsCollapsed(prev => !prev), [])
  const collapse = useCallback(() => setIsCollapsed(true), [])
  const expand = useCallback(() => setIsCollapsed(false), [])

  return (
    <SidebarContext.Provider value={{ isCollapsed, toggle, collapse, expand }}>
      {children}
    </SidebarContext.Provider>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd web && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add web/src/hooks/useSidebar.tsx
git commit -m "feat: add useSidebar hook with localStorage persistence and keyboard shortcut"
```

---

### Task 3: Create chat-utils.ts

**Files:**
- Create: `web/src/lib/chat-utils.ts`

- [ ] **Step 1: Extract groupChatsByDate and types**

```typescript
export type ChatItem = {
  chat_id: string
  name: string
  agent_id: string
  channel: string
  last_message_time: string
}

// 按日期分组对话
export function groupChatsByDate(
  chats: ChatItem[],
  labels: { today: string; yesterday: string; older: string }
): { label: string; items: ChatItem[] }[] {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86_400_000

  const today: ChatItem[] = []
  const yesterday: ChatItem[] = []
  const older: ChatItem[] = []

  for (const chat of chats) {
    const time = new Date(chat.last_message_time).getTime()
    if (time >= todayStart) today.push(chat)
    else if (time >= yesterdayStart) yesterday.push(chat)
    else older.push(chat)
  }

  const groups: { label: string; items: ChatItem[] }[] = []
  if (today.length) groups.push({ label: labels.today, items: today })
  if (yesterday.length) groups.push({ label: labels.yesterday, items: yesterday })
  if (older.length) groups.push({ label: labels.older, items: older })
  return groups
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/lib/chat-utils.ts
git commit -m "feat: extract groupChatsByDate and ChatItem type to shared utils"
```

---

### Task 4: Update useSSE type and add Electron stop support

**Files:**
- Modify: `web/src/hooks/useSSE.ts`

- [ ] **Step 1: Add `input` field to SSEEvent type**

In `web/src/hooks/useSSE.ts`, add `input?: string` to the `SSEEvent` type after `tool?: string`:

```typescript
type SSEEvent = {
  type: string
  agentId: string
  chatId: string
  text?: string
  fullText?: string
  error?: string
  isProcessing?: boolean
  tool?: string
  input?: string  // tool_use 的输入参数（已序列化字符串）
}
```

- [ ] **Step 2: Add Electron-aware close support**

Refactor the hook to expose a `close()` that works in both Web and Electron mode. Store the Electron cleanup refs so `close()` can call them:

Replace the existing hook implementation — keep the same public API `useSSE(chatId, onEvent)` returning `{ close }`, but internally track the Electron `subId` and `removeListener` in refs so the returned `close()` can clean them up (not just the EventSource).

Key change in the Electron branch:
```typescript
// 在 Electron 分支中，将 subId 和 removeListener 存到 ref
subIdRef.current = result.subId
removeListenerRef.current = removeListener
```

And update `close`:
```typescript
const close = useCallback(() => {
  // Web: 关闭 EventSource
  eventSourceRef.current?.close()
  eventSourceRef.current = null
  // Electron: 取消订阅
  if (subIdRef.current) {
    getElectronAPI().unsubscribeEvents(subIdRef.current)
    subIdRef.current = null
  }
  removeListenerRef.current?.()
  removeListenerRef.current = null
}, [])
```

- [ ] **Step 3: Verify typecheck**

Run: `cd web && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add web/src/hooks/useSSE.ts
git commit -m "feat(useSSE): add input field to SSEEvent type and Electron-aware close"
```

---

### Task 5: Update useChat hook — add toolUse, stop(), chatStatus

**Files:**
- Modify: `web/src/hooks/useChat.ts`

- [ ] **Step 1: Extend Message type and add ToolUseItem**

At the top of `web/src/hooks/useChat.ts`:

```typescript
export type ToolUseItem = {
  id: string
  name: string
  input?: string
  status: 'running' | 'done'
}

export type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  toolUse?: ToolUseItem[]
}
```

- [ ] **Step 2: Add pendingToolUse state and tool_use event handling**

Add new state:
```typescript
const [pendingToolUse, setPendingToolUse] = useState<ToolUseItem[]>([])
const [chatStatus, setChatStatus] = useState<'submitted' | 'streaming' | 'ready' | 'error'>('ready')
```

Capture the `close` from useSSE:
```typescript
const { close: closeSSE } = useSSE(chatId, (event) => { ... })
```

In the `useSSE` callback, add a `tool_use` case:
```typescript
case 'tool_use':
  setPendingToolUse(prev => {
    // 将前一个 running 的改为 done
    const updated = prev.map(t => t.status === 'running' ? { ...t, status: 'done' as const } : t)
    return [...updated, {
      id: Date.now().toString(),
      name: event.tool ?? 'unknown',
      input: event.input,
      status: 'running',
    }]
  })
  break
```

In the `complete` case, merge toolUse into the message:
```typescript
case 'complete': {
  const finalToolUse = pendingToolUseRef.current.map(t => ({ ...t, status: 'done' as const }))
  setMessages(prev => [...prev, {
    id: Date.now().toString(),
    role: 'assistant',
    content: event.fullText ?? '',
    timestamp: new Date().toISOString(),
    toolUse: finalToolUse.length > 0 ? finalToolUse : undefined,
  }])
  setStreamingText('')
  setPendingToolUse([])
  break
}
```

Use a ref for pendingToolUse to avoid stale closure in SSE callback:
```typescript
const pendingToolUseRef = useRef<ToolUseItem[]>([])
useEffect(() => { pendingToolUseRef.current = pendingToolUse }, [pendingToolUse])
```

- [ ] **Step 3: Add chatStatus derivation and stop()**

```typescript
// chatStatus 派生
useEffect(() => {
  if (isProcessing && !streamingText) setChatStatus('submitted')
  else if (isProcessing && streamingText) setChatStatus('streaming')
  else setChatStatus('ready')
}, [isProcessing, streamingText])

// error 事件中设置短暂 error 状态
// 在 error case 中添加:
setChatStatus('error')
setTimeout(() => setChatStatus('ready'), 2000)
```

Add `stop` callback:
```typescript
const stop = useCallback(() => {
  closeSSE()
  setIsProcessing(false)
  setStreamingText('')
  setPendingToolUse([])
}, [closeSSE])
```

Update return:
```typescript
return { chatId, messages, streamingText, isProcessing, pendingToolUse, chatStatus, send, loadChat, newChat, stop }
```

- [ ] **Step 4: Verify typecheck**

Run: `cd web && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add web/src/hooks/useChat.ts
git commit -m "feat(useChat): add toolUse tracking, stop(), chatStatus derivation"
```

---

### Task 6: Create ChatContext provider

**Files:**
- Create: `web/src/hooks/useChatContext.tsx`

- [ ] **Step 1: Create ChatContext**

```typescript
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { useChat, type Message, type ToolUseItem } from './useChat'
import { getChats, getAgents, deleteChat as deleteChatApi } from '../api/client'
import type { ChatItem } from '../lib/chat-utils'

type Agent = { id: string; name: string }

interface ChatContextType {
  // useChat 暴露的所有状态
  chatId: string | null
  messages: Message[]
  streamingText: string
  isProcessing: boolean
  pendingToolUse: ToolUseItem[]
  chatStatus: 'submitted' | 'streaming' | 'ready' | 'error'
  send: (prompt: string) => Promise<void>
  loadChat: (chatId: string) => Promise<void>
  newChat: () => void
  stop: () => void

  // 会话列表
  chatList: ChatItem[]
  refreshChats: () => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  deleteChat: (chatId: string) => Promise<void>

  // Agent 选择
  agentId: string
  setAgentId: (id: string) => void
  agents: Agent[]
}

const ChatContext = createContext<ChatContextType | null>(null)

export function useChatContext() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChatContext must be used within ChatProvider')
  return ctx
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [agentId, setAgentId] = useState('default')
  const [agents, setAgents] = useState<Agent[]>([])
  const [chatList, setChatList] = useState<ChatItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const chat = useChat(agentId)

  // 加载 agents
  useEffect(() => {
    getAgents()
      .then(list => setAgents(list.map(a => ({ id: a.id, name: a.name }))))
      .catch(() => {})
  }, [])

  // 加载聊天列表
  const refreshChats = useCallback(() => {
    getChats().then(setChatList).catch(() => {})
  }, [])

  useEffect(() => { refreshChats() }, [chat.chatId, refreshChats])

  const deleteChat = useCallback(async (chatIdToDelete: string) => {
    await deleteChatApi(chatIdToDelete)
    if (chat.chatId === chatIdToDelete) chat.newChat()
    refreshChats()
  }, [chat, refreshChats])

  return (
    <ChatContext.Provider value={{
      ...chat,
      chatList,
      refreshChats,
      searchQuery,
      setSearchQuery,
      deleteChat,
      agentId,
      setAgentId,
      agents,
    }}>
      {children}
    </ChatContext.Provider>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd web && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add web/src/hooks/useChatContext.tsx
git commit -m "feat: add ChatContext provider for shared chat state"
```

---

## Chunk 2: AppSidebar + Shell

### Task 7: Install AlertDialog shadcn component

**Files:**
- Create: `web/src/components/ui/alert-dialog.tsx`

- [ ] **Step 1: Add AlertDialog component**

Run: `cd web && npx shadcn@latest add alert-dialog`

If the CLI doesn't work, manually create the component from shadcn/ui source.

- [ ] **Step 2: Commit**

```bash
git add web/src/components/ui/alert-dialog.tsx
git commit -m "feat(ui): add AlertDialog component from shadcn/ui"
```

---

### Task 8: Create AppSidebar component

**Files:**
- Create: `web/src/components/layout/AppSidebar.tsx`

This is the largest new component. Split into 3 sub-steps for manageability.

- [ ] **Step 1: Create AppSidebar — navigation and structure**

Create `web/src/components/layout/AppSidebar.tsx` with the complete implementation:

```tsx
import { useState, useEffect } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  MessageSquare, Bot, CalendarClock, Brain, Puzzle,
  Globe, ScrollText, Settings, PanelLeftClose, PanelLeft,
  SquarePen, Search, MoreHorizontal, Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/i18n'
import { useSidebar } from '@/hooks/useSidebar'
import { useChatContext } from '@/hooks/useChatContext'
import { groupChatsByDate } from '@/lib/chat-utils'
import { isElectron, getElectronAPI } from '@/api/transport'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'

interface AppSidebarProps {
  onOpenSettings: () => void
}

export function AppSidebar({ onOpenSettings }: AppSidebarProps) {
  const { isCollapsed, toggle } = useSidebar()
  const { t, locale, setLocale } = useI18n()
  const location = useLocation()
  const navigate = useNavigate()
  const chatCtx = useChatContext()
  const isChatRoute = location.pathname === '/'
  const [platform, setPlatform] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    if (isElectron) setPlatform(getElectronAPI().getPlatform())
  }, [])

  const isMac = platform === 'darwin'

  const navItems = [
    { to: '/', icon: MessageSquare, label: t.nav.chat },
    { to: '/agents', icon: Bot, label: t.nav.agents },
    { to: '/cron', icon: CalendarClock, label: t.nav.tasks },
    { to: '/memory', icon: Brain, label: t.nav.memory },
    { to: '/skills', icon: Puzzle, label: t.nav.skills },
  ]

  const moreItems = [
    { to: '/browser', icon: Globe, label: t.nav.browser },
    { to: '/logs', icon: ScrollText, label: t.nav.logs },
    { to: '/system', icon: Settings, label: t.nav.system },
  ]

  const handleChatClick = (chatId: string) => {
    if (!isChatRoute) navigate('/')
    chatCtx.loadChat(chatId)
  }

  const handleNewChat = () => {
    if (!isChatRoute) navigate('/')
    chatCtx.newChat()
  }

  const handleDeleteConfirm = async () => {
    if (deleteTarget) {
      await chatCtx.deleteChat(deleteTarget)
      setDeleteTarget(null)
    }
  }

  const filteredChats = chatCtx.searchQuery
    ? chatCtx.chatList.filter(c => c.name.toLowerCase().includes(chatCtx.searchQuery.toLowerCase()))
    : chatCtx.chatList

  const chatGroups = groupChatsByDate(filteredChats, {
    today: t.chat.today,
    yesterday: t.chat.yesterday,
    older: t.chat.older,
  })

  // ── 收起状态 ────────────────────────────
  if (isCollapsed) {
    return (
      <aside
        className="w-[52px] shrink-0 flex flex-col items-center border-r border-border bg-muted/30 transition-all duration-200 ease-in-out"
        aria-expanded={false}
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* macOS 交通灯空间 */}
        {isMac && <div className="h-7 shrink-0" />}

        {/* 顶部操作区 */}
        <div className="flex flex-col items-center gap-1.5 pt-2 pb-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            type="button"
            onClick={toggle}
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-accent transition-colors"
            aria-label={t.sidebar.expand}
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleNewChat}
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-accent transition-colors"
            aria-label={t.sidebar.newChat}
          >
            <SquarePen className="h-4 w-4" />
          </button>
          <Popover open={searchOpen} onOpenChange={setSearchOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-accent transition-colors"
                aria-label={t.sidebar.search}
              >
                <Search className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="right" className="w-64 p-2">
              <input
                type="text"
                className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={t.sidebar.search}
                value={chatCtx.searchQuery}
                onChange={e => chatCtx.setSearchQuery(e.target.value)}
                autoFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* 分隔线 */}
        <div className="w-6 h-px bg-border mb-3" />

        {/* 页面导航 */}
        <nav className="flex flex-col items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
                'w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
                isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
              aria-label={item.label}
            >
              <item.icon className="h-4 w-4" />
            </NavLink>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label={t.sidebar.more}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right">
              {moreItems.map(item => (
                <DropdownMenuItem key={item.to} asChild>
                  <NavLink to={item.to} className="flex items-center gap-2">
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        {/* 弹性空间 */}
        <div className="flex-1" />

        {/* 底部 */}
        <div className="flex flex-col items-center gap-1 pb-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            type="button"
            onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
            className="w-9 h-7 rounded-md text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {locale === 'en' ? '中' : 'EN'}
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label={t.settings.title}
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </aside>
    )
  }

  // ── 展开状态 ────────────────────────────
  return (
    <>
      <aside
        className="w-[260px] shrink-0 flex flex-col border-r border-border bg-muted/30 transition-all duration-200 ease-in-out"
        aria-expanded={true}
      >
        {/* macOS 交通灯空间 */}
        {isMac && <div className="h-7 shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />}

        {/* 顶部操作栏 */}
        <div className="flex items-center gap-1.5 px-3 pt-2 pb-2">
          <button
            type="button"
            onClick={toggle}
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-accent transition-colors"
            aria-label={t.sidebar.collapse}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setSearchOpen(!searchOpen)}
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-accent transition-colors"
            aria-label={t.sidebar.search}
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleNewChat}
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-accent transition-colors"
            aria-label={t.sidebar.newChat}
          >
            <SquarePen className="h-4 w-4" />
          </button>
        </div>

        {/* 搜索框（展开时内联） */}
        {searchOpen && (
          <div className="px-3 pb-2">
            <input
              type="text"
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder={t.sidebar.search}
              value={chatCtx.searchQuery}
              onChange={e => chatCtx.setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {/* 页面导航 */}
        <nav className="px-2 pb-2 space-y-0.5">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
                'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors',
                isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors w-full"
              >
                <MoreHorizontal className="h-4 w-4" />
                {t.sidebar.more}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right">
              {moreItems.map(item => (
                <DropdownMenuItem key={item.to} asChild>
                  <NavLink to={item.to} className="flex items-center gap-2">
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        {/* 会话列表（仅 Chat 路由） */}
        {isChatRoute && (
          <>
            <div className="h-px bg-border mx-3" />
            <div className="flex-1 overflow-y-auto px-2 py-2" role="listbox">
              {chatGroups.length === 0 && (
                <p className="text-xs text-muted-foreground px-2.5 py-4 text-center">{t.chat.noConversations}</p>
              )}
              {chatGroups.map(group => (
                <div key={group.label}>
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2.5 pt-3 pb-1">
                    {group.label}
                  </div>
                  {group.items.map(chat => (
                    <div
                      key={chat.chat_id}
                      role="option"
                      aria-selected={chatCtx.chatId === chat.chat_id}
                      className={cn(
                        'group flex items-center rounded-lg px-2.5 py-2 cursor-pointer transition-colors',
                        chatCtx.chatId === chat.chat_id ? 'bg-accent' : 'hover:bg-accent/50'
                      )}
                      onClick={() => handleChatClick(chat.chat_id)}
                    >
                      <span className="text-xs truncate flex-1">{chat.name}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded flex items-center justify-center hover:bg-accent transition-all shrink-0"
                            onClick={e => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-3 w-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={e => { e.stopPropagation(); setDeleteTarget(chat.chat_id) }}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            {t.common.delete}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        {/* 非 Chat 路由时填充空间 */}
        {!isChatRoute && <div className="flex-1" />}

        {/* 底部 */}
        <div className="border-t border-border px-3 py-2 flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Settings className="h-4 w-4" />
            {t.settings.title}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
            className="px-2 py-0.5 rounded border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {locale === 'en' ? '中' : 'EN'}
          </button>
        </div>
      </aside>

      {/* 删除确认对话框 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.chat.deleteChat}</AlertDialogTitle>
            <AlertDialogDescription>{t.chat.confirmDelete}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd web && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add web/src/components/layout/AppSidebar.tsx
git commit -m "feat: add AppSidebar with collapsible nav and chat list"
```

---

### Task 9: Refactor Shell — integrate AppSidebar + ChatProvider

**Files:**
- Modify: `web/src/components/layout/Shell.tsx`

- [ ] **Step 1: Replace Topbar + Sidebar with AppSidebar**

```typescript
import { type ReactNode, useState, useEffect } from 'react'
import { AppSidebar } from './AppSidebar'
import { SidebarProvider } from '@/hooks/useSidebar'  // .tsx file
import { ChatProvider } from '@/hooks/useChatContext'  // .tsx file
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { isElectron, getElectronAPI } from '@/api/transport'

export function Shell({ children }: { children: ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [platform, setPlatform] = useState('')

  useEffect(() => {
    if (!isElectron) return
    const cleanup = getElectronAPI().onOpenSettings(() => setSettingsOpen(true))
    return cleanup
  }, [])

  useEffect(() => {
    if (isElectron) setPlatform(getElectronAPI().getPlatform())
  }, [])

  const isWin = platform === 'win32'

  return (
    <ChatProvider>
      <SidebarProvider>
        <div className="h-screen flex bg-background text-foreground">
          <AppSidebar onOpenSettings={() => setSettingsOpen(true)} />
          <main className="flex-1 overflow-hidden flex flex-col">
            {/* Windows: drag region 条 */}
            {isWin && (
              <div
                className="h-8 shrink-0 flex justify-end"
                style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
              >
                <div className="w-32 shrink-0" />
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              {children}
            </div>
          </main>
        </div>
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      </SidebarProvider>
    </ChatProvider>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd web && npx tsc --noEmit`

- [ ] **Step 3: Verify the app renders**

Run: `cd web && pnpm dev` — open browser, confirm sidebar appears, navigation works.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/layout/Shell.tsx
git commit -m "feat(Shell): replace Topbar+Sidebar with AppSidebar+ChatProvider"
```

---

## Chunk 3: Chat Sub-Components

### Task 10: Create ToolUseBlock component

**Files:**
- Create: `web/src/components/chat/ToolUseBlock.tsx`

- [ ] **Step 1: Create ToolUseBlock**

```tsx
import { useState } from 'react'
import { ChevronRight, ChevronDown, Wrench, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ToolUseItem } from '@/hooks/useChat'
import { useI18n } from '@/i18n'

export function ToolUseBlock({ items }: { items: ToolUseItem[] }) {
  const { t } = useI18n()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  if (items.length === 0) return null

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-1 my-2">
      {items.map(item => {
        const isExpanded = expandedIds.has(item.id)
        const isRunning = item.status === 'running'

        return (
          <div
            key={item.id}
            className="border-l-3 border-primary/40 bg-muted/30 rounded-r-lg overflow-hidden"
          >
            <button
              type="button"
              onClick={() => toggleExpand(item.id)}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {isRunning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              ) : (
                <Wrench className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="font-medium">
                {isRunning ? t.chat.toolUsing.replace('{tool}', item.name) : item.name}
              </span>
              {item.input && !isExpanded && (
                <span className="truncate opacity-60">({item.input.slice(0, 60)})</span>
              )}
              <span className="ml-auto shrink-0">
                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </span>
            </button>
            {isExpanded && item.input && (
              <div className="px-3 pb-2 text-xs text-muted-foreground">
                <pre className="whitespace-pre-wrap break-all bg-background/50 rounded p-2 mt-1">
                  {item.input}
                </pre>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/chat/ToolUseBlock.tsx
git commit -m "feat: add ToolUseBlock component for tool_use visualization"
```

---

### Task 11: Create UserMessage and AssistantMessage components

**Files:**
- Create: `web/src/components/chat/UserMessage.tsx`
- Create: `web/src/components/chat/AssistantMessage.tsx`

- [ ] **Step 1: Create UserMessage**

```tsx
import { User } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Message as AIMessage, MessageContent } from '@/components/ai-elements/message'
import { useI18n } from '@/i18n'
import type { Message } from '@/hooks/useChat'

export function UserMessage({ message }: { message: Message }) {
  const { t } = useI18n()

  return (
    <AIMessage from="user" data-testid="message-user">
      <div className="flex gap-3 py-3 flex-row-reverse">
        <Avatar className="h-8 w-8 mt-0.5">
          <AvatarFallback className="text-[10px] font-semibold bg-blue-500/20 text-blue-500">
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 flex flex-col items-end">
          <div className="text-xs font-medium text-muted-foreground mb-1.5">
            {t.chat.you}
            <span className="ml-2 text-[10px] opacity-60">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <MessageContent>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
          </MessageContent>
        </div>
      </div>
    </AIMessage>
  )
}
```

- [ ] **Step 2: Create AssistantMessage**

```tsx
import { useState } from 'react'
import { Bot, Copy, Check, RefreshCw } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Message as AIMessage,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from '@/components/ai-elements/message'
import { ToolUseBlock } from './ToolUseBlock'
import { useI18n } from '@/i18n'
import type { Message } from '@/hooks/useChat'

export function AssistantMessage({ message }: { message: Message }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <AIMessage from="assistant" data-testid="message-assistant">
      <div className="group flex gap-3 py-3">
        <Avatar className="h-8 w-8 mt-0.5">
          <AvatarFallback className="bg-gradient-to-br from-violet-500/20 to-purple-500/20 text-[10px] font-semibold">
            <Bot className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-muted-foreground mb-1.5">
            {t.chat.assistant}
            <span className="ml-2 text-[10px] opacity-60">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          {message.toolUse && message.toolUse.length > 0 && (
            <ToolUseBlock items={message.toolUse} />
          )}
          <div className="relative">
            <MessageContent>
              <MessageResponse>{message.content}</MessageResponse>
            </MessageContent>
            <MessageActions className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <MessageAction
                tooltip={copied ? t.chat.copied : t.chat.copyCode}
                onClick={handleCopy}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              </MessageAction>
            </MessageActions>
          </div>
        </div>
      </div>
    </AIMessage>
  )
}
```

- [ ] **Step 3: Verify typecheck**

Run: `cd web && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add web/src/components/chat/UserMessage.tsx web/src/components/chat/AssistantMessage.tsx
git commit -m "feat: add UserMessage and AssistantMessage components"
```

---

### Task 12: Create ChatMessages component

**Files:**
- Create: `web/src/components/chat/ChatMessages.tsx`

- [ ] **Step 1: Create ChatMessages**

```tsx
import { Loader2, Bot } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import {
  Message as AIMessage,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import { ToolUseBlock } from './ToolUseBlock'
import { useI18n } from '@/i18n'
import { useChatContext } from '@/hooks/useChatContext'

export function ChatMessages() {
  const { t } = useI18n()
  const { messages, streamingText, isProcessing, pendingToolUse } = useChatContext()

  return (
    <Conversation data-testid="message-list">
      <ConversationContent className="max-w-3xl mx-auto w-full px-4 py-6 gap-1">
        {messages.map(msg =>
          msg.role === 'user'
            ? <UserMessage key={msg.id} message={msg} />
            : <AssistantMessage key={msg.id} message={msg} />
        )}

        {/* Streaming 中的 tool_use */}
        {pendingToolUse.length > 0 && (
          <AIMessage from="assistant">
            <div className="flex gap-3 py-3">
              <Avatar className="h-8 w-8 mt-0.5">
                <AvatarFallback className="bg-gradient-to-br from-violet-500/20 to-purple-500/20 text-[10px] font-semibold">
                  <Bot className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <ToolUseBlock items={pendingToolUse} />
              </div>
            </div>
          </AIMessage>
        )}

        {/* Streaming 文本 */}
        {streamingText && (
          <AIMessage from="assistant">
            <div className="flex gap-3 py-3">
              <Avatar className="h-8 w-8 mt-0.5">
                <AvatarFallback className="bg-gradient-to-br from-violet-500/20 to-purple-500/20 text-[10px] font-semibold">
                  AI
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-muted-foreground mb-1.5">{t.chat.assistant}</div>
                <MessageContent>
                  <MessageResponse parseIncompleteMarkdown>{streamingText}</MessageResponse>
                </MessageContent>
              </div>
            </div>
          </AIMessage>
        )}

        {/* Thinking 状态 */}
        {isProcessing && !streamingText && pendingToolUse.length === 0 && (
          <div className="flex gap-3 py-3">
            <Avatar className="h-8 w-8 mt-0.5">
              <AvatarFallback className="bg-gradient-to-br from-violet-500/20 to-purple-500/20 text-[10px] font-semibold">
                AI
              </AvatarFallback>
            </Avatar>
            <div className="flex items-center gap-2 text-muted-foreground text-sm pt-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t.chat.thinking}
            </div>
          </div>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/chat/ChatMessages.tsx
git commit -m "feat: add ChatMessages container component"
```

---

### Task 13: Create ChatInput component

**Files:**
- Create: `web/src/components/chat/ChatInput.tsx`

- [ ] **Step 1: Create ChatInput**

```tsx
import { useI18n } from '@/i18n'
import { useChatContext } from '@/hooks/useChatContext'
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
  PromptInputSelect,
  PromptInputSelectTrigger,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectValue,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import { Bot } from 'lucide-react'

export function ChatInput() {
  const { t } = useI18n()
  const { send, chatStatus, stop, agentId, setAgentId, agents } = useChatContext()

  const handleSubmit = (msg: PromptInputMessage) => {
    const text = msg.text.trim()
    if (!text) return
    send(text)
  }

  return (
    <div className="border-t border-border bg-background">
      <div className="max-w-3xl mx-auto px-4 py-3">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea
            placeholder={t.chat.placeholder}
            data-testid="chat-input"
          />
          <PromptInputFooter>
            <PromptInputTools>
              {agents.length > 1 && (
                <PromptInputSelect value={agentId} onValueChange={setAgentId}>
                  <PromptInputSelectTrigger className="h-7 text-xs gap-1">
                    <Bot className="h-3.5 w-3.5" />
                    <PromptInputSelectValue />
                  </PromptInputSelectTrigger>
                  <PromptInputSelectContent>
                    {agents.map(a => (
                      <PromptInputSelectItem key={a.id} value={a.id}>
                        {a.name}
                      </PromptInputSelectItem>
                    ))}
                  </PromptInputSelectContent>
                </PromptInputSelect>
              )}
            </PromptInputTools>
            <PromptInputSubmit
              status={chatStatus}
              onStop={stop}
              data-testid="chat-send"
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/chat/ChatInput.tsx
git commit -m "feat: add ChatInput component using PromptInput"
```

---

### Task 14: Create ChatWelcome component

**Files:**
- Create: `web/src/components/chat/ChatWelcome.tsx`

- [ ] **Step 1: Create ChatWelcome**

```tsx
import { Sparkles } from 'lucide-react'
import { useI18n } from '@/i18n'
import { useChatContext } from '@/hooks/useChatContext'
import { ChatInput } from './ChatInput'

export function ChatWelcome() {
  const { t } = useI18n()

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4">
      <div className="max-w-xl w-full space-y-6">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 mb-2">
            <Sparkles className="h-7 w-7 text-primary opacity-80" />
          </div>
          <h1 className="text-2xl font-semibold">{t.chat.welcome}</h1>
          <p className="text-sm text-muted-foreground">{t.chat.startHint}</p>
        </div>

        <ChatInput />
      </div>
    </div>
  )
}
```

Note: ChatWelcome embeds ChatInput directly (centered in page). When in conversation mode, ChatInput is rendered separately at the bottom.

- [ ] **Step 2: Commit**

```bash
git add web/src/components/chat/ChatWelcome.tsx
git commit -m "feat: add ChatWelcome component for new chat state"
```

---

## Chunk 4: Chat Page Rewrite + Cleanup

### Task 15: Rewrite Chat.tsx

**Files:**
- Modify: `web/src/pages/Chat.tsx`

- [ ] **Step 1: Replace Chat.tsx with slim version**

The new `Chat.tsx` is extremely simple — it consumes `ChatContext` and conditionally renders `ChatWelcome` or `ChatMessages` + `ChatInput`:

```tsx
import { useChatContext } from '@/hooks/useChatContext'
import { ChatWelcome } from '@/components/chat/ChatWelcome'
import { ChatMessages } from '@/components/chat/ChatMessages'
import { ChatInput } from '@/components/chat/ChatInput'

export function Chat() {
  const { chatId, messages } = useChatContext()
  const isNewChat = !chatId && messages.length === 0

  return (
    <div className="flex flex-col h-full">
      {isNewChat ? (
        <ChatWelcome />
      ) : (
        <>
          <ChatMessages />
          <ChatInput />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd web && npx tsc --noEmit`

- [ ] **Step 3: Manual smoke test**

Run: `pnpm dev:web` — verify:
1. New chat: welcome page shows with centered input
2. Send a message: switches to conversation view
3. Sidebar collapses/expands (click ☰ or Cmd+Shift+S)
4. Chat list shows in sidebar, clicking switches conversations
5. Tool use blocks appear during agent responses (if backend sends them)
6. Delete chat via sidebar `...` menu works with AlertDialog

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/Chat.tsx
git commit -m "feat(Chat): rewrite as slim page consuming ChatContext"
```

---

### Task 16: Delete old Topbar and Sidebar

**Files:**
- Delete: `web/src/components/layout/Topbar.tsx`
- Delete: `web/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Verify no remaining imports**

Search for imports of Topbar and Sidebar in the codebase. Shell.tsx should no longer reference them after Task 9.

Run: `cd web && grep -r "from.*Topbar\|from.*\/Sidebar" src/`
Expected: No matches (or only from old test files)

- [ ] **Step 2: Delete the files**

```bash
rm web/src/components/layout/Topbar.tsx web/src/components/layout/Sidebar.tsx
```

- [ ] **Step 3: Verify typecheck and app still runs**

Run: `cd web && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add -u web/src/components/layout/
git commit -m "chore: remove old Topbar and Sidebar components"
```

---

### Task 17: Final typecheck and cleanup

- [ ] **Step 1: Full typecheck**

Run: `cd web && npx tsc --noEmit`
Fix any remaining errors.

- [ ] **Step 2: Run dev and do final visual check**

Run: `pnpm dev:web` — verify all pages (Chat, Agents, Cron, Memory, Skills, Browser, Logs, System) still work via sidebar navigation.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A web/src/
git commit -m "fix: resolve typecheck and cleanup remaining issues"
```
