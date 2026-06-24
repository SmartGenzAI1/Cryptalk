'use client'

import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useChatStore } from '@/stores/chat-store'
import { Loader2 } from 'lucide-react'
import { apiGet } from '@/lib/api'
import Image from 'next/image'

const AuthScreen = dynamic(() => import('@/components/chat/auth-screen').then(m => ({ default: m.AuthScreen })), {
  loading: () => <LoadingScreen />,
})
const ChatApp = dynamic(() => import('@/components/chat/chat-app').then(m => ({ default: m.ChatApp })), {
  loading: () => <LoadingScreen />,
})

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Image src="/logo.png" alt="Cryptalk" width={64} height={64} className="object-contain" priority />
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    </div>
  )
}

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
    return () => { cancelled = true }
  }, [setCurrentUser, setAuthLoading])

  if (authLoading) return <LoadingScreen />
  if (!currentUser) return <AuthScreen />
  return <ChatApp />
}
