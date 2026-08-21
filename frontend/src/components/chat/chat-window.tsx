'use client'

import { useState, useEffect, useRef } from 'react'
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
import { VoiceCallModal } from './voice-call-modal'
import { getSocket } from '@/hooks/use-socket'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'

export function ChatWindow() {
  const activeChatId = useChatStore((s) => s.activeChatId)
  const activeChat = useChatStore((s) => s.activeChat)
  const chats = useChatStore((s) => s.chats)
  const currentUser = useChatStore((s) => s.currentUser)
  const onlineUserIds = useChatStore((s) => s.onlineUserIds)
  const messages = useChatStore((s) => activeChatId ? (s.messages[activeChatId] || EMPTY_MESSAGES) : EMPTY_MESSAGES)
  const setActiveChatId = useChatStore((s) => s.setActiveChatId)
  const setActiveChat = useChatStore((s) => s.setActiveChat)
  const setInfoPanelOpen = useChatStore((s) => s.setInfoPanelOpen)
  const infoPanelOpen = useChatStore((s) => s.infoPanelOpen)
  const e2eeEnabled = useChatStore((s) => s.e2eeEnabled)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchIndex, setSearchIndex] = useState(0)

  const [callModalOpen, setCallModalOpen] = useState(false)
  const [isIncomingCall, setIsIncomingCall] = useState(false)
  const [incomingCallOffer, setIncomingCallOffer] = useState<any>(null)
  const [isVideoCall, setIsVideoCall] = useState(false)

  function handleStartVoiceCall() {
    if (!activeChat || activeChat.type !== 'direct') {
      toast.info('Voice calls supported in direct chats')
      return
    }
    setIsVideoCall(false)
    setIsIncomingCall(false)
    setIncomingCallOffer(null)
    setCallModalOpen(true)
  }

  function handleStartVideoCall() {
    if (!activeChat || activeChat.type !== 'direct') {
      toast.info('Video calls supported in direct chats')
      return
    }
    setIsVideoCall(true)
    setIsIncomingCall(false)
    setIncomingCallOffer(null)
    setCallModalOpen(true)
  }

  const otherMember = activeChat?.members.find((m) => m.user.id !== currentUser?.id)
  const otherOnline = otherMember ? onlineUserIds.has(otherMember.user.id) : false
  const subtitle = activeChat
    ? activeChat.type === 'direct'
      ? otherMember
        ? otherOnline
          ? 'Online'
          : formatLastSeen(otherMember.user.lastSeen, false)
        : 'Direct chat'
      : activeChat.type === 'saved'
      ? 'Your personal cloud'
      : `${activeChat.members.length} members`
    : ''

  const typingUsers = useChatStore((s) => activeChatId ? (s.typingUsers[activeChatId] || EMPTY_TYPING) : EMPTY_TYPING)
  const typingText =
    typingUsers.length === 0
      ? ''
      : typingUsers.length === 1
      ? `${typingUsers[0].username} is typing…`
      : `${typingUsers.length} people typing…`

  // Send mark-read notification when opening or viewing the chat window
  // Debounced: fires once on chat open, then at most every 5 seconds
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastMarkReadRef = useRef<string | null>(null)

  useEffect(() => {
    if (!activeChatId || !currentUser) return
    let cancelled = false

    // Reset tracking when switching chats
    if (lastMarkReadRef.current !== activeChatId) {
      lastMarkReadRef.current = activeChatId
      // Fire immediately on chat open
      import('@/lib/api').then(({ apiPost }) => {
        if (!cancelled) apiPost(`/api/chats/${activeChatId}/mark-read`).catch(() => {})
      })
      import('@/hooks/use-socket').then(({ getSocket }) => {
        if (!cancelled) getSocket()?.emit('message-status', { chatId: activeChatId, status: 'read' })
      })
      return () => { cancelled = true }
    }

    // For subsequent messages in same chat, debounce to at most every 5s
    if (markReadTimerRef.current) return () => { cancelled = true }
    markReadTimerRef.current = setTimeout(() => {
      markReadTimerRef.current = null
      if (!cancelled) {
        import('@/lib/api').then(({ apiPost }) => {
          if (!cancelled) apiPost(`/api/chats/${activeChatId}/mark-read`).catch(() => {})
        })
        import('@/hooks/use-socket').then(({ getSocket }) => {
          if (!cancelled) getSocket()?.emit('message-status', { chatId: activeChatId, status: 'read' })
        })
      }
    }, 5000)

    return () => {
      cancelled = true
      if (markReadTimerRef.current) {
        clearTimeout(markReadTimerRef.current)
        markReadTimerRef.current = null
      }
    }
  }, [activeChatId, currentUser, messages.length])

  async function handleLeaveChat() {
    if (!activeChatId || !activeChat) return
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
    if (!activeChatId || !activeChat) return
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
    if (!activeChatId || !activeChat) return
    try {
      const data = await generateInviteLink(activeChatId)
      let hash = ''
      if (activeChat.type !== 'direct' && activeChat.type !== 'saved') {
        const { loadGroupKey } = await import('@/lib/key-store')
        const { toBase64 } = await import('@/lib/crypto')
        const keyBytes = await loadGroupKey(activeChatId)
        if (keyBytes) {
          hash = `#groupKey=${toBase64(keyBytes)}`
        }
      }
      const link = `${window.location.origin}/join/${data.token}${hash}`
      navigator.clipboard.writeText(link)
      toast.success('Invite link copied!', { description: link })
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate link')
    }
  }

  // debounce the actual server call 250ms; query commits instantly for input feedback
  function runSearch(q: string) {
    setSearchQuery(q)
    if (!q.trim() || !activeChatId) {
      setSearchResults([])
      setSearchIndex(0)
    }
  }

  useEffect(() => {
    if (!activeChatId) return
    const q = searchQuery.trim()
    // empty-query case handled in runSearch; bailing here avoids the set-state-in-effect rule
    if (!q) return
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const results = await searchInChat(activeChatId, q)
        if (cancelled) return
        setSearchResults(results)
        setSearchIndex(0)
        if (results.length > 0) {
          const el = document.getElementById(`msg-${results[0].id}`)
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      } catch (e) {
        if (!cancelled) console.warn('in-chat search failed:', e)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [searchQuery, activeChatId])

  // Close search on Escape key globally
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false)
        setSearchQuery('')
        setSearchResults([])
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchOpen])

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
      <div className="flex-1 flex flex-col items-center justify-center zc-wallpaper-dots p-6 select-none relative overflow-y-auto">
        <div className="absolute h-96 w-96 rounded-full bg-emerald-500/10 dark:bg-emerald-500/15 blur-3xl animate-pulse pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className="text-center max-w-lg px-8 py-10 rounded-3xl bg-card/85 dark:bg-card/75 backdrop-blur-2xl border border-border/60 shadow-2xl relative z-10"
        >
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className="mx-auto mb-6 h-24 w-24 rounded-3xl p-3 bg-background/80 border border-emerald-500/20 shadow-xl flex items-center justify-center"
          >
            <Image src="/logo.png" alt="Cryptalk" width={96} height={96} className="object-contain drop-shadow-md" priority />
          </motion.div>
          <h2 className="text-3xl font-extrabold mb-3 tracking-tight bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500 bg-clip-text text-transparent">
            Welcome to Cryptalk
          </h2>
          <p className="text-sm text-muted-foreground mb-8 leading-relaxed max-w-sm mx-auto">
            Select a conversation from the sidebar or click <span className="font-semibold text-foreground">+</span> to start a private chat, group, or channel.
          </p>
          <div className="grid grid-cols-2 gap-2.5 text-xs text-left">
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-accent/40 border border-border/50">
              <span className="text-base">🔒</span>
              <div>
                <div className="font-bold text-foreground">End-to-End E2EE</div>
                <div className="text-[10px] text-muted-foreground">Zero-knowledge keys</div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-accent/40 border border-border/50">
              <span className="text-base">⚡</span>
              <div>
                <div className="font-bold text-foreground">Real-Time Sync</div>
                <div className="text-[10px] text-muted-foreground">Instant WebSocket delivery</div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-accent/40 border border-border/50">
              <span className="text-base">🎙️</span>
              <div>
                <div className="font-bold text-foreground">Voice Notes</div>
                <div className="text-[10px] text-muted-foreground">HD voice messaging</div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-accent/40 border border-border/50">
              <span className="text-base">😊</span>
              <div>
                <div className="font-bold text-foreground">Reactions & Stickers</div>
                <div className="text-[10px] text-muted-foreground">Animated Telegram emojis</div>
              </div>
            </div>
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
          className="md:hidden h-9 w-9 zc-tap focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Back to conversations"
          onClick={() => {
            setActiveChatId(null)
            setActiveChat(null)
          }}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <button
          onClick={() => setInfoPanelOpen(!infoPanelOpen)}
          aria-label={`Chat details for ${activeChat.title}`}
          className="flex items-center gap-3 flex-1 min-w-0 text-left rounded-xl p-1 -ml-1 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
                <svg className="h-3 w-3 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <title>End-to-end encrypted</title>
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              )}
            </div>
            <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
              {typingText ? (
                <span className="text-primary font-medium animate-pulse">{typingText}</span>
              ) : otherOnline && activeChat.type === 'direct' ? (
                <span className="text-emerald-500 font-medium flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  Online
                </span>
              ) : (
                subtitle
              )}
            </div>
          </div>
        </button>

        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 hidden sm:flex zc-tap focus-visible:ring-2 focus-visible:ring-primary"
            title="Voice call"
            aria-label="Start voice call"
            onClick={handleStartVoiceCall}
          >
            <Phone className="h-[18px] w-[18px]" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 hidden sm:flex zc-tap focus-visible:ring-2 focus-visible:ring-primary"
            title="Video call"
            aria-label="Start video call"
            onClick={handleStartVideoCall}
          >
            <Video className="h-[18px] w-[18px]" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`h-9 w-9 zc-tap focus-visible:ring-2 focus-visible:ring-primary ${searchOpen ? 'bg-accent' : ''}`}
            title="Search in chat"
            aria-label="Search in chat"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <Search className="h-[18px] w-[18px]" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`h-9 w-9 zc-tap focus-visible:ring-2 focus-visible:ring-primary ${infoPanelOpen ? 'bg-accent' : ''}`}
            title="Chat info"
            aria-label="Toggle chat details"
            onClick={() => setInfoPanelOpen(!infoPanelOpen)}
          >
            <Info className="h-[18px] w-[18px]" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 zc-tap focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="More chat options"
              >
                <MoreVertical className="h-[18px] w-[18px]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSearchOpen(true)}>
                <Search className="h-4 w-4 mr-2" />
                Search messages
              </DropdownMenuItem>
              {activeChat.type === 'direct' && (
                <>
                  <DropdownMenuItem onClick={handleStartVoiceCall} className="sm:hidden">
                    <Phone className="h-4 w-4 mr-2" />
                    Voice call
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleStartVideoCall} className="sm:hidden">
                    <Video className="h-4 w-4 mr-2" />
                    Video call
                  </DropdownMenuItem>
                </>
              )}
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
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setSearchOpen(false)
                    setSearchQuery('')
                    setSearchResults([])
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    navigateResults(e.shiftKey ? 'up' : 'down')
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    navigateResults('down')
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    navigateResults('up')
                  }
                }}
                placeholder="Search in this chat… (Esc to close)"
                aria-label="Search in this chat"
                className="h-8 border-0 bg-transparent focus-visible:ring-0 px-0 text-sm"
                autoFocus
              />
              {searchResults.length > 0 && (
                <span className="text-xs text-muted-foreground whitespace-nowrap" aria-live="polite">
                  {searchIndex + 1}/{searchResults.length}
                </span>
              )}
              {searchResults.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label="Previous search result"
                    onClick={() => navigateResults('up')}
                  >
                    <ArrowLeft className="h-3.5 w-3.5 rotate-90" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label="Next search result"
                    onClick={() => navigateResults('down')}
                  >
                    <ArrowLeft className="h-3.5 w-3.5 -rotate-90" />
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Close search"
                onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults([]) }}
              >
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

      {/* Voice Call Modal */}
      <VoiceCallModal
        open={callModalOpen}
        onClose={() => setCallModalOpen(false)}
        chat={activeChat}
        currentUser={currentUser}
        isIncoming={isIncomingCall}
        incomingOfferData={incomingCallOffer}
        isVideoCall={isVideoCall}
      />
    </div>
  )
}
