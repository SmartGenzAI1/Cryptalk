'use client'

import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useChatStore } from '@/stores/chat-store'
import type { MessageWithSender } from '@/lib/types'

let socket: Socket | null = null

export function getSocket(): Socket | null {
  return socket
}

// socket auth happens at connect time via the tc_session cookie (httponly so
// JS can't read it, but the browser sends it with withCredentials)
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
  const setCurrentUser = useChatStore((s) => s.setCurrentUser)
  const initialised = useRef(false)

  useEffect(() => {
    if (!currentUser || initialised.current) return
    initialised.current = true

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || ''
    const socketUrl = backendUrl
      ? backendUrl
      : `/?XTransformPort=${process.env.NEXT_PUBLIC_BACKEND_PORT || '8001'}`
    const token = typeof window !== 'undefined' ? localStorage.getItem('tc_token') : null
    socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      auth: token ? { token } : undefined,
      withCredentials: true,
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 10000,
    })

    socket.on('connect', () => {
      setConnected(true)
      // no identify emit — auth happened at connect via the cookie
    })

    socket.on('disconnect', () => {
      setConnected(false)
    })

    // backend rejected cookie: force re-login so user gets a fresh cookie
    socket.on('auth-error', (data: { message?: string } | undefined) => {
      console.warn('[socket] auth-error:', data?.message || 'unauthorized')
      try {
        socket?.removeAllListeners()
        socket?.disconnect()
      } catch {}
      socket = null
      initialised.current = false
      setConnected(false)
      setCurrentUser(null)
      if (typeof window !== 'undefined') {
        window.location.assign('/')
      }
    })

    socket.on('presence', (data: { users: { userId: string; username: string; isOnline: boolean }[] }) => {
      setOnlineUserIds(new Set(data.users.map((u) => u.userId)))
    })

    socket.on('user-status', (data: { userId: string; isOnline: boolean }) => {
      setUserOnline(data.userId, data.isOnline)
    })

    socket.on('message', async (data: { chatId: string; message: MessageWithSender }) => {
      // decrypt incoming E2EE message before adding to store
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
        // e2ee not ready or decryption failed — show ciphertext
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
      if (data.message) {
        updateMessage(data.chatId, data.message)
      }
    })

    socket.on('recording', (data: { chatId: string; userId: string; username: string; isRecording: boolean }) => {
      // reuse typing display as the voice-recording indicator
      if (data.isRecording) {
        addTyping(data.chatId, { userId: data.userId, username: data.username })
      } else {
        removeTyping(data.chatId, data.userId)
      }
    })

    socket.on('reaction', (data: { chatId: string; messageId: string; emoji: string; userId: string; added: boolean }) => {
      // handled in component via store refresh; lightweight update here
      updateReactionInStore(data.chatId, data.messageId, data.emoji, data.userId, data.added)
    })

    socket.on('typing', (data: { chatId: string; userId: string; username: string; isTyping: boolean }) => {
      if (data.isTyping) addTyping(data.chatId, { userId: data.userId, username: data.username })
      else removeTyping(data.chatId, data.userId)
    })

    socket.on('chat-updated', async (data: { chat: any }) => {
      if (data.chat.chatKey) {
        try {
          const { decryptAndStoreChatKeys } = await import('@/lib/e2ee')
          await decryptAndStoreChatKeys([data.chat])
        } catch (e) {
          console.warn('Failed to decrypt group key on chat-updated:', e)
        }
      }
      upsertChat({
        ...data.chat,
        lastReadAt: data.chat.lastReadAt || new Date().toISOString(),
        lastMessage: data.chat.lastMessage || null,
      })
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

    return () => {
      if (socket) {
        socket.removeAllListeners()
        socket.disconnect()
        socket = null
      }
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

// mutate reactions in store (kept simple)
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
