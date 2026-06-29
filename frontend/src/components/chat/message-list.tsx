'use client'

import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { useChatStore, EMPTY_MESSAGES, EMPTY_TYPING } from '@/stores/chat-store'
import { MessageItem } from './message-item'
import { ErrorBoundary } from '@/components/error-boundary'
import { formatDateSeparator, sameDay } from '@/lib/format'
import { ArrowDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// fallback when one message's render throws
function MessageErrorFallback() {
  return (
    <div className="my-1 px-3 py-2 max-w-[80%] rounded-2xl bg-muted/40 border border-dashed border-muted-foreground/30 text-xs text-muted-foreground italic">
      This message couldn&apos;t be displayed
    </div>
  )
}

export function MessageList() {
  const activeChatId = useChatStore((s) => s.activeChatId)
  const messages = useChatStore((s) => activeChatId ? (s.messages[activeChatId] || EMPTY_MESSAGES) : EMPTY_MESSAGES)
  const currentUser = useChatStore((s) => s.currentUser)
  const typingUsers = useChatStore((s) => activeChatId ? (s.typingUsers[activeChatId] || EMPTY_TYPING) : EMPTY_TYPING)
  const chats = useChatStore((s) => s.chats)
  const isLoading = useChatStore((s) => activeChatId ? (s.messagesLoading[activeChatId] ?? false) : false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastCountRef = useRef(0)
  const [showScrollBtn, setShowScrollBtn] = useState(false)

  const chatListItem = chats.find((c) => c.id === activeChatId)
  const removeMessage = useChatStore((s) => s.removeMessage)
  const lastReadAt = chatListItem?.lastReadAt ? new Date(chatListItem.lastReadAt).getTime() : 0

  // remove expired messages every second
  const hasExpiring = messages.some(m => m.expiresIn)
  useEffect(() => {
    if (!hasExpiring) return
    const interval = setInterval(() => {
      const now = Date.now()
      for (const msg of messages) {
        if (msg.expiresIn && msg.createdAt) {
          const expiresAt = new Date(msg.createdAt).getTime() + msg.expiresIn * 1000
          if (now >= expiresAt && !msg.deletedAt) {
            if (activeChatId) removeMessage(activeChatId, msg.id)
          }
        }
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [messages, activeChatId, removeMessage, hasExpiring])

  // auto-scroll on new message (only if near bottom)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
    if (messages.length > lastCountRef.current && nearBottom) {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      })
    }
    lastCountRef.current = messages.length
  }, [messages.length])

  // scroll position for the scroll-to-bottom FAB
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowScrollBtn(distFromBottom > 400)
  }, [])

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // grouped by day
  const grouped = useMemo(() => {
    const groups: Array<{ date: string; items: typeof messages }> = []
    for (const m of messages) {
      const last = groups[groups.length - 1]
      if (last && sameDay(last.date, m.createdAt)) {
        last.items.push(m)
      } else {
        groups.push({ date: m.createdAt, items: [m] })
      }
    }
    return groups
  }, [messages])

  if (!activeChatId) return null

  return (
    <div className="flex-1 relative overflow-hidden zc-wallpaper-dots">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto zc-scroll"
      >
        <div className="max-w-3xl mx-auto px-3 sm:px-6 py-4">
          {isLoading ? (
            <MessageSkeleton />
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 18 }}
                className="text-6xl mb-4"
              >
                👋
              </motion.div>
              <p className="text-muted-foreground font-medium">No messages yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Say hello to start the conversation</p>
            </div>
          ) : (
            <>
              <div className="flex justify-center py-3">
                <span className="text-[11px] text-muted-foreground/60 px-3 py-1 rounded-full bg-background/40">
                  Messages are end-to-end real-time ⚡
                </span>
              </div>
              {grouped.map((group, gi) => (
                <div key={gi} className="space-y-0.5">
                  <div className="flex justify-center my-3 sticky top-2 z-10">
                    <span className="px-3 py-1 rounded-full bg-background/90 backdrop-blur text-xs font-medium text-muted-foreground shadow-sm border">
                      {formatDateSeparator(group.date)}
                    </span>
                  </div>
                  {group.items.map((m, i) => {
                    const prev = group.items[i - 1]
                    const next = group.items[i + 1]
                    const isFirstInGroup = !prev || prev.senderId !== m.senderId
                    const isLastInGroup = !next || next.senderId !== m.senderId
                    const msgTime = new Date(m.createdAt).getTime()
                    const showUnreadDivider = lastReadAt > 0 && msgTime > lastReadAt && (!prev || new Date(prev.createdAt).getTime() <= lastReadAt)
                    return (
                      <div
                        key={m.id}
                        // CSS windowing for off-screen messages; intrinsic-size keeps scroll height stable
                        style={{
                          contentVisibility: 'auto',
                          containIntrinsicSize: 'auto 96px',
                        }}
                      >
                        {showUnreadDivider && (
                          <div className="flex items-center gap-2 my-3">
                            <div className="flex-1 h-px bg-primary/30" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-primary px-2">New Messages</span>
                            <div className="flex-1 h-px bg-primary/30" />
                          </div>
                        )}
                      {/* per-message error boundary so one bad message only takes itself out */}
                      <ErrorBoundary fallback={<MessageErrorFallback />}>
                        <MessageItem
                          message={m}
                          isOwn={m.senderId === currentUser?.id}
                          isFirstInGroup={isFirstInGroup}
                          isLastInGroup={isLastInGroup}
                          showAvatar={activeChatId !== undefined}
                        />
                      </ErrorBoundary>
                      </div>
                    )
                  })}
                </div>
              ))}
            </>
          )}

          {/* Typing indicator */}
          {typingUsers.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 px-2 py-2"
            >
              <div className="bg-background border rounded-2xl rounded-bl-md px-4 py-3 shadow-sm flex items-center gap-1">
                <span className="zc-typing-dot h-2 w-2 rounded-full bg-muted-foreground/60" />
                <span className="zc-typing-dot h-2 w-2 rounded-full bg-muted-foreground/60" />
                <span className="zc-typing-dot h-2 w-2 rounded-full bg-muted-foreground/60" />
              </div>
            </motion.div>
          )}

          <div ref={bottomRef} className="h-1" />
        </div>
      </div>

      {/* Scroll-to-bottom FAB */}
      <AnimatePresence>
        {showScrollBtn && (
          <motion.button
            initial={{ opacity: 0, scale: 0.6, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: 10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            onClick={scrollToBottom}
            className="absolute bottom-4 right-4 h-11 w-11 rounded-full bg-background shadow-lg border flex items-center justify-center hover:bg-accent zc-tap"
            title="Scroll to latest"
          >
            <ArrowDown className="h-5 w-5 text-foreground" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

// loading skeleton shown while messages are being fetched
function MessageSkeleton() {
  return (
    <div className="space-y-3 py-4">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className={`flex items-end gap-2 ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
          {i % 2 === 0 && <div className="h-8 w-8 rounded-full bg-muted animate-pulse shrink-0" />}
          <div className={`max-w-[60%] space-y-1.5 ${i % 2 === 0 ? '' : 'items-end'}`}>
            <div className="h-3 w-20 rounded-full bg-muted animate-pulse" />
            <div className="h-12 rounded-2xl bg-muted animate-pulse" style={{ width: `${120 + i * 30}px` }} />
            <div className="h-2 w-12 rounded-full bg-muted/60 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}
