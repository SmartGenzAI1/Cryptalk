'use client'

import { useEffect } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { AuthScreen } from '@/components/chat/auth-screen'
import { ChatApp } from '@/components/chat/chat-app'
import { Loader2 } from 'lucide-react'
import { apiGet } from '@/lib/api'
import Image from 'next/image'

export default function Home() {
  const currentUser = useChatStore((s) => s.currentUser)
  const authLoading = useChatStore((s) => s.authLoading)
  const setAuthLoading = useChatStore((s) => s.setAuthLoading)
  const setCurrentUser = useChatStore((s) => s.setCurrentUser)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await apiGet<{ user: any }>('/api/auth/me')
        if (!cancelled) setCurrentUser(data.user)
      } catch {
        if (!cancelled) setCurrentUser(null)
      } finally {
        if (!cancelled) setAuthLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setCurrentUser, setAuthLoading])

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-16 w-16">
            <Image src="/logo-small.png" alt="Cryptalk" fill className="object-contain rounded-2xl" priority />
            <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-background flex items-center justify-center border">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground font-medium">Loading Cryptalk…</p>
        </div>
      </div>
    )
  }

  if (!currentUser) return <AuthScreen />
  return <ChatApp />
}
