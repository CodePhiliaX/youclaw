import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useChat, type Message, type ToolUseItem } from './useChat'
import { getChats, getAgents, deleteChat as deleteChatApi, getBrowserProfiles, type BrowserProfileDTO } from '../api/client'
import type { ChatItem } from '../lib/chat-utils'
import type { Attachment } from '../types/attachment'

const LAST_AGENT_KEY = 'youclaw-last-agent-id'
const chatKey = (agentId: string) => `youclaw-last-chat:${agentId}`

type Agent = { id: string; name: string }

interface ChatContextType {
  // useChat 暴露的所有状态
  chatId: string | null
  messages: Message[]
  streamingText: string
  isProcessing: boolean
  pendingToolUse: ToolUseItem[]
  chatStatus: 'submitted' | 'streaming' | 'ready' | 'error'
  send: (prompt: string, browserProfileId?: string, attachments?: Attachment[]) => Promise<void>
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

  // 浏览器 Profile
  browserProfiles: BrowserProfileDTO[]
  selectedProfileId: string | null
  setSelectedProfileId: (id: string | null) => void
}

const ChatContext = createContext<ChatContextType | null>(null)

export function useChatContext() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChatContext must be used within ChatProvider')
  return ctx
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [agentId, setAgentId] = useState(
    () => localStorage.getItem(LAST_AGENT_KEY) || 'default'
  )
  const [agents, setAgents] = useState<Agent[]>([])
  const [chatList, setChatList] = useState<ChatItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [browserProfiles, setBrowserProfiles] = useState<BrowserProfileDTO[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)

  const chat = useChat(agentId)

  // 加载 agents
  useEffect(() => {
    getAgents()
      .then(list => setAgents(list.map(a => ({ id: a.id, name: a.name }))))
      .catch(() => {})
  }, [])

  // 加载浏览器 Profiles
  useEffect(() => {
    getBrowserProfiles().then(setBrowserProfiles).catch(() => {})
  }, [])

  // 加载聊天列表
  const refreshChats = useCallback(() => {
    getChats().then(setChatList).catch(() => {})
  }, [])

  useEffect(() => { refreshChats() }, [chat.chatId, refreshChats])

  // 持久化 agentId
  useEffect(() => {
    localStorage.setItem(LAST_AGENT_KEY, agentId)
  }, [agentId])

  // 持久化当前 agent 的 chatId
  useEffect(() => {
    if (chat.chatId) localStorage.setItem(chatKey(agentId), chat.chatId)
  }, [chat.chatId, agentId])

  // 切换 agent 或首次加载时，恢复该 agent 的上次会话
  const prevAgentRef = useRef<string | null>(null)
  useEffect(() => {
    if (prevAgentRef.current === agentId) return
    prevAgentRef.current = agentId
    const lastChatId = localStorage.getItem(chatKey(agentId))
    if (lastChatId) {
      chat.loadChat(lastChatId).catch(() => {
        localStorage.removeItem(chatKey(agentId))
        chat.newChat()
      })
    } else {
      chat.newChat()
    }
  }, [agentId]) // eslint-disable-line react-hooks/exhaustive-deps

  const chatRef = useRef(chat)
  chatRef.current = chat

  const deleteChat = useCallback(async (chatIdToDelete: string) => {
    await deleteChatApi(chatIdToDelete)
    if (chatRef.current.chatId === chatIdToDelete) chatRef.current.newChat()
    // 清理所有 agent 下匹配的 localStorage 记录
    for (const a of agents) {
      if (localStorage.getItem(chatKey(a.id)) === chatIdToDelete) {
        localStorage.removeItem(chatKey(a.id))
      }
    }
    refreshChats()
  }, [refreshChats, agents])

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
      browserProfiles,
      selectedProfileId,
      setSelectedProfileId,
    }}>
      {children}
    </ChatContext.Provider>
  )
}
