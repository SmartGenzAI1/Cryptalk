'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Send,
  Smile,
  Paperclip,
  Mic,
  X,
  Sparkles,
  Sticker,
  Trash2,
  Check,
} from 'lucide-react'
import { useChatStore, EMPTY_MESSAGES } from '@/stores/chat-store'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { toast } from 'sonner'
import { getSocket } from '@/hooks/use-socket'
import { getSmartReplies } from '@/lib/ai-actions'
import { apiPost } from '@/lib/api'
import type { MessageWithSender } from '@/lib/types'

const EMOJIS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
  '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
  '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
  '🔥', '❤️', '👍', '👎', '🎉', '👏', '🙏', '💪', '✨', '⭐',
  '❤️‍🔥', '💯', '👀', '😅', '😎', '🤓', '🥳', '😴', '🤯', '🥺',
]

import { STICKER_ICONS, stickerIconUrl } from '@/lib/icons'

const STICKERS = STICKER_ICONS

export function MessageInput() {
  const activeChatId = useChatStore((s) => s.activeChatId)
  const currentUser = useChatStore((s) => s.currentUser)
  const messages = useChatStore((s) => s.messages[activeChatId] ?? EMPTY_MESSAGES)
  const addMessage = useChatStore((s) => s.addMessage)
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<MessageWithSender | null>(null)
  const [smartReplies, setSmartReplies] = useState<string[]>([])
  const [loadingReplies, setLoadingReplies] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [stickerOpen, setStickerOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypingEmit = useRef(0)
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // listen for reply events
  useEffect(() => {
    function onReply(e: Event) {
      const msg = (e as CustomEvent).detail as MessageWithSender
      setReplyTo(msg)
      textareaRef.current?.focus()
    }
    window.addEventListener('zc-reply', onReply)
    return () => window.removeEventListener('zc-reply', onReply)
  }, [])

  // fetch smart replies when chat changes (debounced via effect on messages length)
  useEffect(() => {
    if (!activeChatId || messages.length === 0) {
      setSmartReplies([])
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      setLoadingReplies(true)
      try {
        const recent = messages.slice(-6).map((m) => ({
          senderName: m.sender.name,
          content: m.content,
        }))
        const replies = await getSmartReplies(recent)
        if (!cancelled) setSmartReplies(replies)
      } finally {
        if (!cancelled) setLoadingReplies(false)
      }
    }, 600)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [activeChatId, messages.length])

  function emitTyping(isTyping: boolean) {
    if (!activeChatId || !currentUser) return
    const now = Date.now()
    if (isTyping && now - lastTypingEmit.current < 1500) return
    lastTypingEmit.current = now
    getSocket()?.emit('typing', {
      chatId: activeChatId,
      userId: currentUser.id,
      username: currentUser.name,
      isTyping,
    })
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value)
    if (typingTimer.current) clearTimeout(typingTimer.current)
    emitTyping(true)
    typingTimer.current = setTimeout(() => emitTyping(false), 2000)
    // auto-resize
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }

  async function send(content: string, type: string = 'text') {
    if (!activeChatId || !content.trim()) return
    try {
      const data = await apiPost<{ message: any }>(`/api/${activeChatId}/messages`, {
        content: content.trim(),
        type,
        replyToId: replyTo?.id || null,
      })
      if (data.message) {
        addMessage(activeChatId, data.message)
        getSocket()?.emit('send-message', { chatId: activeChatId, message: data.message })
      }
      setText('')
      setReplyTo(null)
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
      emitTyping(false)
    } catch (e) {
      console.error(e)
      toast.error('Failed to send message')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(text)
    }
  }

  function startRecording() {
    setRecording(true)
    setRecordSeconds(0)
    recordTimer.current = setInterval(() => {
      setRecordSeconds((s) => s + 1)
    }, 1000)
  }

  function cancelRecording() {
    setRecording(false)
    setRecordSeconds(0)
    if (recordTimer.current) clearInterval(recordTimer.current)
  }

  async function sendVoice() {
    const seconds = recordSeconds
    setRecording(false)
    setRecordSeconds(0)
    if (recordTimer.current) clearInterval(recordTimer.current)
    if (seconds < 1) {
      toast.error('Recording too short')
      return
    }
    try {
      const data = await apiPost<{ message: any }>(`/api/${activeChatId}/messages`, {
        content: '🎙️ Voice message',
        type: 'voice',
        duration: seconds,
        replyToId: replyTo?.id || null,
      })
      if (data.message) {
        addMessage(activeChatId, data.message)
        getSocket()?.emit('send-message', { chatId: activeChatId, message: data.message })
      }
      setReplyTo(null)
      toast.success('Voice message sent 🎙️')
    } catch (e) {
      console.error(e)
      toast.error('Failed to send voice message')
    }
  }

  if (!activeChatId) return null

  return (
    <div className="border-t bg-background/80 backdrop-blur shrink-0">
      {/* Smart replies */}
      {(smartReplies.length > 0 || loadingReplies) && (
        <div className="px-3 pt-2 flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3" /> Smart replies
          </span>
          {loadingReplies ? (
            <span className="text-xs text-muted-foreground animate-pulse">Thinking…</span>
          ) : (
            smartReplies.map((r, i) => (
              <button
                key={i}
                onClick={() => send(r)}
                className="px-3 py-1 rounded-full text-sm bg-accent hover:bg-primary/15 hover:text-primary transition-colors border"
              >
                {r}
              </button>
            ))
          )}
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="px-3 pt-2 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent border-l-2 border-primary">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-primary">Replying to {replyTo.sender.name}</div>
              <div className="text-xs text-muted-foreground truncate">{replyTo.content}</div>
            </div>
          </div>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setReplyTo(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {recording ? (
        <div className="p-3 flex items-center gap-3 bg-red-500/5">
          <button
            onClick={cancelRecording}
            className="h-10 w-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center zc-tap shrink-0"
            title="Cancel"
          >
            <Trash2 className="h-5 w-5" />
          </button>
          <div className="flex-1 flex items-center gap-3 bg-background rounded-full px-4 py-2.5 border">
            <span className="relative flex h-3 w-3">
              <span className="zc-pulse-ring absolute inline-flex h-full w-full rounded-full bg-red-500" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            <span className="text-sm font-mono font-semibold tabular-nums">
              {String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:{String(recordSeconds % 60).padStart(2, '0')}
            </span>
            <div className="flex-1 flex items-center gap-[2px] h-5">
              {Array.from({ length: 28 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-full bg-red-500/60 zc-wave-bar"
                  style={{ height: `${30 + Math.abs(Math.sin(i * 1.7 + recordSeconds)) * 70}%`, animationDelay: `${i * 0.04}s` }}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">Recording…</span>
          </div>
          <button
            onClick={sendVoice}
            className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-md zc-tap shrink-0"
            title="Send voice"
          >
            <Check className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <div className="p-3 flex items-end gap-2">
          <div className="flex items-center gap-1">
            <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full text-muted-foreground zc-tap">
                  <Smile className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="start">
                <div className="grid grid-cols-8 gap-0.5 p-2 max-h-60 overflow-y-auto zc-scroll">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => { setText((t) => t + e); textareaRef.current?.focus() }}
                      className="h-8 w-8 rounded hover:bg-accent hover:scale-125 transition-all flex items-center justify-center text-lg"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <Popover open={stickerOpen} onOpenChange={setStickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full text-muted-foreground zc-tap">
                  <Sticker className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="start">
                <div className="text-xs font-medium text-muted-foreground mb-2 px-1">Stickers</div>
                <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto zc-scroll">
                  {STICKERS.map((name) => (
                    <button
                      key={name}
                      onClick={() => { send(name, 'sticker'); setStickerOpen(false) }}
                      className="aspect-square rounded-xl bg-accent hover:bg-primary/15 hover:scale-105 transition-all flex items-center justify-center zc-tap"
                      title={name}
                    >
                      <img src={stickerIconUrl(name)} alt={name} width={48} height={48} loading="lazy" className="object-contain" />
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full text-muted-foreground hidden sm:flex zc-tap" onClick={() => toast.info('File sharing coming soon')}>
              <Paperclip className="h-5 w-5" />
            </Button>
          </div>

          <Textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            rows={1}
            className="flex-1 resize-none min-h-[40px] max-h-40 bg-accent/40 border-0 rounded-2xl focus-visible:ring-1 focus-visible:ring-primary px-4 py-2.5 leading-snug"
          />

          <div className="flex items-center">
            {text.trim() ? (
              <Button
                onClick={() => send(text)}
                size="icon"
                className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary hover:brightness-110 shadow-md zc-tap"
              >
                <Send className="h-5 w-5" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full text-muted-foreground hover:text-red-500 zc-tap"
                onClick={startRecording}
                title="Record voice message"
              >
                <Mic className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
