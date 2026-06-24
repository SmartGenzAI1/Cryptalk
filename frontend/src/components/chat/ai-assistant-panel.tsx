'use client'

import { useEffect, useRef, useState } from 'react'
import { Sparkles, Send, X, Trash2, Wand2 } from 'lucide-react'
import { useChatStore } from '@/stores/chat-store'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { sendToAssistant, type AiMessage } from '@/lib/ai-actions'
import { cn } from '@/lib/utils'

const SUGGESTIONS = [
  'Draft a friendly hello to a new teammate',
  'Summarize my last meeting notes',
  'Translate "Hello, how are you?" to Japanese',
  'Give me 3 icebreaker questions',
  'Write a short birthday message',
]

export function AiAssistantPanel() {
  const setAiPanelOpen = useChatStore((s) => s.setAiPanelOpen)
  const [history, setHistory] = useState<AiMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [history, loading])

  async function send(text: string) {
    if (!text.trim() || loading) return
    const userMsg = text.trim()
    setInput('')
    setHistory((h) => [...h, { role: 'user', content: userMsg }])
    setLoading(true)
    try {
      const data = await sendToAssistant(userMsg, history)
      setHistory(data.history)
    } catch (e: any) {
      toast.error(e.message || 'AI error')
      setHistory((h) => [...h, { role: 'assistant', content: 'Sorry, I hit an error. Try again.' }])
    } finally {
      setLoading(false)
    }
  }

  function clearConversation() {
    setHistory([])
    setConversationId(undefined)
  }

  return (
    <div className="w-full sm:w-[380px] shrink-0 border-l flex flex-col bg-sidebar/50">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-16 border-b shrink-0">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white shadow-md">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold flex items-center gap-1.5">
            Cryptalk AI
            <span className="px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-500 dark:text-violet-300 text-[10px] font-bold">BETA</span>
          </div>
          <div className="text-xs text-muted-foreground">Your chat copilot</div>
        </div>
        {history.length > 0 && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearConversation} title="Clear conversation">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAiPanelOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 zc-scroll">
        <div className="p-4 space-y-4" ref={scrollRef}>
          {history.length === 0 ? (
            <div className="text-center py-8">
              <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white shadow-lg">
                <Wand2 className="h-8 w-8" />
              </div>
              <h3 className="font-semibold mb-1">Hi, I'm Cryptalk AI ✨</h3>
              <p className="text-sm text-muted-foreground mb-5">
                I can draft messages, summarize chats, translate, brainstorm, and more.
              </p>
              <div className="space-y-2 text-left">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="w-full text-left px-3 py-2 rounded-xl bg-accent hover:bg-accent/70 text-sm transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            history.map((m, i) => (
              <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words',
                    m.role === 'user'
                      ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white rounded-br-md'
                      : 'bg-background border rounded-bl-md'
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-background border rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1">
                <span className="zc-typing-dot h-2 w-2 rounded-full bg-muted-foreground/60" />
                <span className="zc-typing-dot h-2 w-2 rounded-full bg-muted-foreground/60" />
                <span className="zc-typing-dot h-2 w-2 rounded-full bg-muted-foreground/60" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t shrink-0">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
            placeholder="Ask Cryptalk AI anything…"
            rows={1}
            className="flex-1 resize-none min-h-[40px] max-h-32 bg-accent/50 border-0 rounded-2xl focus-visible:ring-1 focus-visible:ring-violet-500 px-4 py-2.5"
          />
          <Button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            size="icon"
            className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
