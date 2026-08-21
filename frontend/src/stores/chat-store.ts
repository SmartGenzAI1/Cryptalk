'use client'

import { create } from 'zustand'
import { toSafeUser, type SafeUser, type ChatWithMembers, type MessageWithSender } from '@/lib/types'

// Stable empty references to avoid useSyncExternalStore infinite loops
export const EMPTY_MESSAGES: MessageWithSender[] = []
export const EMPTY_TYPING: { userId: string; username: string }[] = []

// Debounced localStorage writer to avoid blocking main thread on every state change
let _pendingChats: any = null
let _chatWriteTimer: ReturnType<typeof setTimeout> | null = null
let _pendingUser: any = null
let _userWriteTimer: ReturnType<typeof setTimeout> | null = null

function _scheduleChatPersist(chats: any) {
  _pendingChats = chats
  if (!_chatWriteTimer) {
    _chatWriteTimer = setTimeout(() => {
      _chatWriteTimer = null
      if (_pendingChats !== null && typeof window !== 'undefined') {
        localStorage.setItem('zc-chats', JSON.stringify(_pendingChats))
        _pendingChats = null
      }
    }, 300)
  }
}

function _scheduleUserPersist(user: any) {
  _pendingUser = user
  if (!_userWriteTimer) {
    _userWriteTimer = setTimeout(() => {
      _userWriteTimer = null
      if (typeof window !== 'undefined') {
        if (_pendingUser) localStorage.setItem('zc-currentUser', JSON.stringify(_pendingUser))
        else localStorage.removeItem('zc-currentUser')
        _pendingUser = null
      }
    }, 300)
  }
}

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
    status?: string | null
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
  replaceMessage: (chatId: string, tempId: string, realMsg: MessageWithSender) => void
  updateMessage: (chatId: string, msg: MessageWithSender) => void
  updateMessageStatus: (chatId: string, status: string, messageId?: string) => void
  markChatMessagesRead: (chatId: string, readerUserId: string) => void
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

  chatFilter: 'all' | 'direct' | 'group' | 'channel' | 'saved'
  setChatFilter: (filter: 'all' | 'direct' | 'group' | 'channel' | 'saved') => void

  // chat settings (pin/mute) helpers
  updateChatListItem: (id: string, patch: Partial<ChatListItem>) => void
  removeChat: (chatId: string) => void
}

export const useChatStore = create<ChatState>((set, _get) => ({
  currentUser: null,
  authLoading: true,
  setCurrentUser: (u) => {
    const safeUser = u ? toSafeUser(u) : null
    if (!safeUser) {
      // Reset all state on logout
      set({
        currentUser: null,
        chats: [],
        messages: {},
        onlineUserIds: new Set(),
        typingUsers: {},
        activeChatId: null,
        activeChat: null,
        isConnected: false,
        messagesLoading: {},
        e2eeEnabled: false,
        infoPanelOpen: false,
        settingsOpen: false,
        connectionsPanelOpen: false,
        chatSearchOpen: false,
        chatSearchQuery: '',
        searchQuery: '',
        chatFilter: 'all',
      })
    } else {
      set({ currentUser: safeUser })
    }
    _scheduleUserPersist(safeUser)
  },
  setAuthLoading: (b) => set({ authLoading: b }),

  chats: [],
  setChats: (c) => {
    const mapped = c.map((chat) => ({
      ...chat,
      members: chat.members.map((m: any) => ({
        ...m,
        user: toSafeUser(m.user),
      })),
    }))
    set({ chats: mapped })
    _scheduleChatPersist(mapped)
  },
  upsertChat: (c) =>
    set((s) => {
      const safeChat = {
        ...c,
        members: c.members.map((m: any) => ({
          ...m,
          user: toSafeUser(m.user),
        })),
      }
      const idx = s.chats.findIndex((x) => x.id === safeChat.id)
      let nextChats = [...s.chats]
      if (idx >= 0) {
        nextChats[idx] = safeChat
      } else {
        nextChats = [safeChat, ...s.chats]
      }
      if (typeof window !== 'undefined') {
        _scheduleChatPersist(nextChats)
      }
      return { chats: nextChats }
    }),
  activeChatId: null,
  setActiveChatId: (id) => set({ activeChatId: id }),
  activeChat: null,
  setActiveChat: (c) =>
    set({
      activeChat: c
        ? {
            ...c,
            members: c.members.map((m) => ({
              ...m,
              user: toSafeUser(m.user),
            })),
          }
        : null,
    }),

  messages: {},
  setMessages: (chatId, msgs) =>
    set((s) => ({ messages: { ...s.messages, [chatId]: msgs } })),
  addMessage: (chatId, msg) =>
    set((s) => {
      const existing = s.messages[chatId] || []
      const dupIdx = existing.findIndex((m) => m.id === msg.id)
      const isDuplicate = dupIdx >= 0
      let nextMessages: MessageWithSender[]
      if (isDuplicate) {
        const prev = existing[dupIdx]
        if (prev.content === msg.content && prev.status === msg.status && prev.deletedAt === msg.deletedAt) {
          nextMessages = existing
        } else {
          nextMessages = existing.map((m) => (m.id === msg.id ? { ...m, ...msg } : m))
        }
      } else {
        nextMessages = [...existing, msg]
      }

      const isIncoming = msg.senderId !== s.currentUser?.id
      const isInactive = s.activeChatId !== chatId

      // Update chat list item lastMessage, unreadCount, and sort to top
      const chatIndex = s.chats.findIndex((c) => c.id === chatId)
      let nextChats = s.chats

      if (chatIndex >= 0) {
        const targetChat = { ...s.chats[chatIndex] }
        targetChat.lastMessage = {
          id: msg.id,
          content: msg.content,
          type: msg.type,
          createdAt: msg.createdAt,
          senderId: msg.senderId,
          senderName: msg.sender?.name || 'User',
          status: msg.status || 'sent',
        }
        if (isIncoming && isInactive && !isDuplicate) {
          targetChat.unreadCount = (targetChat.unreadCount || 0) + 1
        }
        targetChat.updatedAt = msg.createdAt

        // Only recreate the chats array if the chat actually moves to top
        const alreadyAtTop = chatIndex === 0
        if (alreadyAtTop) {
          nextChats = [...s.chats]
          nextChats[0] = targetChat
        } else {
          // Check if this message is newer than the current top chat's last message
          const topChat = s.chats[0]
          const topTimestamp = topChat.lastMessage?.createdAt || topChat.updatedAt || ''
          if (msg.createdAt > topTimestamp) {
            nextChats = [...s.chats]
            nextChats.splice(chatIndex, 1)
            nextChats.unshift(targetChat)
          } else {
            // Position doesn't change, just update the item in place
            nextChats = s.chats.map((c, i) => (i === chatIndex ? targetChat : c))
          }
        }
      }

      if (nextChats !== s.chats && typeof window !== 'undefined') {
        _scheduleChatPersist(nextChats)
      }

      return {
        messages: { ...s.messages, [chatId]: nextMessages },
        chats: nextChats,
      }
    }),
  replaceMessage: (chatId, tempId, realMsg) =>
    set((s) => {
      const existing = s.messages[chatId] || []
      const idx = existing.findIndex((m) => m.id === tempId)
      if (idx >= 0) {
        const next = [...existing]
        next[idx] = realMsg
        return { messages: { ...s.messages, [chatId]: next } }
      }
      if (existing.some((m) => m.id === realMsg.id)) return s
      return { messages: { ...s.messages, [chatId]: [...existing, realMsg] } }
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
  updateMessageStatus: (chatId, status, messageId) =>
    set((s) => {
      const STATUS_PRIORITY: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3 }
      const newPriority = STATUS_PRIORITY[status] ?? 0
      const existing = s.messages[chatId] || []
      let changed = false
      const updatedMsgs = existing.map((m) => {
        const currentPriority = STATUS_PRIORITY[m.status || 'sent'] ?? 0
        if (newPriority <= currentPriority) return m
        if (messageId) {
          if (m.id === messageId) { changed = true; return { ...m, status } }
          return m
        }
        if (m.senderId === s.currentUser?.id && m.status !== 'read') {
          changed = true
          return { ...m, status }
        }
        return m
      })
      let changedChats = false
      const updatedChats = s.chats.map((c) => {
        if (c.id === chatId && c.lastMessage) {
          if (!messageId || c.lastMessage.id === messageId) {
            if (c.lastMessage.status !== status) {
              changedChats = true
              return { ...c, lastMessage: { ...c.lastMessage, status } as any }
            }
          }
        }
        return c
      })
      if (!changed && !changedChats) return s
      return { messages: { ...s.messages, [chatId]: updatedMsgs }, chats: updatedChats }
    }),
  markChatMessagesRead: (chatId, readerUserId) =>
    set((s) => {
      if (!readerUserId) return s
      const existing = s.messages[chatId] || []
      let changed = false
      const updatedMsgs = existing.map((m) => {
        if (m.senderId !== readerUserId && (m.status === 'sent' || m.status === 'delivered')) {
          changed = true
          return { ...m, status: 'read' as const }
        }
        return m
      })
      const updatedChats = s.chats.map((c) => {
        if (c.id === chatId) {
          const lastMsgChanged = c.lastMessage &&
            c.lastMessage.senderId !== readerUserId &&
            (c.lastMessage.status === 'sent' || c.lastMessage.status === 'delivered')
          const newUnread = s.currentUser && readerUserId === s.currentUser.id ? 0 : c.unreadCount
          if (lastMsgChanged || c.unreadCount !== newUnread) {
            changed = true
            const lm = lastMsgChanged ? { ...c.lastMessage, status: 'read' as const } : c.lastMessage
            return { ...c, unreadCount: newUnread, lastMessage: lm as any }
          }
        }
        return c
      })
      if (!changed) return s
      return { messages: { ...s.messages, [chatId]: updatedMsgs }, chats: updatedChats }
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
  setOnlineUserIds: (ids) =>
    set((s) => {
      // skip swap if no actual change (avoids re-render storm from new Set on every broadcast)
      const cur = s.onlineUserIds
      if (cur === ids) return s
      if (cur.size === ids.size) {
        let same = true
        for (const id of ids) {
          if (!cur.has(id)) {
            same = false
            break
          }
        }
        if (same) return s
      }
      return { onlineUserIds: ids }
    }),
  setUserOnline: (userId, online) =>
    set((s) => {
      // no-op if already in desired state (same reason as setOnlineUserIds)
      const cur = s.onlineUserIds
      const already = cur.has(userId)
      if (online && already) return s
      if (!online && !already) return s
      const next = new Set(cur)
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
  setInfoPanelOpen: (b) =>
    set((s) => ({
      infoPanelOpen: b,
      ...(b ? { settingsOpen: false, connectionsPanelOpen: false } : {}),
    })),
  settingsOpen: false,
  setSettingsOpen: (b) =>
    set((s) => ({
      settingsOpen: b,
      ...(b ? { infoPanelOpen: false, connectionsPanelOpen: false } : {}),
    })),
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
  setConnectionsPanelOpen: (b) =>
    set((s) => ({
      connectionsPanelOpen: b,
      ...(b ? { infoPanelOpen: false, settingsOpen: false } : {}),
    })),

  chatFilter: 'all',
  setChatFilter: (filter) => set({ chatFilter: filter }),

  updateChatListItem: (id, patch) =>
    set((s) => {
      const nextChats = s.chats.map((c) => (c.id === id ? { ...c, ...patch } : c))
      _scheduleChatPersist(nextChats)
      return { chats: nextChats }
    }),
  removeChat: (chatId) =>
    set((s) => {
      const nextChats = s.chats.filter((c) => c.id !== chatId)
      const nextMessages = { ...s.messages }
      delete nextMessages[chatId]
      const nextTyping = { ...s.typingUsers }
      delete nextTyping[chatId]
      const nextLoading = { ...s.messagesLoading }
      delete nextLoading[chatId]
      _scheduleChatPersist(nextChats)
      return {
        chats: nextChats,
        messages: nextMessages,
        typingUsers: nextTyping,
        messagesLoading: nextLoading,
        ...(s.activeChatId === chatId ? { activeChatId: null, activeChat: null } : {}),
      }
    }),
}))

export type { ChatListItem }
