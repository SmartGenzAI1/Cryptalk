'use client'

import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useChatStore } from '@/stores/chat-store'
import { Loader2 } from 'lucide-react'
import { apiGet } from '@/lib/api'
import Image from 'next/image'

// Preload dynamic components asynchronously as soon as page module is loaded
const loadAuthScreen = () => import('@/components/chat/auth-screen')
const loadChatApp = () => import('@/components/chat/chat-app')

const AuthScreen = dynamic(() => loadAuthScreen().then(m => ({ default: m.AuthScreen })), {
  loading: () => <LoadingScreen />,
})
const ChatApp = dynamic(() => loadChatApp().then(m => ({ default: m.ChatApp })), {
  loading: () => <LoadingScreen />,
})

function LoadingScreen() {
  return (
    <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-background select-none overflow-hidden relative">
      {/* Dynamic ambient radial background glow */}
      <div className="absolute h-96 w-96 rounded-full bg-gradient-to-tr from-emerald-500/20 via-teal-500/15 to-cyan-500/20 blur-3xl animate-pulse pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center gap-6 px-4 text-center">
        {/* Big frameless logo (occupying ~30% screen width, no square box) */}
        <div className="relative flex items-center justify-center">
          <div className="absolute -inset-6 rounded-full bg-emerald-500/25 blur-2xl animate-pulse" />
          <div className="relative w-[30vw] min-w-[200px] max-w-[320px] flex items-center justify-center transition-transform duration-300 hover:scale-105">
            <Image
              src="/logo.png"
              alt="Cryptalk Logo"
              width={320}
              height={320}
              className="w-full h-auto object-contain drop-shadow-[0_15px_35px_rgba(16,185,129,0.35)]"
              priority
            />
          </div>
        </div>

        {/* Brand Title & Subtitle */}
        <div className="space-y-2 mt-2">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent drop-shadow-sm">
            Cryptalk
          </h1>
          <p className="text-xs md:text-sm font-semibold text-muted-foreground tracking-widest uppercase">
            End-to-End Encrypted Messenger
          </p>
        </div>

        {/* Modern Loader */}
        <div className="flex items-center gap-2.5 mt-3 px-5 py-2 rounded-full bg-accent/50 border border-border/60 backdrop-blur text-xs font-semibold text-muted-foreground shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>Securing connection…</span>
        </div>
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
    // Proactively prefetch dynamic chunks for zero layout delay
    void loadAuthScreen()
    void loadChatApp()

    // 1. Try loading cached user instantly to bypass splash screen (< 10ms)
    let hasCached = false
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('zc-currentUser')
      if (cached) {
        try {
          setCurrentUser(JSON.parse(cached))
          setAuthLoading(false)
          hasCached = true
        } catch {}
      }
    }

    // 2. Fast background user verification with 1.2s timeout fallback
    let cancelled = false
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
      if (!cancelled) setAuthLoading(false)
    }, 1200)

    ;(async () => {
      try {
        const data = await apiGet<{ user: any }>('/api/auth/me')
        if (!cancelled) {
          setCurrentUser(data.user)
          if (data.user) {
            localStorage.setItem('zc-currentUser', JSON.stringify(data.user))
          } else {
            localStorage.removeItem('zc-currentUser')
          }
        }
      } catch {
        if (!cancelled && !hasCached) {
          setCurrentUser(null)
          localStorage.removeItem('zc-currentUser')
        }
      } finally {
        clearTimeout(timeoutId)
        if (!cancelled) setAuthLoading(false)
      }
    })()

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [setCurrentUser, setAuthLoading])

  if (authLoading) return <LoadingScreen />
  if (!currentUser) return <AuthScreen />
  return <ChatApp />
}
