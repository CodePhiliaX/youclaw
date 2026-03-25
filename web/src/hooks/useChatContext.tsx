import { useState, useCallback, useEffect, type ReactNode } from "react";
import {
  useActiveChatState,
  useChatActions,
  onChatUpdate,
} from "./useChat";
import {
  getChats,
  getAgents,
  deleteChat as deleteChatApi,
  updateChat as updateChatApi,
  getBrowserProfiles,
  type BrowserProfileDTO,
} from "../api/client";
import { ChatContext } from "./chatCtx";
import { useAppPreferencesStore } from "@/stores/app";
import { useChatStore } from "@/stores/chat";
import { sseManager } from "@/lib/sse-manager";
import type { ChatItem } from "@/lib/chat-utils";

type Agent = { id: string; name: string };

export function ChatProvider({ children }: { children: ReactNode }) {
  const agentId = useAppPreferencesStore((s) => s.lastAgentId);
  const setAgentId = useAppPreferencesStore((s) => s.setLastAgentId);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [chatList, setChatList] = useState<ChatItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [browserProfiles, setBrowserProfiles] = useState<BrowserProfileDTO[]>(
    [],
  );
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null,
  );

  const activeChatState = useActiveChatState();
  const actions = useChatActions(agentId);

  // Load agents
  const refreshAgents = useCallback(() => {
    getAgents()
      .then((list) => {
        const sorted = list
          .map((a) => ({ id: a.id, name: a.name }))
          .sort((a, b) => {
            if (a.id === "default") return -1;
            if (b.id === "default") return 1;
            return a.name.localeCompare(b.name);
          });
        setAgents(sorted);

        if (sorted.length === 0) return;
        if (sorted.some((agent) => agent.id === agentId)) return;

        const fallbackAgentId =
          sorted.find((agent) => agent.id === "default")?.id ?? sorted[0]!.id;
        setAgentId(fallbackAgentId);
      })
      .catch(() => {});
  }, [agentId, setAgentId]);

  useEffect(() => {
    refreshAgents();
  }, [refreshAgents]);

  const refreshBrowserProfiles = useCallback(() => {
    getBrowserProfiles()
      .then(setBrowserProfiles)
      .catch(() => {});
  }, []);

  // Load browser profiles
  useEffect(() => {
    refreshBrowserProfiles();
  }, [refreshBrowserProfiles]);

  // Load chat list
  const refreshChats = useCallback(() => {
    getChats()
      .then(setChatList)
      .catch(() => {});
  }, []);

  // Refresh on active chat change
  const activeChatId = useChatStore((s) => s.activeChatId);
  useEffect(() => {
    refreshChats();
  }, [activeChatId, refreshChats]);

  // Debounced refresh on chat updates (completeMessage, addUserMessage)
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = onChatUpdate(() => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        refreshChats();
        timeout = null;
      }, 500);
    });
    return () => {
      unsubscribe();
      if (timeout) clearTimeout(timeout);
    };
  }, [refreshChats]);

  // Connect system SSE for real-time channel events (new_chat, inbound_message)
  useEffect(() => {
    sseManager.connectSystem();
    const unsubscribe = sseManager.onNewChat(() => {
      refreshChats();
    });
    return () => {
      unsubscribe();
      sseManager.disconnectSystem();
    };
  }, [refreshChats]);

  const deleteChat = useCallback(
    async (chatIdToDelete: string) => {
      await deleteChatApi(chatIdToDelete);
      sseManager.disconnect(chatIdToDelete);
      useChatStore.getState().removeChat(chatIdToDelete);
      refreshChats();
    },
    [refreshChats],
  );

  const updateChat = useCallback(
    async (
      chatIdToUpdate: string,
      data: { name?: string; avatar?: string },
    ) => {
      await updateChatApi(chatIdToUpdate, data);
      refreshChats();
    },
    [refreshChats],
  );

  return (
    <ChatContext.Provider
      value={{
        chatId: activeChatState?.chatId ?? null,
        messages: activeChatState?.messages ?? [],
        timelineItems: activeChatState?.timelineItems ?? [],
        streamingText: activeChatState?.streamingText ?? "",
        isProcessing: activeChatState?.isProcessing ?? false,
        pendingToolUse: activeChatState?.pendingToolUse ?? [],
        documentStatuses: activeChatState?.documentStatuses ?? {},
        chatStatus: activeChatState?.chatStatus ?? "ready",
        showInsufficientCredits:
          activeChatState?.showInsufficientCredits ?? false,
        ...actions,
        chatList,
        refreshChats,
        searchQuery,
        setSearchQuery,
        deleteChat,
        updateChat,
        agentId,
        setAgentId,
        agents,
        refreshAgents,
        browserProfiles,
        refreshBrowserProfiles,
        selectedProfileId,
        setSelectedProfileId,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
