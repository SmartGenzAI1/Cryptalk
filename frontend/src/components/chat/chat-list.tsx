'use client'

import { useState } from 'react'
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
import { lazy, Suspense } from 'react'
import { formatChatListTime } from '@/lib/format'

const NewChatDialog = lazy(() => import('./new-chat-dialog').then(m => ({ default: m.NewChatDialog })))
import { cn } from '@/lib/utils'
import { updateChatSettings } from '@/lib/actions'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { apiGet, apiPost } from '@/lib/api'
import { getSocket } from '@/hooks/use-socket'

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

  async function openChat(chat: ChatListItem) {
    setActiveChatId(chat.id)
    setInfoPanelOpen(false)
    setMessagesLoading(chat.id, true)

    // 1. Show cached messages instantly (< 200ms) for instant sync
    try {
      const { loadCachedMessages } = await import('@/lib/message-cache')
      const cached = await loadCachedMessages(chat.id)
      if (cached.length > 0) {
        setMessages(chat.id, cached)
        setMessagesLoading(chat.id, false) // hide loading skeleton immediately
      }
    } catch {
      // cache not ready — will show loading skeleton
    }

    try {
      // 2. Fetch latest from server (background sync)
      const data = await apiGet<{ messages: any[] }>(`/api/${chat.id}/messages?limit=50`)
      if (data.messages) {
        // E2EE: decrypt all text messages before storing in state
        try {
          const { decryptMessageForChat } = await import('@/lib/e2ee')
          const decrypted = await Promise.all(
            data.messages.map(async (m) => {
              if (m.type === 'text' && m.content) {
                try {
                  m.content = await decryptMessageForChat(m.content, chat.id, chat.type)
                } catch {
                  // keep ciphertext if decryption fails (e.g., no key yet)
                }
              }
              return m
            })
          )
          setMessages(chat.id, decrypted)

          // 3. Cache decrypted messages for instant sync next time
          const { cacheMessages } = await import('@/lib/message-cache')
          cacheMessages(chat.id, decrypted)
        } catch {
          // E2EE not ready — store as-is
          setMessages(chat.id, data.messages)
        }

        // 4. Mark messages as delivered (recipient opened the chat)
        if (chat.type !== 'saved') {
          apiPost(`/api/${chat.id}/messages/delivered`).catch(() => {})
          // Broadcast delivery status via socket
          getSocket()?.emit('message-status', {
            chatId: chat.id,
            status: 'delivered',
          })
        }
      }
      // clear unread
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

  function renderChat(chat: ChatListItem, index: number) {
    const active = chat.id === activeChatId
    const unread = chat.unreadCount || 0
    const { emoji, color } = getDisplayEmoji(chat)
    const preview = getPreview(chat)
    return (
      <ContextMenu key={chat.id}>
        <ContextMenuTrigger asChild>
          <motion.button
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: Math.min(index * 0.02, 0.15), ease: [0.16, 1, 0.3, 1] }}
            onClick={() => openChat(chat)}
            className={cn(
              'w-full flex items-center gap-3 p-2.5 rounded-2xl transition-all duration-200 text-left mb-0.5 zc-tap group',
              active
                ? 'bg-gradient-to-r from-primary/20 to-primary/5 shadow-sm'
                : 'hover:bg-accent/70'
            )}
          >
            <div className="relative">
              <ChatAvatar emoji={emoji} color={color} size="md" online={isOnline(chat)} />
              {chat.muted && (
                <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-muted-foreground flex items-center justify-center border-2 border-background">
                  <BellOff className="h-2.5 w-2.5 text-background" />
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={cn('font-semibold truncate text-[15px]', active && 'text-primary')}>
                  {getDisplayTitle(chat)}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {chat.lastMessage?.senderId === currentUser?.id && chat.lastMessage && (
                    <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />
                  )}
                  <span className={cn('text-[11px]', unread ? 'text-primary font-bold' : 'text-muted-foreground')}>
                    {chat.lastMessage ? formatChatListTime(chat.lastMessage.createdAt) : ''}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className="text-[13px] text-muted-foreground truncate flex items-center gap-1">
                  {preview.icon}
                  <span className="truncate">{preview.text}</span>
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {chat.pinnedAt && unread === 0 && (
                    <Pin className="h-3.5 w-3.5 text-muted-foreground rotate-45" />
                  )}
                  {unread > 0 && (
                    <span className={cn(
                      'min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center',
                      chat.muted
                        ? 'bg-muted-foreground/40 text-background'
                        : 'bg-primary text-primary-foreground zc-glow'
                    )}>
                      {unread}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuItem onClick={() => togglePin(chat)}>
            {chat.pinnedAt ? <PinOff className="h-4 w-4 mr-2" /> : <Pin className="h-4 w-4 mr-2 rotate-45" />}
            {chat.pinnedAt ? 'Unpin chat' : 'Pin chat'}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => toggleMute(chat)}>
            {chat.muted ? <Volume2 className="h-4 w-4 mr-2" /> : <BellOff className="h-4 w-4 mr-2" />}
            {chat.muted ? 'Unmute' : 'Mute notifications'}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => { openChat(chat); setInfoPanelOpen(true) }}>
            <MoreVertical className="h-4 w-4 mr-2" /> View info
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
  }

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
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
                  {pinned.map((c, i) => renderChat(c, i))}
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
                  {regular.map((c, i) => renderChat(c, i + pinned.length))}
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
