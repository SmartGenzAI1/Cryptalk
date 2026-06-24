'use client'

import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useChatStore } from '@/stores/chat-store'
import type { MessageWithSender } from '@/lib/types'

let socket: Socket | null = null

export function getSocket(): Socket | null {
  return socket
}

export function useSocket() {
  const currentUser = useChatStore((s) => s.currentUser)
  const addMessage = useChatStore((s) => s.addMessage)
  const updateMessage = useChatStore((s) => s.updateMessage)
  const removeMessage = useChatStore((s) => s.removeMessage)
  const setOnlineUserIds = useChatStore((s) => s.setOnlineUserIds)
  const setUserOnline = useChatStore((s) => s.setUserOnline)
  const addTyping = useChatStore((s) => s.addTyping)
  const removeTyping = useChatStore((s) => s.removeTyping)
  const activeChatId = useChatStore((s) => s.activeChatId)
  const upsertChat = useChatStore((s) => s.upsertChat)
  const setActiveChat = useChatStore((s) => s.setActiveChat)
  const setConnected = useChatStore((s) => s.setConnected)
  const initialised = useRef(false)

  useEffect(() => {
    if (!currentUser || initialised.current) return
    initialised.current = true

    socket = io(`/?XTransformPort=${process.env.NEXT_PUBLIC_BACKEND_PORT || '8001'}`, {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 10000,
    })

    socket.on('connect', () => {
      setConnected(true)
      socket?.emit('identify', { userId: currentUser.id, username: currentUser.username })
    })

    socket.on('disconnect', () => {
      setConnected(false)
    })

    socket.on('presence', (data: { users: { userId: string; username: string; isOnline: boolean }[] }) => {
      setOnlineUserIds(new Set(data.users.map((u) => u.userId)))
    })

    socket.on('user-status', (data: { userId: string; isOnline: boolean }) => {
      setUserOnline(data.userId, data.isOnline)
    })

    socket.on('message', async (data: { chatId: string; message: MessageWithSender }) => {
      // E2EE: decrypt incoming message before adding to store
      try {
        const { decryptMessageForChat } = await import('@/lib/e2ee')
        const store = useChatStore.getState()
        const chat = store.chats.find((c) => c.id === data.chatId)
        const chatType = chat?.type || store.activeChat?.type || 'direct'
        if (data.message.type === 'text' && data.message.content) {
          data.message.content = await decryptMessageForChat(
            data.message.content,
            data.chatId,
            chatType
          )
        }
      } catch {
        // E2EE not ready or decryption failed — show ciphertext
      }
      addMessage(data.chatId, data.message)
    })

    socket.on('message-update', (data: { chatId: string; message: MessageWithSender; action: 'edit' | 'delete' }) => {
      if (data.action === 'delete') {
        removeMessage(data.chatId, data.message.id)
      } else {
        updateMessage(data.chatId, data.message)
      }
    })

    socket.on('message-status', (data: { chatId: string; messageId: string; status: string; message?: MessageWithSender }) => {
      // Update message delivery/read status in real-time
      if (data.message) {
        updateMessage(data.chatId, data.message)
      }
    })

    socket.on('recording', (data: { chatId: string; userId: string; username: string; isRecording: boolean }) => {
      // Voice recording indicator — reuse typing display
      if (data.isRecording) {
        addTyping(data.chatId, { userId: data.userId, username: data.username })
      } else {
        removeTyping(data.chatId, data.userId)
      }
    })

    socket.on('reaction', (data: { chatId: string; messageId: string; emoji: string; userId: string; added: boolean }) => {
      // handled in component via store refresh; trigger a lightweight update
      updateReactionInStore(data.chatId, data.messageId, data.emoji, data.userId, data.added)
    })

    socket.on('typing', (data: { chatId: string; userId: string; username: string; isTyping: boolean }) => {
      if (data.isTyping) addTyping(data.chatId, { userId: data.userId, username: data.username })
      else removeTyping(data.chatId, data.userId)
    })

    socket.on('chat-updated', (data: { chat: any }) => {
      // upsert chat list item; if active chat, refresh
      upsertChat({
        ...data.chat,
        lastReadAt: data.chat.lastReadAt || new Date().toISOString(),
        lastMessage: data.chat.lastMessage || null,
      })
      // if it's the active chat, also refresh activeChat
      const state = useChatStore.getState()
      const prev = state.activeChat
      if (prev && prev.id === data.chat.id) {
        state.setActiveChat({
          ...prev,
          ...data.chat,
          members: data.chat.members || prev.members,
        } as any)
      }
    })

    socket.on('disconnect', () => {
      // keep store; will reconnect
    })

    return () => {
      socket?.disconnect()
      socket = null
      initialised.current = false
    }
  }, [currentUser])

  // join/leave chat room when activeChatId changes
  useEffect(() => {
    if (!socket || !currentUser) return
    if (activeChatId) {
      socket.emit('join-chat', { chatId: activeChatId })
    }
  }, [activeChatId, currentUser])
}

// helper to mutate reactions in store (kept simple)
function updateReactionInStore(chatId: string, messageId: string, emoji: string, userId: string, added: boolean) {
  const store = useChatStore.getState()
  const msgs = store.messages[chatId]
  if (!msgs) return
  const updated = msgs.map((m) => {
    if (m.id !== messageId) return m
    let reactions = m.reactions
    if (added) {
      const me = store.currentUser
      if (me && !reactions.some((r) => r.emoji === emoji && r.user.id === userId)) {
        reactions = [...reactions, { id: 'tmp-' + Date.now(), emoji, user: me }]
      }
    } else {
      reactions = reactions.filter((r) => !(r.emoji === emoji && r.user.id === userId))
    }
    return { ...m, reactions }
  })
  store.setMessages(chatId, updated)
}
