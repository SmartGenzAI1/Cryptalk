'use client'

import { create } from 'zustand'
import type { SafeUser, ChatWithMembers, MessageWithSender } from '@/lib/types'

// Stable empty references to avoid useSyncExternalStore infinite loops
export const EMPTY_MESSAGES: MessageWithSender[] = []
export const EMPTY_TYPING: { userId: string; username: string }[] = []

interface ChatListItem {
  id: string
  type: string
  title: string
  description: string
  avatarColor: string
  avatarEmoji: string
  createdBy: string
  createdAt: string
  updatedAt: string
  lastReadAt: string
  role: string
  pinnedAt: string | null
  muted: boolean
  unreadCount: number
  members: Array<{ id: string; role: string; user: SafeUser; lastReadAt: string }>
  lastMessage: {
    id: string
    content: string
    type: string
    createdAt: string
    senderId: string
    senderName: string
    duration?: number | null
  } | null
}

interface ChatState {
  // auth
  currentUser: SafeUser | null
  authLoading: boolean
  setCurrentUser: (u: SafeUser | null) => void
  setAuthLoading: (b: boolean) => void

  // chats
  chats: ChatListItem[]
  setChats: (c: ChatListItem[]) => void
  upsertChat: (c: ChatListItem) => void
  activeChatId: string | null
  setActiveChatId: (id: string | null) => void
  activeChat: ChatWithMembers | null
  setActiveChat: (c: ChatWithMembers | null) => void

  // messages
  messages: Record<string, MessageWithSender[]>
  setMessages: (chatId: string, msgs: MessageWithSender[]) => void
  addMessage: (chatId: string, msg: MessageWithSender) => void
  updateMessage: (chatId: string, msg: MessageWithSender) => void
  removeMessage: (chatId: string, messageId: string) => void

  // presence
  onlineUserIds: Set<string>
  setOnlineUserIds: (ids: Set<string>) => void
  setUserOnline: (userId: string, online: boolean) => void

  // typing
  typingUsers: Record<string, { userId: string; username: string }[]>
  setTyping: (chatId: string, users: { userId: string; username: string }[]) => void
  addTyping: (chatId: string, user: { userId: string; username: string }) => void
  removeTyping: (chatId: string, userId: string) => void

  // ui
  infoPanelOpen: boolean
  setInfoPanelOpen: (b: boolean) => void
  settingsOpen: boolean
  setSettingsOpen: (b: boolean) => void
  searchQuery: string
  setSearchQuery: (q: string) => void

  // in-chat search
  chatSearchOpen: boolean
  setChatSearchOpen: (b: boolean) => void
  chatSearchQuery: string
  setChatSearchQuery: (q: string) => void

  // connection status
  isConnected: boolean
  setConnected: (b: boolean) => void
  messagesLoading: Record<string, boolean>
  setMessagesLoading: (chatId: string, b: boolean) => void

  // E2EE status
  e2eeEnabled: boolean
  setE2eeEnabled: (b: boolean) => void

  // connections panel
  connectionsPanelOpen: boolean
  setConnectionsPanelOpen: (b: boolean) => void

  // chat settings (pin/mute) helpers
  updateChatListItem: (id: string, patch: Partial<ChatListItem>) => void
}

export const useChatStore = create<ChatState>((set, _get) => ({
  currentUser: null,
  authLoading: true,
  setCurrentUser: (u) => set({ currentUser: u }),
  setAuthLoading: (b) => set({ authLoading: b }),

  chats: [],
  setChats: (c) => set({ chats: c }),
  upsertChat: (c) =>
    set((s) => {
      const idx = s.chats.findIndex((x) => x.id === c.id)
      if (idx >= 0) {
        const copy = [...s.chats]
        copy[idx] = c
        return { chats: copy }
      }
      return { chats: [c, ...s.chats] }
    }),
  activeChatId: null,
  setActiveChatId: (id) => set({ activeChatId: id }),
  activeChat: null,
  setActiveChat: (c) => set({ activeChat: c }),

  messages: {},
  setMessages: (chatId, msgs) =>
    set((s) => ({ messages: { ...s.messages, [chatId]: msgs } })),
  addMessage: (chatId, msg) =>
    set((s) => {
      const existing = s.messages[chatId] || []
      if (existing.some((m) => m.id === msg.id)) return s
      return { messages: { ...s.messages, [chatId]: [...existing, msg] } }
    }),
  updateMessage: (chatId, msg) =>
    set((s) => {
      const existing = s.messages[chatId] || []
      return {
        messages: {
          ...s.messages,
          [chatId]: existing.map((m) => (m.id === msg.id ? msg : m)),
        },
      }
    }),
  removeMessage: (chatId, messageId) =>
    set((s) => {
      const existing = s.messages[chatId] || []
      return {
        messages: {
          ...s.messages,
          [chatId]: existing.map((m) =>
            m.id === messageId ? { ...m, deletedAt: new Date().toISOString(), content: '🗑️ Message deleted' } : m
          ),
        },
      }
    }),

  onlineUserIds: new Set(),
  setOnlineUserIds: (ids) => set({ onlineUserIds: ids }),
  setUserOnline: (userId, online) =>
    set((s) => {
      const next = new Set(s.onlineUserIds)
      if (online) next.add(userId)
      else next.delete(userId)
      return { onlineUserIds: next }
    }),

  typingUsers: {},
  setTyping: (chatId, users) =>
    set((s) => ({ typingUsers: { ...s.typingUsers, [chatId]: users } })),
  addTyping: (chatId, user) =>
    set((s) => {
      const cur = s.typingUsers[chatId] || []
      if (cur.some((u) => u.userId === user.userId)) return s
      return { typingUsers: { ...s.typingUsers, [chatId]: [...cur, user] } }
    }),
  removeTyping: (chatId, userId) =>
    set((s) => {
      const cur = (s.typingUsers[chatId] || []).filter((u) => u.userId !== userId)
      return { typingUsers: { ...s.typingUsers, [chatId]: cur } }
    }),

  infoPanelOpen: false,
  setInfoPanelOpen: (b) => set({ infoPanelOpen: b }),
  settingsOpen: false,
  setSettingsOpen: (b) => set({ settingsOpen: b }),
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),

  chatSearchOpen: false,
  setChatSearchOpen: (b) => set({ chatSearchOpen: b }),
  chatSearchQuery: '',
  setChatSearchQuery: (q) => set({ chatSearchQuery: q }),

  isConnected: false,
  setConnected: (b) => set({ isConnected: b }),
  messagesLoading: {},
  setMessagesLoading: (chatId, b) =>
    set((s) => ({ messagesLoading: { ...s.messagesLoading, [chatId]: b } })),

  e2eeEnabled: false,
  setE2eeEnabled: (b) => set({ e2eeEnabled: b }),

  connectionsPanelOpen: false,
  setConnectionsPanelOpen: (b) => set({ connectionsPanelOpen: b }),

  updateChatListItem: (id, patch) =>
    set((s) => ({
      chats: s.chats.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),
}))

export type { ChatListItem }
