'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Search,
  Plus,
  CheckCheck,
  Pin,
  BellOff,
  Mic,
  Image as ImageIcon,
  Sticker,
  MoreVertical,
  PinOff,
  Volume2,
  Check,
} from 'lucide-react'
import { useChatStore, type ChatListItem } from '@/stores/chat-store'
import { ChatAvatar } from './chat-avatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { lazy, Suspense, useCallback, memo } from 'react'
import { formatChatListTime } from '@/lib/format'

const NewChatDialog = lazy(() => import('./new-chat-dialog').then(m => ({ default: m.NewChatDialog })))
import { cn } from '@/lib/utils'
import { updateChatSettings } from '@/lib/actions'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { apiGet, apiPost } from '@/lib/api'
import { getSocket } from '@/hooks/use-socket'

const ChatListItemView = memo(({
  chat,
  index,
  active,
  unreadCount,
  emoji,
  color,
  previewText,
  previewIcon,
  title,
  online,
  currentUser,
  onOpen,
  onHover,
  onLeave,
  onPin,
  onMute,
  onViewInfo,
}: {
  chat: ChatListItem
  index: number
  active: boolean
  unreadCount: number
  emoji: string
  color: string
  previewText: string
  previewIcon: React.ReactNode
  title: string
  online: boolean
  currentUser: any
  onOpen: () => void
  onHover: () => void
  onLeave: () => void
  onPin: () => void
  onMute: () => void
  onViewInfo: () => void
}) => {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.button
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, delay: Math.min(index * 0.02, 0.15), ease: [0.16, 1, 0.3, 1] }}
          onClick={onOpen}
          onMouseEnter={onHover}
          onMouseLeave={onLeave}
          className={cn(
            'w-full flex items-center gap-3 p-2.5 rounded-2xl transition-all duration-200 text-left mb-0.5 zc-tap group',
            active
              ? 'bg-gradient-to-r from-primary/20 to-primary/5 shadow-sm'
              : 'hover:bg-accent/70'
          )}
        >
          <div className="relative">
            <ChatAvatar emoji={emoji} color={color} size="md" online={online} userId={chat.id} eager={index < 5} />
            {chat.muted && (
              <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-muted-foreground flex items-center justify-center border-2 border-background">
                <BellOff className="h-2.5 w-2.5 text-background" />
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className={cn('font-semibold truncate text-[15px]', active && 'text-primary')}>
                {title}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {chat.lastMessage?.senderId === currentUser?.id && chat.lastMessage && (
                  <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />
                )}
                <span className={cn('text-[11px]', unreadCount ? 'text-primary font-bold' : 'text-muted-foreground')}>
                  {chat.lastMessage ? formatChatListTime(chat.lastMessage.createdAt) : ''}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <span className="text-[13px] text-muted-foreground truncate flex items-center gap-1">
                {previewIcon}
                <span className="truncate">{previewText}</span>
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {chat.pinnedAt && unreadCount === 0 && (
                  <Pin className="h-3.5 w-3.5 text-muted-foreground rotate-45" />
                )}
                {unreadCount > 0 && (
                  <span className={cn(
                    'min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center',
                    chat.muted
                      ? 'bg-muted-foreground/40 text-background'
                      : 'bg-primary text-primary-foreground zc-glow'
                  )}>
                    {unreadCount}
                  </span>
                )}
              </div>
            </div>
          </div>
        </motion.button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={onPin}>
          {chat.pinnedAt ? <PinOff className="h-4 w-4 mr-2" /> : <Pin className="h-4 w-4 mr-2 rotate-45" />}
          {chat.pinnedAt ? 'Unpin chat' : 'Pin chat'}
        </ContextMenuItem>
        <ContextMenuItem onClick={onMute}>
          {chat.muted ? <Volume2 className="h-4 w-4 mr-2" /> : <BellOff className="h-4 w-4 mr-2" />}
          {chat.muted ? 'Unmute' : 'Mute notifications'}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onViewInfo}>
          <MoreVertical className="h-4 w-4 mr-2" /> View info
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}, (prev, next) => {
  return (
    prev.active === next.active &&
    prev.index === next.index &&
    prev.unreadCount === next.unreadCount &&
    prev.emoji === next.emoji &&
    prev.color === next.color &&
    prev.previewText === next.previewText &&
    prev.title === next.title &&
    prev.online === next.online &&
    prev.currentUser === next.currentUser &&
    prev.chat.title === next.chat.title &&
    prev.chat.avatarEmoji === next.chat.avatarEmoji &&
    prev.chat.avatarColor === next.chat.avatarColor &&
    prev.chat.muted === next.chat.muted &&
    prev.chat.pinnedAt === next.chat.pinnedAt &&
    prev.chat.lastMessage?.id === next.chat.lastMessage?.id &&
    prev.chat.lastMessage?.content === next.chat.lastMessage?.content &&
    prev.chat.lastMessage?.createdAt === next.chat.lastMessage?.createdAt
  )
})

export function ChatList() {
  const chats = useChatStore((s) => s.chats)
  const activeChatId = useChatStore((s) => s.activeChatId)
  const setActiveChatId = useChatStore((s) => s.setActiveChatId)
  const setActiveChat = useChatStore((s) => s.setActiveChat)
  const setInfoPanelOpen = useChatStore((s) => s.setInfoPanelOpen)
  const onlineUserIds = useChatStore((s) => s.onlineUserIds)
  const currentUser = useChatStore((s) => s.currentUser)
  const searchQuery = useChatStore((s) => s.searchQuery)
  const setSearchQuery = useChatStore((s) => s.setSearchQuery)
  const setMessages = useChatStore((s) => s.setMessages)
  const setMessagesLoading = useChatStore((s) => s.setMessagesLoading)
  const updateChatListItem = useChatStore((s) => s.updateChatListItem)
  const [newChatOpen, setNewChatOpen] = useState(false)

  // debounce search input: local value for instant feedback, store value committed after 200ms
  const [searchInput, setSearchInput] = useState(searchQuery)
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchQuery !== searchInput) setSearchQuery(searchInput)
    }, 200)
    return () => clearTimeout(t)
  }, [searchInput, searchQuery, setSearchQuery])

  const filtered = chats.filter((c) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    if (c.title.toLowerCase().includes(q)) return true
    if (c.type === 'direct') {
      const other = c.members.find((m) => m.user.id !== currentUser?.id)
      if (other && other.user.name.toLowerCase().includes(q)) return true
    }
    if (c.lastMessage?.content.toLowerCase().includes(q)) return true
    return false
  })

  const pinned = filtered.filter((c) => c.pinnedAt)
  const regular = filtered.filter((c) => !c.pinnedAt)

  function getDisplayTitle(chat: ChatListItem): string {
    if (chat.type === 'saved') return 'Saved Messages'
    if (chat.type === 'direct') {
      const other = chat.members.find((m) => m.user.id !== currentUser?.id)
      return other?.user.name || chat.title
    }
    return chat.title
  }

  function getDisplayEmoji(chat: ChatListItem): { emoji: string; color: string } {
    if (chat.type === 'saved') return { emoji: '🔖', color: 'emerald' }
    if (chat.type === 'direct') {
      const other = chat.members.find((m) => m.user.id !== currentUser?.id)
      return { emoji: other?.user.avatarEmoji || chat.avatarEmoji, color: other?.user.avatarColor || chat.avatarColor }
    }
    return { emoji: chat.avatarEmoji, color: chat.avatarColor }
  }

  function isOnline(chat: ChatListItem): boolean {
    if (chat.type === 'direct') {
      const other = chat.members.find((m) => m.user.id !== currentUser?.id)
      return other ? onlineUserIds.has(other.user.id) : false
    }
    return false
  }

  function getPreview(chat: ChatListItem) {
    if (!chat.lastMessage) return { text: chat.type === 'channel' ? 'Channel' : chat.type === 'group' ? 'Group' : 'No messages yet', icon: null }
    const lm = chat.lastMessage
    const prefix = chat.type === 'group' && lm.senderId !== currentUser?.id ? `${lm.senderName.split(' ')[0]}: ` : (lm.senderId === currentUser?.id ? 'You: ' : '')
    if (lm.type === 'sticker') return { text: `${prefix}Sticker`, icon: <Sticker className="h-3.5 w-3.5" /> }
    if (lm.type === 'image') return { text: `${prefix}Photo`, icon: <ImageIcon className="h-3.5 w-3.5" /> }
    if (lm.type === 'voice') return { text: `${prefix}Voice ${lm.duration ? `${lm.duration}s` : ''}`, icon: <Mic className="h-3.5 w-3.5" /> }
    return { text: prefix + lm.content, icon: null }
  }

  // prefetch messages on hover >300ms; reads store lazily to avoid re-renders
  const prefetchTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  function schedulePrefetch(chat: ChatListItem) {
    if (prefetchTimers.current.has(chat.id)) return
    const cur = useChatStore.getState().messages[chat.id]
    if (cur && cur.length > 0) return
    const t = setTimeout(() => {
      prefetchTimers.current.delete(chat.id)
      void prefetchChat(chat)
    }, 300)
    prefetchTimers.current.set(chat.id, t)
  }
  function cancelPrefetch(chatId: string) {
    const t = prefetchTimers.current.get(chatId)
    if (t) {
      clearTimeout(t)
      prefetchTimers.current.delete(chatId)
    }
  }
  useEffect(() => {
    const timers = prefetchTimers.current
    return () => {
      timers.forEach((t) => clearTimeout(t))
      timers.clear()
    }
  }, [])
  async function prefetchChat(chat: ChatListItem) {
    // abort if user switched to a different chat (null = still here, preserves hover-prefetch)
    const chatId = chat.id
    const switchedAway = () => {
      const a = useChatStore.getState().activeChatId
      return a !== null && a !== chatId
    }
    const cur = useChatStore.getState().messages[chatId]
    if (cur && cur.length > 0) return
    try {
      // 1. try IndexedDB cache first (instant)
      const { loadCachedMessages } = await import('@/lib/message-cache')
      const cached = await loadCachedMessages(chatId)
      const storeNow = useChatStore.getState().messages[chatId]
      if (storeNow && storeNow.length > 0) return
      if (cached.length > 0) {
        if (switchedAway()) return
        useChatStore.getState().setMessages(chatId, cached)
      }
      // 2. background-fetch latest from server (no loading state, no toast)
      const data = await apiGet<{ messages: any[] }>(`/api/${chatId}/messages?limit=50`)
      if (!data.messages) return
      if (switchedAway()) return
      const storeAfter = useChatStore.getState().messages[chatId]
      if (storeAfter && storeAfter.length > 0 && cached.length > 0) return
      try {
        const { decryptMessageForChat } = await import('@/lib/e2ee')
        const decrypted = await Promise.all(
          data.messages.map(async (m) => {
            if (m.type === 'text' && m.content) {
              try {
                m.content = await decryptMessageForChat(m.content, chatId, chat.type)
              } catch {
                // keep ciphertext
              }
            }
            return m
          })
        )
        if (switchedAway()) return
        useChatStore.getState().setMessages(chatId, decrypted)
        const { cacheMessages } = await import('@/lib/message-cache')
        cacheMessages(chatId, decrypted)
      } catch {
        if (switchedAway()) return
        useChatStore.getState().setMessages(chatId, data.messages)
      }
    } catch {
      // silent — prefetch is best-effort
    }
  }

  async function openChat(chat: ChatListItem) {
    setActiveChatId(chat.id)
    setInfoPanelOpen(false)
    setMessagesLoading(chat.id, true)

    // 1. show cached messages instantly (< 200ms)
    try {
      const { loadCachedMessages } = await import('@/lib/message-cache')
      const cached = await loadCachedMessages(chat.id)
      if (cached.length > 0) {
        setMessages(chat.id, cached)
        setMessagesLoading(chat.id, false)
      }
    } catch {
      // cache miss — will show loading skeleton
    }

    try {
      // 2. fetch latest from server (background sync)
      const data = await apiGet<{ messages: any[] }>(`/api/${chat.id}/messages?limit=50`)
      if (data.messages) {
        // e2ee: decrypt text messages before storing
        try {
          const { decryptMessageForChat } = await import('@/lib/e2ee')
          const decrypted = await Promise.all(
            data.messages.map(async (m) => {
              if (m.type === 'text' && m.content) {
                try {
                  m.content = await decryptMessageForChat(m.content, chat.id, chat.type)
                } catch {
                  // keep ciphertext (e.g. no key yet)
                }
              }
              return m
            })
          )
          setMessages(chat.id, decrypted)

          // 3. cache decrypted messages for next time
          const { cacheMessages } = await import('@/lib/message-cache')
          cacheMessages(chat.id, decrypted)
        } catch {
          // e2ee not ready — store as-is
          setMessages(chat.id, data.messages)
        }

        // 4. mark messages as delivered (recipient opened the chat)
        if (chat.type !== 'saved') {
          // surface errors so delivery receipts don't silently break
          apiPost(`/api/${chat.id}/messages/delivered`).catch((e) =>
            console.warn('mark_delivered failed:', e)
          )
          getSocket()?.emit('message-status', {
            chatId: chat.id,
            status: 'delivered',
          })
        }
      }
      updateChatListItem(chat.id, { unreadCount: 0 })
      setActiveChat({
        id: chat.id,
        type: chat.type as any,
        title: getDisplayTitle(chat),
        description: chat.description,
        avatarColor: getDisplayEmoji(chat).color,
        avatarEmoji: getDisplayEmoji(chat).emoji,
        createdBy: chat.createdBy,
        createdAt: chat.createdAt,
        members: chat.members,
      })
    } catch (e) {
      console.error('failed to load messages', e)
    } finally {
      setMessagesLoading(chat.id, false)
    }
  }

  async function togglePin(chat: ChatListItem) {
    const newValue = !chat.pinnedAt
    updateChatListItem(chat.id, { pinnedAt: newValue ? new Date().toISOString() : null })
    try {
      await updateChatSettings(chat.id, 'pin', newValue)
      toast.success(newValue ? 'Chat pinned' : 'Chat unpinned')
    } catch {
      updateChatListItem(chat.id, { pinnedAt: newValue ? null : new Date().toISOString() })
    }
  }

  async function toggleMute(chat: ChatListItem) {
    const newValue = !chat.muted
    updateChatListItem(chat.id, { muted: newValue })
    try {
      await updateChatSettings(chat.id, 'mute', newValue)
      toast.success(newValue ? 'Chat muted' : 'Chat unmuted')
    } catch {
      updateChatListItem(chat.id, { muted: !newValue })
    }
  }

  // renderChat function replaced by memoized ChatListItemView component

  return (
    <div className="w-full sm:w-[340px] md:w-[360px] shrink-0 flex flex-col border-r bg-sidebar/60 zc-glass-sidebar">
      <div className="p-3 space-y-3 border-b bg-background/40">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold flex-1 tracking-tight">Chats</h1>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full zc-tap" title="New chat" onClick={() => setNewChatOpen(true)}>
            <Plus className="h-5 w-5" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search chats & messages"
            className="pl-9 h-10 bg-background rounded-full border-0 focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 zc-scroll">
        <div className="p-1.5">
          {filtered.length === 0 ? (
            <div className="text-center py-20 px-6 text-muted-foreground">
              <div className="text-5xl mb-3">💬</div>
              <p className="text-sm">
                {searchQuery ? 'No chats match your search.' : 'No chats yet. Tap + to start one.'}
              </p>
            </div>
          ) : (
            <>
              {pinned.length > 0 && (
                <div className="mb-1">
                  <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Pin className="h-3 w-3 rotate-45" /> Pinned
                  </div>
                  {pinned.map((c, i) => (
                    <ChatListItemView
                      key={c.id}
                      chat={c}
                      index={i}
                      active={c.id === activeChatId}
                      unreadCount={c.unreadCount || 0}
                      emoji={getDisplayEmoji(c).emoji}
                      color={getDisplayEmoji(c).color}
                      previewText={getPreview(c).text}
                      previewIcon={getPreview(c).icon}
                      title={getDisplayTitle(c)}
                      online={isOnline(c)}
                      currentUser={currentUser}
                      onOpen={() => openChat(c)}
                      onHover={() => schedulePrefetch(c)}
                      onLeave={() => cancelPrefetch(c.id)}
                      onPin={() => togglePin(c)}
                      onMute={() => toggleMute(c)}
                      onViewInfo={() => { openChat(c); setInfoPanelOpen(true); }}
                    />
                  ))}
                </div>
              )}
              {regular.length > 0 && pinned.length > 0 && (
                <div className="mx-3 my-1 border-t border-border/60" />
              )}
              {regular.length > 0 && (
                <div>
                  {pinned.length > 0 && (
                    <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      All chats
                    </div>
                  )}
                  {regular.map((c, i) => (
                    <ChatListItemView
                      key={c.id}
                      chat={c}
                      index={i + pinned.length}
                      active={c.id === activeChatId}
                      unreadCount={c.unreadCount || 0}
                      emoji={getDisplayEmoji(c).emoji}
                      color={getDisplayEmoji(c).color}
                      previewText={getPreview(c).text}
                      previewIcon={getPreview(c).icon}
                      title={getDisplayTitle(c)}
                      online={isOnline(c)}
                      currentUser={currentUser}
                      onOpen={() => openChat(c)}
                      onHover={() => schedulePrefetch(c)}
                      onLeave={() => cancelPrefetch(c.id)}
                      onPin={() => togglePin(c)}
                      onMute={() => toggleMute(c)}
                      onViewInfo={() => { openChat(c); setInfoPanelOpen(true); }}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {newChatOpen && (
        <Suspense fallback={null}>
          <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} />
        </Suspense>
      )}
    </div>
  )
}
