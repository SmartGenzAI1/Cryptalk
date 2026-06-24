'use client'

import { useState } from 'react'
import {
  Phone,
  Video,
  Search,
  Info,
  MoreVertical,
  ArrowLeft,
  Link2,
  LogOut,
  Trash2,
  X,
} from 'lucide-react'
import { useChatStore, EMPTY_MESSAGES, EMPTY_TYPING } from '@/stores/chat-store'
import { ChatAvatar } from './chat-avatar'
import { MessageList } from './message-list'
import { MessageInput } from './message-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { formatLastSeen } from '@/lib/format'
import { searchInChat, leaveChat, deleteChat, generateInviteLink } from '@/lib/actions'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'

export function ChatWindow() {
  const activeChatId = useChatStore((s) => s.activeChatId)
  const activeChat = useChatStore((s) => s.activeChat)
  const chats = useChatStore((s) => s.chats)
  const currentUser = useChatStore((s) => s.currentUser)
  const onlineUserIds = useChatStore((s) => s.onlineUserIds)
  const messages = useChatStore((s) => s.messages[activeChatId] ?? EMPTY_MESSAGES)
  const setActiveChatId = useChatStore((s) => s.setActiveChatId)
  const setActiveChat = useChatStore((s) => s.setActiveChat)
  const setInfoPanelOpen = useChatStore((s) => s.setInfoPanelOpen)
  const infoPanelOpen = useChatStore((s) => s.infoPanelOpen)
  const e2eeEnabled = useChatStore((s) => s.e2eeEnabled)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchIndex, setSearchIndex] = useState(0)

  const otherMember = activeChat?.members.find((m) => m.user.id !== currentUser?.id)
  const otherOnline = otherMember ? onlineUserIds.has(otherMember.user.id) : false
  const subtitle = activeChat
    ? activeChat.type === 'direct'
      ? otherMember
        ? formatLastSeen(otherMember.user.lastSeen, otherOnline)
        : 'Direct chat'
      : activeChat.type === 'saved'
      ? 'Your personal cloud'
      : `${activeChat.members.length} members`
    : ''

  const typingUsers = useChatStore((s) => s.typingUsers[activeChatId] ?? EMPTY_TYPING)
  const typingText =
    typingUsers.length === 0
      ? ''
      : typingUsers.length === 1
      ? `${typingUsers[0].username} is typing…`
      : `${typingUsers.length} people typing…`

  async function handleLeaveChat() {
    if (!activeChatId) return
    if (!confirm(`Leave ${activeChat.title}?`)) return
    try {
      await leaveChat(activeChatId)
      toast.success('Left chat')
      setActiveChatId(null)
      setActiveChat(null)
    } catch (e: any) {
      toast.error(e.message || 'Failed to leave')
    }
  }

  async function handleDeleteChat() {
    if (!activeChatId) return
    if (!confirm(`Delete "${activeChat.title}" permanently? This cannot be undone.`)) return
    try {
      await deleteChat(activeChatId)
      toast.success('Chat deleted')
      setActiveChatId(null)
      setActiveChat(null)
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete')
    }
  }

  async function handleInviteLink() {
    if (!activeChatId) return
    try {
      const data = await generateInviteLink(activeChatId)
      const link = `${window.location.origin}/join/${data.token}`
      navigator.clipboard.writeText(link)
      toast.success('Invite link copied!', { description: link })
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate link')
    }
  }

  async function runSearch(q: string) {
    setSearchQuery(q)
    if (!q.trim() || !activeChatId) {
      setSearchResults([])
      return
    }
    const results = await searchInChat(activeChatId, q)
    setSearchResults(results)
    setSearchIndex(0)
    if (results.length > 0) {
      // scroll to first result
      const el = document.getElementById(`msg-${results[0].id}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  function navigateResults(dir: 'up' | 'down') {
    if (searchResults.length === 0) return
    const next = dir === 'up'
      ? (searchIndex - 1 + searchResults.length) % searchResults.length
      : (searchIndex + 1) % searchResults.length
    setSearchIndex(next)
    const el = document.getElementById(`msg-${searchResults[next].id}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (!activeChat || !activeChatId) {
    return (
      <div className="flex-1 flex items-center justify-center zc-wallpaper-dots">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md px-6"
        >
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className="mx-auto mb-6 h-20 w-20 rounded-3xl overflow-hidden shadow-xl ring-1 ring-border"
          >
            <Image src="/logo-small.png" alt="Cryptalk" width={80} height={80} className="object-contain" />
          </motion.div>
          <h2 className="text-2xl font-bold mb-2 tracking-tight">Welcome to Cryptalk</h2>
          <p className="text-muted-foreground mb-6">
            Select a chat to start messaging, or create a new one. Your conversations are
            end-to-end real-time with presence and typing indicators.
          </p>
          <div className="flex flex-wrap gap-2 justify-center text-xs">
            <span className="px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">⚡ Real-time</span>
            <span className="px-3 py-1.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium">✨ AI Assistant</span>
            <span className="px-3 py-1.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-medium">😊 Reactions</span>
            <span className="px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">🎙️ Voice</span>

          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <header className="flex items-center gap-2 px-3 sm:px-4 h-16 border-b zc-glass shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-9 w-9 zc-tap"
          onClick={() => {
            setActiveChatId(null)
            setActiveChat(null)
          }}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <button
          onClick={() => setInfoPanelOpen(!infoPanelOpen)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <ChatAvatar
            emoji={activeChat.avatarEmoji}
            color={activeChat.avatarColor}
            size="md"
            online={activeChat.type === 'direct' ? otherOnline : undefined}
          />
          <div className="min-w-0">
            <div className="font-semibold truncate flex items-center gap-1.5">
              {activeChat.title}
              {e2eeEnabled && activeChat.type !== 'saved' && (
                <svg className="h-3 w-3 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" title="End-to-end encrypted">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              )}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {typingText ? (
                <span className="text-primary font-medium">{typingText}</span>
              ) : subtitle}
            </div>
          </div>
        </button>

        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-9 w-9 hidden sm:flex zc-tap" title="Voice call" onClick={() => toast.info('Voice calls coming soon')}>
            <Phone className="h-[18px] w-[18px]" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 hidden sm:flex zc-tap" title="Video call" onClick={() => toast.info('Video calls coming soon')}>
            <Video className="h-[18px] w-[18px]" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`h-9 w-9 zc-tap ${searchOpen ? 'bg-accent' : ''}`}
            title="Search in chat"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <Search className="h-[18px] w-[18px]" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`h-9 w-9 zc-tap ${infoPanelOpen ? 'bg-accent' : ''}`}
            title="Chat info"
            onClick={() => setInfoPanelOpen(!infoPanelOpen)}
          >
            <Info className="h-[18px] w-[18px]" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 zc-tap">
                <MoreVertical className="h-[18px] w-[18px]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSearchOpen(true)}>
                <Search className="h-4 w-4 mr-2" />
                Search messages
              </DropdownMenuItem>
              {activeChat.type !== 'saved' && activeChat.type !== 'direct' && (
                <DropdownMenuItem onClick={handleInviteLink}>
                  <Link2 className="h-4 w-4 mr-2" />
                  Invite link
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setInfoPanelOpen(!infoPanelOpen)}>
                <Info className="h-4 w-4 mr-2" />
                View info
              </DropdownMenuItem>
              {activeChat.type !== 'saved' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLeaveChat} className="text-amber-500">
                    <LogOut className="h-4 w-4 mr-2" />
                    Leave {activeChat.type === 'direct' ? 'chat' : activeChat.type}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDeleteChat} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete chat
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* In-chat search bar */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b bg-background/60 backdrop-blur overflow-hidden shrink-0"
          >
            <div className="px-3 py-2 flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                value={searchQuery}
                onChange={(e) => runSearch(e.target.value)}
                placeholder="Search in this chat…"
                className="h-8 border-0 bg-transparent focus-visible:ring-0 px-0"
                autoFocus
              />
              {searchResults.length > 0 && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {searchIndex + 1}/{searchResults.length}
                </span>
              )}
              {searchResults.length > 1 && (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigateResults('up')}>
                    <ArrowLeft className="h-3.5 w-3.5 rotate-90" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigateResults('down')}>
                    <ArrowLeft className="h-3.5 w-3.5 -rotate-90" />
                  </Button>
                </>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults([]) }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <MessageList />

      {/* Input */}
      <MessageInput />
    </div>
  )
}
