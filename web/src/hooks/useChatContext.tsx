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
import { socketManager } from "@/lib/socket-manager";
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

  const activeChatState = useActiveChatState();
  const actions = useChatActions(agentId);

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

  useEffect(() => {
    refreshBrowserProfiles();
  }, [refreshBrowserProfiles]);

  const refreshChats = useCallback(() => {
    getChats()
      .then(setChatList)
      .catch(() => {});
  }, []);

  const activeChatId = useChatStore((s) => s.activeChatId);
  const activeChatListItem = activeChatId
    ? chatList.find((chat) => chat.chat_id === activeChatId) ?? null
    : null;
  const currentChatAgentId =
    activeChatState?.boundAgentId ?? activeChatListItem?.agent_id ?? null;
  const canChangeAgent = !activeChatId;

  useEffect(() => {
    refreshChats();
  }, [activeChatId, refreshChats]);

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

  useEffect(() => {
    socketManager.connect();
    const unsubscribe = socketManager.onNewChat(() => {
      refreshChats();
    });
    return () => {
      unsubscribe();
      socketManager.disconnect();
    };
  }, [refreshChats]);

  const deleteChat = useCallback(
    async (chatIdToDelete: string) => {
      await deleteChatApi(chatIdToDelete);
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
        currentChatAgentId,
        canChangeAgent,
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
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}
