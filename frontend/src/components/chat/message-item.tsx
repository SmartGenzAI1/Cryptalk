'use client'

import { memo, useState, useRef, useEffect } from 'react'
import {
  Reply,
  Smile,
  Pencil,
  Trash2,
  Copy,

  Check,
  CheckCheck,
  Clock,
  Star,
  Forward,
  Play,
  Pause,
  Pin,
} from 'lucide-react'
import { useChatStore } from '@/stores/chat-store'
import { MessageWithSender, stickerIconUrl, isLegacyEmoji } from '@/lib/icons'
import { ChatAvatar } from './chat-avatar'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu'
import { toast } from 'sonner'
import { formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { getSocket } from '@/hooks/use-socket'
import { toggleReaction, toggleStar, forwardMessage } from '@/lib/actions'
import { motion, AnimatePresence } from 'framer-motion'
import { lazy, Suspense } from 'react'
import { apiGet, apiPatch, apiDelete } from '@/lib/api'

const ForwardDialog = lazy(() => import('./forward-dialog').then(m => ({ default: m.ForwardDialog })))

const QUICK_REACTIONS = ['👍', '❤️', '🔥', '😂', '😮', '🎉', '👏', '🙏']

interface MessageItemProps {
  message: MessageWithSender
  isOwn: boolean
  isFirstInGroup: boolean
  isLastInGroup: boolean
  showAvatar: boolean
}

function MessageItemImpl({ message, isOwn, isFirstInGroup, isLastInGroup }: MessageItemProps) {
  const currentUser = useChatStore((s) => s.currentUser)
  const activeChat = useChatStore((s) => s.activeChat)
  const updateMessage = useChatStore((s) => s.updateMessage)
  const removeMessage = useChatStore((s) => s.removeMessage)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(message.content)
  const [starred, setStarred] = useState(false)
  const [showHoverBar, setShowHoverBar] = useState(false)
  const [showQuickReact, setShowQuickReact] = useState(false)
  const [forwardOpen, setForwardOpen] = useState(false)
  // voice playback
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const playTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const isDeleted = !!message.deletedAt
  const isSystem = message.type === 'system'
  const isVoice = message.type === 'voice'
  const isSticker = message.type === 'sticker'

  // reaction grouped by emoji
  const reactionGroups = message.reactions.reduce<Record<string, { count: number; mine: boolean }>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, mine: false }
    acc[r.emoji].count++
    if (r.user.id === currentUser?.id) acc[r.emoji].mine = true
    return acc
  }, {})

  async function handleReact(emoji: string) {
    try {
      const data = await toggleReaction(message.chatId, message.id, emoji)
      getSocket()?.emit('reaction', {
        chatId: message.chatId,
        messageId: message.id,
        emoji,
        userId: currentUser?.id,
        added: data.added,
      })
      // locally refresh this message reactions
      const refreshed = await apiGet<{ messages: any[] }>(`/api/${message.chatId}/messages?limit=200`)
      if (refreshed.messages) {
        const m = refreshed.messages.find((x: any) => x.id === message.id)
        if (m) updateMessage(message.chatId, m)
      }
      setShowQuickReact(false)
    } catch (e) {
      console.error(e)
    }
  }

  async function handleEdit() {
    if (!editText.trim()) return
    try {
      const data = await apiPatch<{ message: any }>(`/api/${message.chatId}/messages?messageId=${message.id}`, {
        content: editText.trim(),
      })
      if (data.message) {
        updateMessage(message.chatId, data.message)
        getSocket()?.emit('message-update', { chatId: message.chatId, message: data.message, action: 'edit' })
      }
      setEditing(false)
    } catch (e) {
      console.error(e)
    }
  }

  async function handleDelete() {
    try {
      await apiDelete(`/api/${message.chatId}/messages?messageId=${message.id}`)
      removeMessage(message.chatId, message.id)
      getSocket()?.emit('message-update', {
        chatId: message.chatId,
        message: { ...message, deletedAt: new Date().toISOString(), content: '🗑️ Message deleted' },
        action: 'delete',
      })
      toast.success('Message deleted')
    } catch (e) {
      console.error(e)
    }
  }

  async function handleStar() {
    try {
      const data = await toggleStar(message.chatId, message.id)
      setStarred(data.starred)
      toast.success(data.starred ? 'Added to starred' : 'Removed from starred')
    } catch (e) {
      console.error(e)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(message.content)
    toast.success('Copied to clipboard')
  }

  function startReply() {
    window.dispatchEvent(new CustomEvent('zc-reply', { detail: message }))
  }

  // voice playback simulation
  function togglePlay() {
    if (playing) {
      setPlaying(false)
      if (playTimer.current) clearInterval(playTimer.current)
      return
    }
    setPlaying(true)
    const duration = message.duration || 5
    const step = 100 / (duration * 10)
    playTimer.current = setInterval(() => {
      setProgress((p) => {
        const next = p + step
        if (next >= 100) {
          setPlaying(false)
          if (playTimer.current) clearInterval(playTimer.current)
          return 0
        }
        return next
      })
    }, 100)
  }

  useEffect(() => {
    return () => {
      if (playTimer.current) clearInterval(playTimer.current)
    }
  }, [])

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="px-3 py-1 rounded-full bg-background/80 backdrop-blur text-xs text-muted-foreground border">
          {message.content}
        </span>
      </div>
    )
  }

  const HoverActions = (
    <AnimatePresence>
      {showHoverBar && !editing && !isDeleted && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85 }}
          transition={{ duration: 0.15 }}
          className={cn(
            'absolute top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-background/95 backdrop-blur rounded-full shadow-lg border p-0.5 z-20',
            isOwn ? '-left-1' : '-right-1'
          )}
          onMouseLeave={() => setShowHoverBar(false)}
        >
          <button onClick={() => setShowQuickReact((v) => !v)} className="h-7 w-7 rounded-full hover:bg-accent flex items-center justify-center" title="React">
            <Smile className="h-4 w-4" />
          </button>
          <button onClick={startReply} className="h-7 w-7 rounded-full hover:bg-accent flex items-center justify-center" title="Reply">
            <Reply className="h-4 w-4" />
          </button>
          <button onClick={() => setForwardOpen(true)} className="h-7 w-7 rounded-full hover:bg-accent flex items-center justify-center" title="Forward">
            <Forward className="h-4 w-4" />
          </button>
          <button onClick={handleStar} className="h-7 w-7 rounded-full hover:bg-accent flex items-center justify-center" title="Star">
            <Star className={cn('h-4 w-4', starred && 'fill-amber-400 text-amber-400')} />
          </button>
          {isOwn && (
            <button onClick={() => { setEditing(true); setEditText(message.content) }} className="h-7 w-7 rounded-full hover:bg-accent flex items-center justify-center" title="Edit">
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn('group relative flex items-end gap-2 px-1', isOwn ? 'justify-end' : 'justify-start', isLastInGroup ? 'mb-2' : 'mb-0.5')}
            onMouseEnter={() => setShowHoverBar(true)}
            onMouseLeave={() => { setShowHoverBar(false); setShowQuickReact(false) }}
          >
            {!isOwn && (
              <div className="w-8 shrink-0">
                {isLastInGroup && (
                  <ChatAvatar emoji={message.sender.avatarEmoji} color={message.sender.avatarColor} size="sm" />
                )}
              </div>
            )}

            <div className={cn('relative max-w-[75%] sm:max-w-[65%] flex flex-col', isOwn ? 'items-end' : 'items-start')}>
              {!isOwn && isFirstInGroup && activeChat?.type !== 'direct' && activeChat?.type !== 'saved' && (
                <span className="text-xs font-bold ml-1 mb-0.5 text-primary">
                  {message.sender.name}
                </span>
              )}

              {HoverActions}

              {/* Quick react popover */}
              <AnimatePresence>
                {showQuickReact && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className={cn(
                      'absolute -top-11 bg-background/95 backdrop-blur rounded-full shadow-lg border p-1 flex items-center gap-0.5 z-30',
                      isOwn ? 'right-0' : 'left-0'
                    )}
                  >
                    {QUICK_REACTIONS.map((e) => (
                      <button
                        key={e}
                        onClick={() => handleReact(e)}
                        className="h-8 w-8 rounded-full hover:bg-accent hover:scale-125 transition-all flex items-center justify-center text-lg"
                      >
                        {e}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div
                layout
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                className={cn(
                  'relative rounded-2xl px-3.5 py-2 shadow-sm',
                  isOwn
                    ? 'bg-gradient-to-br from-primary to-primary text-primary-foreground rounded-br-md'
                    : 'bg-background border rounded-bl-md',
                  isDeleted && 'opacity-60 italic',
                  starred && 'ring-1 ring-amber-400/50'
                )}
              >
                {/* Reply preview */}
                {message.replyTo && (
                  <div className={cn('mb-1.5 pl-2 border-l-2 text-xs', isOwn ? 'border-white/50' : 'border-primary')}>
                    <div className={cn('font-semibold', isOwn ? 'text-white/90' : 'text-primary')}>
                      {message.replyTo.senderName}
                    </div>
                    <div className={cn('truncate max-w-[200px]', isOwn ? 'text-white/75' : 'text-muted-foreground')}>
                      {message.replyTo.content}
                    </div>
                  </div>
                )}

                {editing ? (
                  <div className="min-w-[200px]">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className={cn(
                        'w-full bg-transparent outline-none resize-none text-sm',
                        isOwn ? 'placeholder-white/60' : ''
                      )}
                      rows={2}
                      autoFocus
                    />
                    <div className="flex justify-end gap-1 mt-1">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditing(false); setEditText(message.content) }}>
                        Cancel
                      </Button>
                      <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={handleEdit}>
                        Save
                      </Button>
                    </div>
                  </div>
                ) : isSticker ? (
                  isLegacyEmoji(message.content) ? (
                    <span className="text-6xl leading-none">{message.content}</span>
                  ) : (
                    <img
                      src={stickerIconUrl(message.content)}
                      alt={message.content}
                      width={128}
                      height={128}
                      className="object-contain"
                    />
                  )
                ) : isVoice ? (
                  <VoiceBubble
                    duration={message.duration || 5}
                    playing={playing}
                    progress={progress}
                    onToggle={togglePlay}
                    isOwn={isOwn}
                    time={formatTime(message.createdAt)}
                  />
                ) : (
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {message.content}
                      </div>
                    )}

                {/* Meta */}
                {!editing && !isVoice && !isSticker && (
                  <div className={cn('flex items-center gap-1 justify-end mt-0.5 -mb-0.5 text-[10px]', isOwn ? 'text-white/75' : 'text-muted-foreground')}>
                    {starred && <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />}
                    {message.editedAt && <span>edited</span>}
                    {message.expiresIn && <Clock className="h-2.5 w-2.5" />}
                    <span>{formatTime(message.createdAt)}</span>
                    {isOwn && !isDeleted && <DeliveryTicks status={message.status || 'sent'} />}
                  </div>
                )}
              </motion.div>

              {/* Reactions */}
              {Object.keys(reactionGroups).length > 0 && (
                <div className={cn('flex flex-wrap gap-1 mt-1', isOwn ? 'justify-end' : 'justify-start')}>
                  {Object.entries(reactionGroups).map(([emoji, info]) => (
                    <motion.button
                      key={emoji}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                      onClick={() => handleReact(emoji)}
                      className={cn(
                        'flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-colors zc-tap',
                        info.mine
                          ? 'bg-primary/15 border-primary text-primary'
                          : 'bg-background border-border hover:bg-accent'
                      )}
                    >
                      <span>{emoji}</span>
                      <span className="font-medium">{info.count}</span>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-52">
          <ContextMenuItem onClick={handleCopy}>
            <Copy className="h-4 w-4 mr-2" /> Copy
          </ContextMenuItem>
          <ContextMenuItem onClick={startReply}>
            <Reply className="h-4 w-4 mr-2" /> Reply
          </ContextMenuItem>
          <ContextMenuItem onClick={handleStar}>
            <Star className={cn('h-4 w-4 mr-2', starred && 'fill-amber-400 text-amber-400')} />
            {starred ? 'Unstar' : 'Star'}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setForwardOpen(true)}>
            <Forward className="h-4 w-4 mr-2" /> Forward
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Smile className="h-4 w-4 mr-2" /> React
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-auto p-2">
              <div className="grid grid-cols-4 gap-1">
                {QUICK_REACTIONS.map((e) => (
                  <button
                    key={e}
                    onClick={() => handleReact(e)}
                    className="h-9 w-9 rounded-lg hover:bg-accent hover:scale-110 transition-all flex items-center justify-center text-xl"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </ContextMenuSubContent>
          </ContextMenuSub>
          {isOwn && !isDeleted && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => { setEditing(true); setEditText(message.content) }}>
                <Pencil className="h-4 w-4 mr-2" /> Edit
              </ContextMenuItem>
              <ContextMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {forwardOpen && (
        <Suspense fallback={null}>
          <ForwardDialog
            open={forwardOpen}
            onOpenChange={setForwardOpen}
            messageId={message.id}
          />
        </Suspense>
      )}
    </>
  )
}

export const MessageItem = memo(MessageItemImpl)

// Voice message bubble with waveform + play button
function VoiceBubble({
  duration,
  playing,
  progress,
  onToggle,
  isOwn,
  time,
}: {
  duration: number
  playing: boolean
  progress: number
  onToggle: () => void
  isOwn: boolean
  time: string
}) {
  const bars = Math.min(Math.max(Math.floor(duration * 2), 12), 40)
  return (
    <div className="flex items-center gap-2.5 min-w-[180px] py-0.5">
      <button
        onClick={onToggle}
        className={cn(
          'h-9 w-9 rounded-full flex items-center justify-center shrink-0 zc-tap',
          isOwn ? 'bg-white/20' : 'bg-primary'
        )}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>
      <div className="flex-1">
        <div className="flex items-center gap-[2px] h-6">
          {Array.from({ length: bars }).map((_, i) => {
            const filled = (i / bars) * 100 < progress
            const h = 30 + Math.abs(Math.sin(i * 1.7)) * 70
            return (
              <div
                key={i}
                className={cn(
                  'flex-1 rounded-full transition-colors',
                  filled ? (isOwn ? 'bg-white' : 'bg-primary') : (isOwn ? 'bg-white/40' : 'bg-muted-foreground/40'),
                  playing && filled && 'zc-wave-bar'
                )}
                style={{ height: `${h}%`, animationDelay: `${i * 0.05}s` }}
              />
            )
          })}
        </div>
        <div className={cn('flex items-center justify-between text-[10px] mt-1', isOwn ? 'text-white/75' : 'text-muted-foreground')}>
          <span>{playing ? `${Math.ceil(duration * (1 - progress / 100))}s` : `${duration}s`}</span>
          <span>{time}</span>
        </div>
      </div>
    </div>
  )
}

// Delivery status ticks: ✓ sent, ✓✓ delivered, ✓✓ read (blue)
function DeliveryTicks({ status }: { status: string }) {
  if (status === 'read') {
    return <CheckCheck className="h-3 w-3 text-sky-400" />
  }
  if (status === 'delivered') {
    return <CheckCheck className="h-3 w-3" />
  }
  // sent (single check)
  return <Check className="h-3 w-3" />
}
