'use client'

import { useState } from 'react'
import { Send, Check } from 'lucide-react'
import { useChatStore } from '@/stores/chat-store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChatAvatar } from './chat-avatar'
import { forwardMessage } from '@/lib/actions'
import { getSocket } from '@/hooks/use-socket'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function ForwardDialog({
  open,
  onOpenChange,
  messageId,
}: {
  open: boolean
  onOpenChange: (b: boolean) => void
  messageId: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {open && (
          <ForwardForm messageId={messageId} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ForwardForm({ messageId, onDone }: { messageId: string; onDone: () => void }) {
  const chats = useChatStore((s) => s.chats)
  const currentUser = useChatStore((s) => s.currentUser)
  const addMessage = useChatStore((s) => s.addMessage)
  // state initializes fresh on each mount — no effect needed
  const [selected, setSelected] = useState<string[]>([])
  const [sending, setSending] = useState(false)

  function getTitle(chat: any) {
    if (chat.type === 'saved') return 'Saved Messages'
    if (chat.type === 'direct') {
      const other = chat.members.find((m: any) => m.user.id !== currentUser?.id)
      return other?.user.name || chat.title
    }
    return chat.title
  }

  function getAvatar(chat: any) {
    if (chat.type === 'saved') return { emoji: 'bookmark', color: 'emerald' }
    if (chat.type === 'direct') {
      const other = chat.members.find((m: any) => m.user.id !== currentUser?.id)
      return { emoji: other?.user.avatarEmoji || chat.avatarEmoji, color: other?.user.avatarColor || chat.avatarColor }
    }
    return { emoji: chat.avatarEmoji, color: chat.avatarColor }
  }

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  async function handleForward() {
    if (selected.length === 0) return
    setSending(true)
    try {
      const data = await forwardMessage(messageId, selected)
      for (const f of data.forwarded) {
        addMessage(f.chatId, f.message)
        getSocket()?.emit('send-message', { chatId: f.chatId, message: f.message })
      }
      toast.success(`Forwarded to ${data.forwarded.length} chat${data.forwarded.length > 1 ? 's' : ''}`)
      onDone()
    } catch (e: any) {
      toast.error(e.message || 'Forward failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Forward to…</DialogTitle>
      </DialogHeader>
      <ScrollArea className="max-h-80 zc-scroll -mx-2">
        <div className="px-2 space-y-0.5">
          {chats.map((chat) => {
            const { emoji, color } = getAvatar(chat)
            const isSel = selected.includes(chat.id)
            return (
              <button
                key={chat.id}
                onClick={() => toggle(chat.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-2 rounded-xl text-left transition-colors',
                  isSel ? 'bg-primary/15' : 'hover:bg-accent'
                )}
              >
                <ChatAvatar emoji={emoji} color={color} size="sm" />
                <span className="flex-1 truncate font-medium text-sm">{getTitle(chat)}</span>
                {isSel && <Check className="h-4 w-4 text-primary" />}
              </button>
            )
          })}
        </div>
      </ScrollArea>
      <Button
        onClick={handleForward}
        disabled={selected.length === 0 || sending}
        className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 border-0"
      >
        <Send className="h-4 w-4 mr-2" />
        {sending ? 'Forwarding…' : `Forward${selected.length > 0 ? ` (${selected.length})` : ''}`}
      </Button>
    </>
  )
}
