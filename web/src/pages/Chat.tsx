import { useState, useEffect, useRef } from 'react'
import { useChat, type Message } from '../hooks/useChat'
import { getChats } from '../api/client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, Plus, MessageSquare, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { useI18n } from '../i18n'

export function Chat() {
  const { t } = useI18n()
  const [agentId] = useState('default')
  const { chatId, messages, streamingText, isProcessing, send, loadChat, newChat } = useChat(agentId)
  const [input, setInput] = useState('')
  const [chatList, setChatList] = useState<Array<{ chat_id: string; name: string; last_message_time: string }>>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 加载聊天列表
  useEffect(() => {
    getChats().then(setChatList).catch(() => {})
  }, [chatId]) // chatId 变化时刷新

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const handleSend = () => {
    const text = input.trim()
    if (!text || isProcessing) return
    setInput('')
    send(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-full">
      {/* 左侧：对话列表 */}
      <div className="w-[260px] border-r border-border flex flex-col">
        <div className="p-3 border-b border-border">
          <button
            onClick={newChat}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t.chat.newChat}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {chatList.map(chat => (
            <button
              key={chat.chat_id}
              onClick={() => loadChat(chat.chat_id)}
              className={cn(
                'flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md text-left transition-colors',
                chatId === chat.chat_id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'
              )}
            >
              <MessageSquare className="h-4 w-4 shrink-0" />
              <span className="truncate">{chat.name || chat.chat_id}</span>
            </button>
          ))}
          {chatList.length === 0 && (
            <p className="text-xs text-muted-foreground p-3 text-center">{t.chat.noConversations}</p>
          )}
        </div>
      </div>

      {/* 右侧：消息区 */}
      <div className="flex-1 flex flex-col">
        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !streamingText && (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p className="text-lg">{t.chat.startConversation}</p>
                <p className="text-sm mt-1">{t.chat.startHint}</p>
              </div>
            </div>
          )}

          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {/* 流式输出 */}
          {streamingText && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-medium">AI</div>
              <div className="flex-1 prose prose-invert prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
                <span className="inline-block w-2 h-4 bg-primary/50 animate-pulse ml-0.5" />
              </div>
            </div>
          )}

          {/* 处理中指示器 */}
          {isProcessing && !streamingText && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-medium">AI</div>
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t.chat.thinking}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 输入区 */}
        <div className="border-t border-border p-4">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t.chat.placeholder}
              rows={1}
              className="flex-1 resize-none bg-secondary rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isProcessing}
              className="px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  return (
    <div className="flex gap-3">
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-medium',
        isUser ? 'bg-blue-500/20 text-blue-400' : 'bg-primary/10'
      )}>
        {isUser ? 'U' : 'AI'}
      </div>
      <div className="flex-1 prose prose-invert prose-sm max-w-none">
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        )}
      </div>
    </div>
  )
}
