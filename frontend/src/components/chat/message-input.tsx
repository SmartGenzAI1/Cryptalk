'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Send,
  Smile,
  Paperclip,
  Mic,
  X,
  Sticker,
  Trash2,
  Check,
  Clock,
  Loader2,
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
import { apiPost, apiUploadFile } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { MessageWithSender } from '@/lib/types'
import { AnimatedStickerPicker } from './animated-sticker'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'

// 25 MB — must match backend MAX_FILE_SIZE
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

import { EMOJIS } from '@/lib/emojis'

import { STICKER_ICONS, stickerIconUrl } from '@/lib/icons'

const STICKERS = STICKER_ICONS

export function MessageInput() {
  const activeChatId = useChatStore((s) => s.activeChatId)
  const activeChat = useChatStore((s) => s.activeChat)
  const currentUser = useChatStore((s) => s.currentUser)
  const messages = useChatStore((s) => activeChatId ? (s.messages[activeChatId] || EMPTY_MESSAGES) : EMPTY_MESSAGES)
  const addMessage = useChatStore((s) => s.addMessage)
  const [text, setText] = useState(() => {
    if (typeof window !== 'undefined' && activeChatId) {
      return localStorage.getItem(`draft-${activeChatId}`) || ''
    }
    return ''
  })
  const [replyTo, setReplyTo] = useState<MessageWithSender | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [stickerOpen, setStickerOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [ expiresIn, setExpiresIn] = useState<number | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileUploading, setFileUploading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypingEmit = useRef(0)
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // mirror recording into ref so unmount cleanup sees current value (avoid stale closure)
  const recordingRef = useRef(false)
  useEffect(() => {
    recordingRef.current = recording
  }, [recording])

  useEffect(() => {
    function onReply(e: Event) {
      const msg = (e as CustomEvent).detail as MessageWithSender
      setReplyTo(msg)
      textareaRef.current?.focus()
    }
    window.addEventListener('zc-reply', onReply)
    return () => window.removeEventListener('zc-reply', onReply)
  }, [])

  // on unmount: release mic stream + clear typing timer (best-effort, never throw)
  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        try {
          const rec = mediaRecorderRef.current
          if (rec && rec.state !== 'inactive') {
            rec.stop()
            rec.stream.getTracks().forEach((t) => t.stop())
          }
          if (recordTimer.current) clearInterval(recordTimer.current)
        } catch {
          // best-effort
        }
      }
      if (typingTimer.current) {
        clearTimeout(typingTimer.current)
        typingTimer.current = null
      }
    }
  }, [])

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
    if (activeChatId && typeof window !== 'undefined') {
      localStorage.setItem(`draft-${activeChatId}`, e.target.value)
    }
    if (typingTimer.current) clearTimeout(typingTimer.current)
    emitTyping(true)
    typingTimer.current = setTimeout(() => emitTyping(false), 2000)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }

  async function send(content: string, type: string = 'text') {
    if (!activeChatId || !content.trim()) return
    try {
      // e2ee: encrypt before sending (server only sees ciphertext)
      let encryptedContent = content.trim()
      if (type === 'text' && activeChat) {
        try {
          const { encryptMessageForChat } = await import('@/lib/e2ee')
          const recipient = activeChat.members.find((m) => m.user.id !== currentUser?.id)
          encryptedContent = await encryptMessageForChat(
            content.trim(),
            activeChatId,
            activeChat.type,
            recipient?.user.id
          )
        } catch (e) {
          console.warn('E2EE encryption failed, sending plaintext:', e)
        }
      }

      const data = await apiPost<{ message: any }>(`/api/${activeChatId}/messages`, {
        content: encryptedContent,
        type,
        replyToId: replyTo?.id || null,
        expiresIn: type === 'text' ? expiresIn : null,
      })
      if (data.message) {
        // use original plaintext for sender's local display
        if (type === 'text') {
          data.message.content = content.trim()
        }
        addMessage(activeChatId, data.message)
        getSocket()?.emit('send-message', { chatId: activeChatId, message: data.message })
      }
      setText('')
      if (activeChatId && typeof window !== 'undefined') {
        localStorage.removeItem(`draft-${activeChatId}`)
      }
      setReplyTo(null)
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
      emitTyping(false)
    } catch (e: any) {
      console.error('Send failed:', e)
      toast.error('Failed to send message')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(text)
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.start()
      setRecording(true)
      setRecordSeconds(0)
      recordTimer.current = setInterval(() => {
        setRecordSeconds((s) => {
          if (s >= 60) {
            sendVoice()
            return 0
          }
          return s + 1
        })
      }, 1000)
    } catch (e) {
      toast.error('Microphone access denied')
    }
  }

  function cancelRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop())
    }
    setRecording(false)
    setRecordSeconds(0)
    if (recordTimer.current) clearInterval(recordTimer.current)
  }

  async function sendVoice() {
    const seconds = recordSeconds
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop())
    }
    setRecording(false)
    setRecordSeconds(0)
    if (recordTimer.current) clearInterval(recordTimer.current)
    if (seconds < 1) {
      toast.error('Recording too short')
      return
    }
    if (!activeChatId) return

    await new Promise(resolve => setTimeout(resolve, 200))

    setFileUploading(true)
    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })

      // 25MB backend limit
      if (audioBlob.size > MAX_ATTACHMENT_BYTES) {
        toast.error('Voice message too large (max 25MB)')
        return
      }

      const reader = new FileReader()
      const audioBase64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(audioBlob)
      })

      // 1. encrypt the data URL → UTF-8 ciphertext bytes
      let encryptedBytes: Uint8Array
      let ciphertextString: string
      try {
        const { encryptFileForUpload } = await import('@/lib/attachments')
        const recipient = activeChat?.members.find((m) => m.user.id !== currentUser?.id)
        encryptedBytes = await encryptFileForUpload(
          audioBase64,
          activeChatId,
          activeChat?.type || 'direct',
          recipient?.user.id,
        )
        ciphertextString = new TextDecoder().decode(encryptedBytes)
      } catch (e) {
        // e2ee failed — fall back to plaintext data URL (legacy)
        console.warn('E2EE encryption failed, sending plaintext:', e)
        encryptedBytes = new TextEncoder().encode(audioBase64)
        ciphertextString = audioBase64
      }

      // 2. upload ciphertext bytes to /api/uploads
      let attachmentPath: string | null = null
      let encryptedUrl: string | null = null
      let useFallback = false
      let uploadUrl: string | null = null
      try {
        const upload = await apiUploadFile(
          '/api/uploads',
          new Blob([encryptedBytes as BlobPart], { type: 'application/octet-stream' }),
          { contentType: 'application/octet-stream', fileName: `voice-${Date.now()}.webm` },
        )
        if (upload.fallback) {
          // dev mode (no supabase) — embed ciphertext in content (legacy)
          useFallback = true
        } else if (upload.url && upload.path) {
          uploadUrl = upload.url
          try {
            const { encryptMessageForChat } = await import('@/lib/e2ee')
            const recipient = activeChat?.members.find((m) => m.user.id !== currentUser?.id)
            encryptedUrl = await encryptMessageForChat(
              upload.url,
              activeChatId,
              activeChat?.type || 'direct',
              recipient?.user.id,
            )
            attachmentPath = upload.path
          } catch {
            // URL encryption failed — fall back to embedding ciphertext
            useFallback = true
          }
        } else {
          throw new Error('Upload succeeded but no URL or fallback flag returned')
        }
      } catch (e: any) {
        console.warn('Voice upload failed, falling back to base64 inline transmission:', e)
        useFallback = true
      }

      const contentToSend = useFallback ? ciphertextString : (encryptedUrl ?? ciphertextString)

      // 3. send the message
      const data = await apiPost<{ message: any }>(`/api/${activeChatId}/messages`, {
        content: contentToSend,
        type: 'voice',
        duration: seconds,
        replyToId: replyTo?.id || null,
        attachmentPath: useFallback ? null : attachmentPath,
      })
      if (data.message) {
        if (data.message.type === 'voice') {
          data.message.content = useFallback ? ciphertextString : (uploadUrl || ciphertextString)
        }
        addMessage(activeChatId, data.message)
        getSocket()?.emit('send-message', { chatId: activeChatId, message: data.message })
      }
      setReplyTo(null)
      toast.success('Voice message sent 🎙️')
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || 'Failed to send voice message')
    } finally {
      setFileUploading(false)
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    // 25MB backend limit
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error('File too large (max 25MB)')
      return
    }
    if (!activeChatId) return

    setFileUploading(true)
    try {
      // 1. read as base64 data URL
      const reader = new FileReader()
      const fileData = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const msgType = file.type.startsWith('image/') ? 'image' : 'file'

      // 2. encrypt the data URL → UTF-8 ciphertext bytes
      let encryptedBytes: Uint8Array
      let ciphertextString: string
      try {
        const { encryptFileForUpload } = await import('@/lib/attachments')
        const recipient = activeChat?.members.find((m) => m.user.id !== currentUser?.id)
        encryptedBytes = await encryptFileForUpload(
          fileData,
          activeChatId,
          activeChat?.type || 'direct',
          recipient?.user.id,
        )
        ciphertextString = new TextDecoder().decode(encryptedBytes)
      } catch (err) {
        // e2ee failed — fall back to plaintext data URL (legacy)
        console.warn('E2EE encryption failed, sending plaintext:', err)
        encryptedBytes = new TextEncoder().encode(fileData)
        ciphertextString = fileData
      }

      // 3. upload ciphertext bytes to /api/uploads
      let attachmentPath: string | null = null
      let encryptedUrl: string | null = null
      let useFallback = false
      let uploadUrl: string | null = null
      try {
        const upload = await apiUploadFile(
          '/api/uploads',
          new Blob([encryptedBytes as BlobPart], { type: 'application/octet-stream' }),
          { contentType: 'application/octet-stream', fileName: file.name },
        )
        if (upload.fallback) {
          // dev mode (no supabase) — embed ciphertext in content (legacy)
          useFallback = true
        } else if (upload.url && upload.path) {
          uploadUrl = upload.url
          try {
            const { encryptMessageForChat } = await import('@/lib/e2ee')
            const recipient = activeChat?.members.find((m) => m.user.id !== currentUser?.id)
            encryptedUrl = await encryptMessageForChat(
              upload.url,
              activeChatId,
              activeChat?.type || 'direct',
              recipient?.user.id,
            )
            attachmentPath = upload.path
          } catch {
            // URL encryption failed — fall back to embedding ciphertext
            useFallback = true
          }
        } else {
          throw new Error('Upload succeeded but no URL or fallback flag returned')
        }
      } catch (err: any) {
        console.warn('File upload failed, falling back to base64 inline transmission:', err)
        useFallback = true
      }

      const contentToSend = useFallback ? ciphertextString : (encryptedUrl ?? ciphertextString)

      // 4. send the message
      const data = await apiPost<{ message: any }>(`/api/${activeChatId}/messages`, {
        content: contentToSend,
        type: msgType,
        replyToId: replyTo?.id || null,
        attachmentPath: useFallback ? null : attachmentPath,
      })

      if (data.message) {
        if (data.message.type === 'image' || data.message.type === 'file') {
          data.message.content = useFallback ? ciphertextString : (uploadUrl || ciphertextString)
        }
        addMessage(activeChatId, data.message)
        getSocket()?.emit('send-message', { chatId: activeChatId, message: data.message })
      }
      setReplyTo(null)
      toast.success(`File sent (${(file.size / 1024 / 1024).toFixed(1)}MB)`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to send file')
    } finally {
      setFileUploading(false)
    }
  }

  if (!activeChatId) return null

  return (
    <div className="border-t bg-background/80 backdrop-blur shrink-0">
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
              <PopoverContent className="w-72 p-2" align="start">
                <ScrollArea className="h-60 w-full pr-1">
                  <div className="grid grid-cols-8 gap-0.5">
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
                </ScrollArea>
              </PopoverContent>
            </Popover>

            <Popover open={stickerOpen} onOpenChange={setStickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full text-muted-foreground zc-tap" title="Stickers & Emojis">
                  <Sticker className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-3" align="start">
                <Tabs defaultValue="animated" className="w-full">
                  <TabsList className="grid grid-cols-2 w-full mb-3 shrink-0">
                    <TabsTrigger value="static" className="text-xs font-semibold zc-tap">Static Stickers</TabsTrigger>
                    <TabsTrigger value="animated" className="text-xs font-semibold zc-tap">Animated Emojis</TabsTrigger>
                  </TabsList>

                  <TabsContent value="static" className="m-0">
                    <ScrollArea className="h-72 w-full pr-1">
                      <div className="grid grid-cols-4 gap-2 p-1">
                        {STICKERS.map((name) => (
                          <button
                            key={name}
                            onClick={() => { send(name, 'sticker'); setStickerOpen(false) }}
                            className="aspect-square rounded-xl bg-accent/40 hover:bg-primary/10 hover:scale-105 transition-all flex items-center justify-center p-1 zc-tap"
                            title={name}
                          >
                            <img src={stickerIconUrl(name)} alt={name} width={44} height={44} loading="lazy" className="object-contain" />
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="animated" className="m-0">
                    <AnimatedStickerPicker onSelect={(name) => { send(name, 'sticker'); setStickerOpen(false) }} />
                  </TabsContent>
                </Tabs>
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className={cn('h-10 w-10 rounded-full zc-tap', expiresIn ? 'text-amber-500' : 'text-muted-foreground')} title="Self-destruct timer">
                  <Clock className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="start">
                <div className="text-xs font-medium text-muted-foreground mb-2 px-1">Self-destruct after</div>
                {[
                  { label: 'Off', value: null },
                  { label: '10 seconds', value: 10 },
                  { label: '1 minute', value: 60 },
                  { label: '1 hour', value: 3600 },
                  { label: '1 day', value: 86400 },
                  { label: '1 week', value: 604800 },
                ].map((opt) => (
                  <button
                    key={String(opt.value)}
                    onClick={() => { setExpiresIn(opt.value); }}
                    className={cn(
                      'w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors zc-tap',
                      expiresIn === opt.value ? 'bg-primary/15 text-primary font-medium' : 'hover:bg-accent'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileSelect}
              accept="image/*,video/*,application/pdf,audio/*,.zip,.doc,.docx,.txt"
            />
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full text-muted-foreground zc-tap" onClick={() => !fileUploading && fileInputRef.current?.click()} title="Attach file" disabled={fileUploading}>
              {fileUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
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
