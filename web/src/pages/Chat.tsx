import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useChatContext } from "@/hooks/chatCtx";
import { groupChatsByDate } from "@/lib/chat-utils";
import { ChatWelcome } from "@/components/chat/ChatWelcome";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";
import { SidePanel } from "@/components/layout/SidePanel";
import { InsufficientCreditsDialog } from "@/components/chat/InsufficientCreditsDialog";
import { ChatListItem } from "@/components/chat/ChatListItem";
import { useDragRegion } from "@/hooks/useDragRegion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function Chat() {
  const { t } = useI18n();
  const chatCtx = useChatContext();
  const { chatId, messages } = chatCtx;
  const isNewChat = !chatId && messages.length === 0;
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isLeavingNewChat, setIsLeavingNewChat] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const prevIsNewChatRef = useRef(isNewChat);
  const drag = useDragRegion();
  const [composerMetrics, setComposerMetrics] = useState({
    contentHeight: 0,
    composerHeight: 0,
  });

  const currentChat = chatCtx.chatList.find((chat) => chat.chat_id === chatId);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    } else {
      chatCtx.setSearchQuery("");
    }
  }, [searchOpen]);

  useEffect(() => {
    const wasNewChat = prevIsNewChatRef.current;
    prevIsNewChatRef.current = isNewChat;

    if (wasNewChat && !isNewChat) {
      setIsLeavingNewChat(true);
      const timeoutId = window.setTimeout(() => {
        setIsLeavingNewChat(false);
      }, 260);
      return () => window.clearTimeout(timeoutId);
    }

    if (isNewChat) {
      setIsLeavingNewChat(false);
    }
  }, [isNewChat]);

  useLayoutEffect(() => {
    const contentEl = contentRef.current;
    const composerEl = composerRef.current;

    if (!contentEl || !composerEl) return;

    let frameId = 0;

    const measure = () => {
      const nextContentHeight = contentEl.clientHeight;
      const nextComposerHeight = composerEl.offsetHeight;
      setComposerMetrics((prev) => {
        if (
          prev.contentHeight === nextContentHeight &&
          prev.composerHeight === nextComposerHeight
        ) {
          return prev;
        }
        return {
          contentHeight: nextContentHeight,
          composerHeight: nextComposerHeight,
        };
      });
    };

    const scheduleMeasure = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(measure);
    };

    measure();

    const observer = new ResizeObserver(() => {
      scheduleMeasure();
    });

    observer.observe(contentEl);
    observer.observe(composerEl);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, []);

  const hasComposerMetrics =
    composerMetrics.contentHeight > 0 && composerMetrics.composerHeight > 0;

  const composerTop = hasComposerMetrics
    ? isNewChat
      ? Math.max(
          0,
          Math.round(
            (composerMetrics.contentHeight - composerMetrics.composerHeight) / 2,
          ),
        )
      : Math.max(
          0,
          Math.round(
            composerMetrics.contentHeight - composerMetrics.composerHeight,
          ),
        )
    : null;

  const composerInset = isNewChat
    ? 0
    : hasComposerMetrics
      ? composerMetrics.composerHeight
      : 96;
  const composerDurationClass = isLeavingNewChat ? "duration-[320ms]" : "duration-500";
  const shouldRenderWelcome = isNewChat || isLeavingNewChat;

  const filteredChats = chatCtx.searchQuery
    ? chatCtx.chatList.filter((c) =>
        c.name.toLowerCase().includes(chatCtx.searchQuery.toLowerCase()),
      )
    : chatCtx.chatList;

  const chatGroups = groupChatsByDate(filteredChats, {
    today: t.chat.today,
    yesterday: t.chat.yesterday,
    older: t.chat.older,
  });

  const handleDeleteConfirm = async () => {
    if (deleteTarget) {
      await chatCtx.deleteChat(deleteTarget);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="flex h-full">
      {/* Left side: Chat list */}
      <SidePanel>
        <div className="h-9 shrink-0 px-3 border-b border-[var(--subtle-border)] flex items-center justify-between" {...drag}>
          <h2 className="font-semibold text-sm">{t.nav.chat}</h2>
          <div className="flex items-center gap-0.5">
            <button
              data-testid="chat-search-toggle"
              onClick={() => setSearchOpen((v) => !v)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-all duration-200 ease-[var(--ease-soft)]",
                searchOpen
                  ? "text-foreground bg-[var(--surface-hover)]"
                  : "text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-accent-foreground",
              )}
              title={t.sidebar.search}
            >
              <Search className="h-3.5 w-3.5" />
            </button>
            <button
              data-testid="chat-new"
              onClick={() => chatCtx.newChat()}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-accent-foreground transition-all duration-200 ease-[var(--ease-soft)]"
              title={t.sidebar.newChat}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Search (expand/collapse) */}
        <div
          className={cn(
            "overflow-hidden transition-all duration-200 ease-[var(--ease-soft)]",
            searchOpen ? "max-h-12 opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <div className="px-3 py-2">
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                data-testid="chat-search"
                className="w-full bg-[var(--surface-raised)] border border-[var(--subtle-border)] rounded-xl px-3 py-1.5 pr-7 text-sm transition-all duration-200 ease-[var(--ease-soft)] focus:outline-none focus:border-primary/40 focus:shadow-[0_0_0_3px_oklch(0.55_0.2_25/0.1)]"
                placeholder={t.sidebar.search}
                value={chatCtx.searchQuery}
                onChange={(e) => chatCtx.setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setSearchOpen(false);
                }}
              />
              {chatCtx.searchQuery && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => chatCtx.setSearchQuery("")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5" role="listbox">
          {chatGroups.length === 0 && (
            <p className="text-xs text-muted-foreground px-2.5 py-4 text-center">
              {t.chat.noConversations}
            </p>
          )}
          {chatGroups.map((group) => (
            <div key={group.label}>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2.5 pt-3 pb-1">
                {group.label}
              </div>
              {group.items.map((chat) => (
                <ChatListItem
                  key={chat.chat_id}
                  chat={chat}
                  isActive={chatCtx.chatId === chat.chat_id}
                  onSelect={() => chatCtx.loadChat(chat.chat_id, chat.agent_id)}
                  onDelete={(id) => setDeleteTarget(id)}
                  onUpdateAvatar={(id, avatar) => chatCtx.updateChat(id, { avatar })}
                  onUpdateName={(id, name) => chatCtx.updateChat(id, { name })}
                />
              ))}
            </div>
          ))}
        </div>
      </SidePanel>

      {/* Right: Chat content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Title bar with drag region */}
        <div
          className={cn(
            "h-9 shrink-0 flex items-center px-4",
            !isNewChat && currentChat
              ? "border-b border-[var(--subtle-border)]"
              : "",
          )}
          {...drag}
        >
          {!isNewChat && currentChat && (
            <span className="text-sm font-medium truncate text-foreground/80">
              {currentChat.name}
            </span>
          )}
        </div>

        <div ref={contentRef} className="relative flex-1 min-h-0 overflow-hidden">
          <div
            className={cn(
              "flex h-full min-h-0 flex-col transition-[padding-bottom] ease-[var(--ease-soft)]",
              composerDurationClass,
            )}
            style={{ paddingBottom: `${composerInset}px` }}
          >
            {isNewChat ? <ChatWelcome /> : <ChatMessages />}
          </div>

          <div
            ref={composerRef}
            className={cn(
              "absolute inset-x-0 transition-[top,padding] ease-[var(--ease-soft)]",
              composerDurationClass,
              isNewChat ? "px-6" : "px-0",
            )}
            style={composerTop === null ? undefined : { top: `${composerTop}px` }}
          >
            <div className="max-w-3xl mx-auto relative">
              {shouldRenderWelcome && (
                <div
                  className={cn(
                    "pointer-events-none absolute inset-x-0 bottom-[calc(100%+2rem)] text-center",
                    "transition-[opacity,transform] duration-[220ms] ease-[var(--ease-soft)]",
                    isNewChat
                      ? "translate-y-0 opacity-100"
                      : "translate-y-3 opacity-0",
                  )}
                >
                  <div className="mb-3 mx-auto w-fit pointer-events-auto">
                    <img
                      src="/icon.svg"
                      alt="YouClaw"
                      className="chat-welcome-mascot h-24 w-24"
                    />
                  </div>
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {t.chat.welcome}
                  </h1>
                  <p className="mt-4 text-sm text-muted-foreground/70 max-w-md mx-auto leading-relaxed">
                    {t.chat.startHint}
                  </p>
                </div>
              )}
              <ChatInput />
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.chat.deleteChat}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.chat.confirmDelete}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Insufficient credits top-up dialog */}
      <InsufficientCreditsDialog
        open={chatCtx.showInsufficientCredits}
        onOpenChange={chatCtx.setShowInsufficientCredits}
      />
    </div>
  );
}
