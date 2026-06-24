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
  FileIcon,
  Loader2,
  FileWarning,
} from 'lucide-react'
import { fetchAndDecryptAttachment } from '@/lib/attachments'
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
import { toggleReaction, toggleStar } from '@/lib/actions'
import { motion, AnimatePresence } from 'framer-motion'
import { lazy, Suspense } from 'react'
import { apiGet, apiPatch, apiDelete } from '@/lib/api'
import { isAnimatedSticker } from '@/lib/animated-stickers'

const ForwardDialog = lazy(() => import('./forward-dialog').then(m => ({ default: m.ForwardDialog })))
const AnimatedStickerDisplay = lazy(() => import('./animated-sticker').then(m => ({ default: m.AnimatedStickerDisplay })))

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

  // Attachment resolution state — for image / file / voice messages the
  // `content` field may be an encrypted URL (Supabase path), an encrypted
  // data URL (dev fallback), or the literal "[delivered]" placeholder after
  // the server wipes content post-delivery. We resolve it asynchronously.
  const [attachment, setAttachment] = useState<{
    status: 'loading' | 'ready' | 'delivered' | 'error'
    dataUrl: string | null
  }>({ status: 'loading', dataUrl: null })

  const isDeleted = !!message.deletedAt
  const isSystem = message.type === 'system'
  const isVoice = message.type === 'voice'
  const isSticker = message.type === 'sticker'
  const isImage = message.type === 'image'
  const isFile = message.type === 'file'

  // Resolve attachment content for image / file / voice messages.
  // Deps are intentionally limited to message.id + message.content (stable
  // across re-renders of the memoized component) plus the chat type which
  // is needed for E2EE decryption.
  const chatType = activeChat?.type || 'direct'
  useEffect(() => {
    if (!isImage && !isFile && !isVoice) return
    let cancelled = false

    async function resolve() {
      const raw = message.content
      if (!raw) {
        if (!cancelled) setAttachment({ status: 'error', dataUrl: null })
        return
      }
      // Fast-path: server wiped content after delivery confirmation
      if (raw === '[delivered]') {
        if (!cancelled) setAttachment({ status: 'delivered', dataUrl: null })
        return
      }
      try {
        let resolved = raw
        // If content isn't already a URL or data URL, it's an encrypted
        // ciphertext JSON string — decrypt it first.
        if (
          !resolved.startsWith('http://') &&
          !resolved.startsWith('https://') &&
          !resolved.startsWith('data:')
        ) {
          const { decryptMessageForChat } = await import('@/lib/e2ee')
          resolved = await decryptMessageForChat(resolved, message.chatId, chatType)
        }

        if (cancelled) return

        if (resolved === '[delivered]') {
          setAttachment({ status: 'delivered', dataUrl: null })
          return
        }
        if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
          // Supabase-stored attachment — fetch ciphertext bytes & decrypt
          const dataUrl = await fetchAndDecryptAttachment(resolved, message.chatId, chatType)
          if (!cancelled) setAttachment({ status: 'ready', dataUrl })
        } else if (resolved.startsWith('data:')) {
          // Dev fallback — content is already the decrypted data URL
          if (!cancelled) setAttachment({ status: 'ready', dataUrl: resolved })
        } else {
          // Legacy plaintext (no E2EE) — treat as data URL if it looks like one,
          // otherwise mark as error.
          if (!cancelled) setAttachment({ status: 'ready', dataUrl: resolved })
        }
      } catch {
        if (!cancelled) setAttachment({ status: 'error', dataUrl: null })
      }
    }

    resolve()
    return () => { cancelled = true }
  }, [message.id, message.content, message.chatId, chatType, isImage, isFile, isVoice])

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

  async function handleDelete(forEveryone: boolean = false) {
    try {
      await apiDelete(`/api/${message.chatId}/messages?messageId=${message.id}${forEveryone ? '&forEveryone=true' : ''}`)
      removeMessage(message.chatId, message.id)
      getSocket()?.emit('message-update', {
        chatId: message.chatId,
        message: { ...message, deletedAt: new Date().toISOString(), content: '🗑️ Message deleted' },
        action: 'delete',
      })
      toast.success(forEveryone ? 'Deleted for everyone' : 'Message deleted')
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

  const audioRef = useRef<HTMLAudioElement | null>(null)

  function togglePlay() {
    if (playing) {
      setPlaying(false)
      audioRef.current?.pause()
      return
    }

    const audioContent = attachment.status === 'ready' ? attachment.dataUrl : null

    if (!audioContent) {
      if (attachment.status === 'delivered') {
        toast.error('Voice message no longer available')
      } else if (attachment.status === 'error') {
        toast.error('Could not load voice message')
      } else {
        toast.error('Voice message is still loading…')
      }
      return
    }

    if (!audioContent.startsWith('data:audio')) {
      // legacy voice message (no actual audio) — simulate playback
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
      return
    }

    const audio = new Audio(audioContent)
    audioRef.current = audio
    audio.onended = () => {
      setPlaying(false)
      setProgress(0)
    }
    audio.ontimeupdate = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100)
      }
    }
    audio.play()
    setPlaying(true)
  }

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
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
                  <ChatAvatar emoji={message.sender.avatarEmoji} color={message.sender.avatarColor} size="sm" userId={message.sender.id} />
                )}
              </div>
            )}

            <div className={cn('relative max-w-[85%] sm:max-w-[65%] min-w-0 flex flex-col', isOwn ? 'items-end' : 'items-start')}>
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
                  isAnimatedSticker(message.content) ? (
                    <Suspense fallback={<span className="text-6xl leading-none">⭐</span>}>
                      <AnimatedStickerDisplay name={message.content} size={140} />
                    </Suspense>
                  ) : isLegacyEmoji(message.content) ? (
                    <span className="text-6xl leading-none">{message.content}</span>
                  ) : (
                    <img
                      src={stickerIconUrl(message.content)}
                      alt={message.content}
                      width={128}
                      height={128}
                      loading="lazy"
                      className="object-contain"
                    />
                  )
                ) : isImage ? (
                  attachment.status === 'delivered' ? (
                    <AttachmentPlaceholder text="Image no longer available (delivered & wiped)" />
                  ) : attachment.status === 'loading' ? (
                    <AttachmentLoading label="Loading image…" />
                  ) : attachment.status === 'error' ? (
                    <AttachmentPlaceholder text="Failed to load image" isError />
                  ) : attachment.dataUrl && attachment.dataUrl.startsWith('data:image') ? (
                    <img
                      src={attachment.dataUrl}
                      alt="shared"
                      loading="lazy"
                      className="rounded-lg max-w-[280px] max-h-[280px] object-contain cursor-pointer"
                      onClick={() => attachment.dataUrl && window.open(attachment.dataUrl, '_blank')}
                    />
                  ) : (
                    <AttachmentPlaceholder text="Unsupported image format" isError />
                  )
                ) : isFile ? (
                  attachment.status === 'delivered' ? (
                    <AttachmentPlaceholder text="File no longer available (delivered & wiped)" />
                  ) : attachment.status === 'loading' ? (
                    <AttachmentLoading label="Loading file…" />
                  ) : attachment.status === 'error' ? (
                    <AttachmentPlaceholder text="Failed to load file" isError />
                  ) : (
                    <div className="flex items-center gap-2 min-w-[200px]">
                      <a
                        href={attachment.dataUrl || '#'}
                        download={attachment.dataUrl ? 'file' : undefined}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/10 hover:bg-black/20 transition-colors"
                      >
                        <FileIcon className="h-5 w-5" />
                        <span className="text-sm">Download file</span>
                      </a>
                    </div>
                  )
                ) : isVoice ? (
                  attachment.status === 'delivered' ? (
                    <AttachmentPlaceholder text="Voice message no longer available (delivered & wiped)" />
                  ) : attachment.status === 'error' ? (
                    <AttachmentPlaceholder text="Failed to load voice message" isError />
                  ) : (
                    <VoiceBubble
                      duration={message.duration || 5}
                      playing={playing}
                      progress={progress}
                      onToggle={togglePlay}
                      isOwn={isOwn}
                      time={formatTime(message.createdAt)}
                      loading={attachment.status === 'loading'}
                    />
                  )
                ) : (
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {message.content}
                      </div>
                    )}

                {/* Meta */}
                {!editing && !isVoice && !isSticker && !isImage && !isFile && (
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
              <ContextMenuItem onClick={() => handleDelete(false)} className="text-muted-foreground">
                <Trash2 className="h-4 w-4 mr-2" /> Delete for me
              </ContextMenuItem>
              <ContextMenuItem onClick={() => handleDelete(true)} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" /> Delete for everyone
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

export const MessageItem = memo(MessageItemImpl, (prev, next) => {
  // Custom comparator: skip re-render when nothing visual changed.
  // Compares message identity + the small set of fields that affect the
  // rendered output. Avoids re-rendering the whole list when an unrelated
  // store slice (e.g. typing indicators, online users) changes.
  //
  // Reactions and sender are compared by reference — the Zustand store always
  // allocates new arrays/objects on updates (see updateMessage /
  // updateReactionInStore), so a reference change reliably signals a real
  // content change. This avoids the length-only pitfall (e.g. swap 👍 for ❤️
  // keeps length identical but visually differs).
  const pm = prev.message
  const nm = next.message
  return (
    pm === nm ||
    (pm.id === nm.id &&
      pm.content === nm.content &&
      pm.status === nm.status &&
      pm.type === nm.type &&
      pm.deletedAt === nm.deletedAt &&
      pm.editedAt === nm.editedAt &&
      pm.duration === nm.duration &&
      pm.expiresIn === nm.expiresIn &&
      pm.senderId === nm.senderId &&
      pm.sender === nm.sender &&
      pm.reactions === nm.reactions &&
      pm.replyTo === nm.replyTo &&
      prev.isOwn === next.isOwn &&
      prev.isFirstInGroup === next.isFirstInGroup &&
      prev.isLastInGroup === next.isLastInGroup &&
      prev.showAvatar === next.showAvatar)
  )
})

// Voice message bubble with waveform + play button
function VoiceBubble({
  duration,
  playing,
  progress,
  onToggle,
  isOwn,
  time,
  loading = false,
}: {
  duration: number
  playing: boolean
  progress: number
  onToggle: () => void
  isOwn: boolean
  time: string
  loading?: boolean
}) {
  const bars = Math.min(Math.max(Math.floor(duration * 2), 12), 40)
  return (
    <div className="flex items-center gap-2.5 min-w-[180px] py-0.5">
      <button
        onClick={onToggle}
        disabled={loading}
        className={cn(
          'h-9 w-9 rounded-full flex items-center justify-center shrink-0 zc-tap',
          isOwn ? 'bg-white/20' : 'bg-primary',
          loading && 'opacity-60'
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : playing ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4 ml-0.5" />
        )}
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
          <span>{loading ? '…' : playing ? `${Math.ceil(duration * (1 - progress / 100))}s` : `${duration}s`}</span>
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

// Attachment loading spinner (shown while fetching + decrypting from Supabase)
function AttachmentLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-3 px-4 min-w-[180px]">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

// Placeholder for attachments that have been wiped (post-delivery) or failed to load
function AttachmentPlaceholder({ text, isError = false }: { text: string; isError?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-2.5 px-3 min-w-[200px] max-w-[280px]">
      {isError ? (
        <FileWarning className="h-4 w-4 shrink-0 text-muted-foreground" />
      ) : (
        <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <span className="text-xs text-muted-foreground italic truncate">{text}</span>
    </div>
  )
}
