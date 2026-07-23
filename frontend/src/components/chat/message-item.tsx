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
  Eye,
  Download,
  FileText,
  Video,
  Music,
  Maximize2,
  X,
} from 'lucide-react'
import { fetchAndDecryptAttachment } from '@/lib/attachments'
import { useChatStore } from '@/stores/chat-store'
import type { MessageWithSender } from '@/lib/types'
import { stickerIconUrl, isLegacyEmoji } from '@/lib/icons'
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
import { isAnimatedSticker, getAnimatedEmojiCodepoint, getAnimatedEmojisForText } from '@/lib/animated-stickers'

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
  const [readMoreExpanded, setReadMoreExpanded] = useState(false)
  const textContent = message.content || ''
  // sync starred state from server without useEffect (React 19 pattern)
  const [starred, setStarred] = useState(() => !!message.starred)
  const [prevStarred, setPrevStarred] = useState(message.starred)
  if (message.starred !== prevStarred) {
    setPrevStarred(message.starred)
    setStarred(!!message.starred)
  }
  const [showHoverBar, setShowHoverBar] = useState(false)
  const [showQuickReact, setShowQuickReact] = useState(false)
  const [forwardOpen, setForwardOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const playTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const [previewModal, setPreviewModal] = useState<{ url: string; name: string; type: 'image' | 'video' | 'pdf' | 'file' } | null>(null)

  // content may be an encrypted URL, encrypted data URL, or "[delivered]" placeholder
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
  const animatedEmojiCodepoints = (!isDeleted && message.type === 'text') ? getAnimatedEmojisForText(message.content) : null
  const hasAnimatedEmojis = !!(animatedEmojiCodepoints && animatedEmojiCodepoints.length > 0)

  // deps limited to message.id + content + chatType (stable across re-renders)
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
      // server wiped content after delivery confirmation
      if (raw === '[delivered]') {
        if (!cancelled) setAttachment({ status: 'delivered', dataUrl: null })
        return
      }
      try {
        let resolved = raw
        // decrypt ciphertext first if it's not already a URL/data URL
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
          // supabase-stored — fetch ciphertext bytes and decrypt
          const dataUrl = await fetchAndDecryptAttachment(resolved, message.chatId, chatType)
          if (!cancelled) setAttachment({ status: 'ready', dataUrl })
        } else if (resolved.startsWith('data:')) {
          // dev fallback — content is already the decrypted data URL
          if (!cancelled) setAttachment({ status: 'ready', dataUrl: resolved })
        } else {
          if (!cancelled) setAttachment({ status: 'ready', dataUrl: resolved })
        }
      } catch {
        if (!cancelled) setAttachment({ status: 'error', dataUrl: null })
      }
    }

    resolve()
    return () => { cancelled = true }
  }, [message.id, message.content, message.chatId, chatType, isImage, isFile, isVoice])

  // reactions grouped by emoji
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
      // locally refresh this message's reactions
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

    if (audioRef.current && !audioRef.current.ended && audioRef.current.src === audioContent) {
      audioRef.current.play()
      setPlaying(true)
      return
    }

    const audio = new Audio(audioContent)
    audioRef.current = audio
    audio.onended = () => {
      setPlaying(false)
      setProgress(0)
      audioRef.current = null
    }
    audio.ontimeupdate = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100)
      }
    }
    audio.onerror = () => {
      setPlaying(false)
      setProgress(0)
      audioRef.current = null
      toast.error('Failed to play audio')
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
                  'relative rounded-[18px] px-3.5 py-2 shadow-sm transition-all',
                  (isSticker || hasAnimatedEmojis)
                    ? 'bg-transparent border-0 shadow-none px-0 py-0'
                    : isOwn
                      ? 'bg-gradient-to-br from-emerald-600 via-teal-600 to-teal-700 text-white rounded-tr-[4px] shadow-emerald-500/10'
                      : 'bg-card border border-border/50 text-card-foreground rounded-tl-[4px] shadow-sm',
                  isDeleted && 'opacity-60 italic',
                  starred && 'ring-2 ring-amber-400/60 shadow-amber-500/10'
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
                ) : hasAnimatedEmojis ? (
                  <div className="flex items-center gap-2 py-1 flex-wrap">
                    {animatedEmojiCodepoints.map((cp, idx) => (
                      <Suspense key={idx} fallback={<span className="text-6xl leading-none">{message.content}</span>}>
                        <AnimatedStickerDisplay
                          name={`noto-${cp}`}
                          size={
                            animatedEmojiCodepoints.length === 1
                              ? 100
                              : animatedEmojiCodepoints.length === 2
                              ? 85
                              : 72
                          }
                        />
                      </Suspense>
                    ))}
                  </div>
                ) : isImage ? (
                  attachment.status === 'delivered' ? (
                    <AttachmentPlaceholder text="Image no longer available (delivered & wiped)" />
                  ) : attachment.status === 'loading' ? (
                    <AttachmentLoading label="Loading image…" />
                  ) : attachment.status === 'error' ? (
                    <AttachmentPlaceholder text="Failed to load image" isError />
                  ) : attachment.dataUrl ? (
                    <div className="relative group/img">
                      <img
                        src={attachment.dataUrl}
                        alt="shared image"
                        loading="lazy"
                        className="rounded-xl max-w-[280px] max-h-[280px] object-cover cursor-pointer hover:opacity-95 transition-opacity"
                        onClick={() => setPreviewModal({ url: attachment.dataUrl!, name: 'Image', type: 'image' })}
                      />
                      <button
                        onClick={() => setPreviewModal({ url: attachment.dataUrl!, name: 'Image', type: 'image' })}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover/img:opacity-100 transition-opacity"
                        title="Expand Image"
                      >
                        <Maximize2 className="h-4 w-4" />
                      </button>
                    </div>
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
                  ) : attachment.dataUrl ? (
                    (() => {
                      const url = attachment.dataUrl
                      const isPdf = url.includes('application/pdf') || url.toLowerCase().includes('.pdf')
                      const isVid = url.startsWith('data:video') || url.match(/\.(mp4|webm|mov|mkv|avi)/i)
                      const isAud = url.startsWith('data:audio') || url.match(/\.(mp3|wav|ogg|m4a|aac)/i)
                      const isImg = url.startsWith('data:image') || url.match(/\.(png|jpg|jpeg|gif|webp|svg)/i)

                      if (isVid) {
                        return (
                          <div className="flex flex-col gap-1.5">
                            <video src={url} controls className="rounded-xl max-w-[280px] sm:max-w-[340px] max-h-[300px] bg-black" />
                            <div className="flex justify-end">
                              <button
                                onClick={() => setPreviewModal({ url, name: 'Video', type: 'video' })}
                                className="text-[11px] font-medium flex items-center gap-1 hover:underline text-muted-foreground"
                              >
                                <Maximize2 className="h-3 w-3" /> Fullscreen
                              </button>
                            </div>
                          </div>
                        )
                      }
                      if (isImg) {
                        return (
                          <div className="relative group/img">
                            <img
                              src={url}
                              alt="shared file"
                              className="rounded-xl max-w-[280px] max-h-[280px] object-cover cursor-pointer hover:opacity-95 transition-opacity"
                              onClick={() => setPreviewModal({ url, name: 'Image', type: 'image' })}
                            />
                            <button
                              onClick={() => setPreviewModal({ url, name: 'Image', type: 'image' })}
                              className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover/img:opacity-100 transition-opacity"
                            >
                              <Maximize2 className="h-4 w-4" />
                            </button>
                          </div>
                        )
                      }
                      if (isAud) {
                        return <audio src={url} controls className="max-w-[260px] h-10" />
                      }
                      if (isPdf) {
                        return (
                          <div className="flex flex-col gap-2 p-2.5 rounded-xl bg-black/10 dark:bg-white/10 min-w-[240px]">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-lg bg-red-500/20 text-red-500 flex items-center justify-center font-bold text-xs">
                                PDF
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate">PDF Document</p>
                                <p className="text-[10px] text-muted-foreground">Click preview to read</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-7 text-xs flex-1 gap-1"
                                onClick={() => setPreviewModal({ url, name: 'Document.pdf', type: 'pdf' })}
                              >
                                <Eye className="h-3.5 w-3.5" /> Preview PDF
                              </Button>
                              <a
                                href={url}
                                download="Document.pdf"
                                className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                                title="Download PDF"
                              >
                                <Download className="h-4 w-4" />
                              </a>
                            </div>
                          </div>
                        )
                      }

                      return (
                        <div className="flex flex-col gap-2 p-2.5 rounded-xl bg-black/10 dark:bg-white/10 min-w-[220px]">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold text-xs uppercase">
                              FILE
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold truncate">Attachment File</p>
                              <p className="text-[10px] text-muted-foreground">Document file</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <a
                              href={url}
                              download="attachment"
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
                            >
                              <Download className="h-3.5 w-3.5" /> Download File
                            </a>
                          </div>
                        </div>
                      )
                    })()
                  ) : (
                    <AttachmentPlaceholder text="File empty or missing" isError />
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
                      status={message.status || 'sent'}
                    />
                  )
                ) : (
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {textContent.length > 250 && !readMoreExpanded ? (
                      <>
                        {textContent.slice(0, 250)}...{' '}
                        <button
                          onClick={() => setReadMoreExpanded(true)}
                          className={cn(
                            'text-xs font-bold hover:underline transition-all ml-1 inline-block',
                            isOwn ? 'text-white/95 hover:text-white' : 'text-primary hover:text-primary/80'
                          )}
                        >
                          Read More
                        </button>
                      </>
                    ) : (
                      <>
                        {textContent}
                        {textContent.length > 250 && (
                          <button
                            onClick={() => setReadMoreExpanded(false)}
                            className={cn(
                              'text-xs font-bold hover:underline transition-all block mt-1',
                              isOwn ? 'text-white/95 hover:text-white' : 'text-primary hover:text-primary/80'
                            )}
                          >
                            Show Less
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Meta */}
                {!editing && !isVoice && !isSticker && !hasAnimatedEmojis && (
                  <div className={cn('flex items-center gap-1 justify-end mt-0.5 -mb-0.5 text-[10px]', isOwn ? 'text-white/75' : 'text-muted-foreground')}>
                    {starred && <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />}
                    {message.editedAt && <span>edited</span>}
                    {message.expiresIn && <Clock className="h-2.5 w-2.5" />}
                    <span>{formatTime(message.createdAt)}</span>
                    {isOwn && !isDeleted && <DeliveryTicks status={message.status || 'sent'} />}
                  </div>
                )}

                {/* Floating Meta for transparent messages (stickers & animated emojis) */}
                {!editing && (isSticker || hasAnimatedEmojis) && (
                  <div className={cn(
                    'absolute bottom-0 right-0 bg-background/60 dark:bg-card/70 backdrop-blur-[2px] border border-border/10 rounded-full px-1.5 py-0.5 flex items-center gap-1 text-[9px] text-muted-foreground select-none pointer-events-none shadow-sm translate-y-2.5 translate-x-1.5 z-10'
                  )}>
                    {starred && <Star className="h-2 w-2 fill-amber-400 text-amber-400" />}
                    <span>{formatTime(message.createdAt)}</span>
                    {isOwn && !isDeleted && <DeliveryTicks status={message.status || 'sent'} />}
                  </div>
                )}
              </motion.div>

              {/* Reactions */}
              {Object.keys(reactionGroups).length > 0 && (
                <div className={cn('flex flex-wrap gap-1 mt-1', isOwn ? 'justify-end' : 'justify-start')}>
                  {(Object.entries(reactionGroups) as [string, { count: number; mine: boolean }][]).map(([emoji, info]) => (
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

      {/* Full-screen Media Preview Modal (PDF, Video, Lightbox Image) */}
      <AnimatePresence>
        {previewModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
            onClick={() => setPreviewModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="relative max-w-5xl w-full max-h-[92vh] bg-card border border-border/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText className="h-5 w-5 text-emerald-500 shrink-0" />
                  <span className="font-medium text-sm truncate max-w-[280px] sm:max-w-[450px]">
                    {previewModal.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={previewModal.url}
                    download={previewModal.name}
                    className="p-2 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    title="Download file"
                  >
                    <Download className="h-5 w-5" />
                  </a>
                  <button
                    onClick={() => setPreviewModal(null)}
                    className="p-2 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    title="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto flex items-center justify-center p-2 sm:p-4 min-h-[350px] bg-black/40">
                {previewModal.type === 'pdf' ? (
                  <iframe src={previewModal.url} className="w-full h-[78vh] rounded-xl border-0 bg-white" />
                ) : previewModal.type === 'image' ? (
                  <img src={previewModal.url} alt="Preview" className="max-w-full max-h-[78vh] object-contain rounded-xl shadow-lg" />
                ) : previewModal.type === 'video' ? (
                  <video src={previewModal.url} controls autoPlay className="max-w-full max-h-[78vh] rounded-xl bg-black shadow-lg" />
                ) : (
                  <div className="p-6 text-center flex flex-col items-center gap-3">
                    <FileIcon className="h-12 w-12 text-emerald-500" />
                    <p className="text-sm text-muted-foreground">Direct document preview not available for this file type.</p>
                    <a
                      href={previewModal.url}
                      download={previewModal.name}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium text-sm transition-colors shadow-md"
                    >
                      <Download className="h-4 w-4" /> Download Attachment
                    </a>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export const MessageItem = memo(MessageItemImpl, (prev, next) => {
  // skip re-render when nothing visual changed.
  // collections compared by reference — zustand always allocs new on update,
  // so a ref change reliably signals a real content change (avoids the
  // length-only pitfall where e.g. swap 👍 for ❤️ keeps length identical).
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

// voice message bubble with waveform + play button
function VoiceBubble({
  duration,
  playing,
  progress,
  onToggle,
  isOwn,
  time,
  loading = false,
  status = 'sent',
}: {
  duration: number
  playing: boolean
  progress: number
  onToggle: () => void
  isOwn: boolean
  time: string
  loading?: boolean
  status?: string
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
          <div className="flex items-center gap-1">
            <span>{time}</span>
            {isOwn && <DeliveryTicks status={status} />}
          </div>
        </div>
      </div>
    </div>
  )
}

// delivery ticks: 🕒 pending, ❗ failed, ✓ sent, ✓✓ delivered, ✓✓ read (emerald)
function DeliveryTicks({ status }: { status: string }) {
  if (status === 'pending') {
    return <span title="Sending…"><Clock className="h-3 w-3 animate-spin text-white/80" /></span>
  }
  if (status === 'failed') {
    return <span className="text-red-400 font-bold text-[10px]" title="Failed to send">❗</span>
  }
  if (status === 'read') {
    return <span title="Read"><CheckCheck className="h-3.5 w-3.5 text-emerald-400 font-bold" /></span>
  }
  if (status === 'delivered') {
    return <span title="Delivered"><CheckCheck className="h-3.5 w-3.5 opacity-80" /></span>
  }
  return <span title="Sent"><Check className="h-3.5 w-3.5 opacity-80" /></span>
}

function AttachmentLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-3 px-4 min-w-[180px]">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

// placeholder for wiped/failed attachments
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
