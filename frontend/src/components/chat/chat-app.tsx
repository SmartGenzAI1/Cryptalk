'use client'

import { lazy, Suspense, useEffect, useMemo } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { useSocket } from '@/hooks/use-socket'
import { Sidebar } from './sidebar'
import { ChatList } from './chat-list'
import { ChatWindow } from './chat-window'
import { AccentApplier } from './accent-applier'
import { MobileNav } from './mobile-nav'
import { Toaster } from '@/components/ui/toaster'
import { apiGet } from '@/lib/api'
import { initE2EE } from '@/lib/e2ee'

const ChatInfoPanel = lazy(() => import('./chat-info-panel').then(m => ({ default: m.ChatInfoPanel })))
const SettingsPanel = lazy(() => import('./settings-panel').then(m => ({ default: m.SettingsPanel })))
const ConnectionsPanel = lazy(() => import('./connections-panel').then(m => ({ default: m.ConnectionsPanel })))

function PanelFallback() {
  return <div className="w-full sm:w-[380px] shrink-0 border-l bg-sidebar/60" />
}

export function ChatApp() {
  useSocket()
  const panels = useChatStore(s => ({
    aiPanelOpen: s.aiPanelOpen,
    infoPanelOpen: s.infoPanelOpen,
    settingsOpen: s.settingsOpen,
    connectionsPanelOpen: s.connectionsPanelOpen,
  }))
  const activeChatId = useChatStore(s => s.activeChatId)
  const setChats = useChatStore(s => s.setChats)
  const setCurrentUser = useChatStore(s => s.setCurrentUser)
  const setE2eeEnabled = useChatStore(s => s.setE2eeEnabled)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const [chatsData, meData] = await Promise.all([
          apiGet<{ chats: any[] }>('/api/chats'),
          apiGet<{ user: any }>('/api/users/me'),
        ])
        if (!mounted) return
        if (chatsData.chats) setChats(chatsData.chats)
        if (meData.user) setCurrentUser(meData.user)

        if (meData.user) {
          try {
            const e2eeStatus = await initE2EE(meData.user.id)
            if (mounted) setE2eeEnabled(e2eeStatus.isE2EEEnabled)
          } catch {}
        }
      } catch (e) {
        console.error('failed to load chats', e)
      }
    })()
    return () => { mounted = false }
  }, [setChats, setCurrentUser, setE2eeEnabled])

  const { infoPanelOpen, settingsOpen, connectionsPanelOpen } = panels

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-background">
      <AccentApplier />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <div className={`${activeChatId ? 'hidden' : 'flex'} md:flex w-full md:w-[360px] shrink-0`}>
          <ChatList />
        </div>
        <div className={`${activeChatId ? 'flex' : 'hidden'} md:flex flex-1 min-w-0`}>
          <ChatWindow />
          {infoPanelOpen && activeChatId && (
            <Suspense fallback={<PanelFallback />}>
              <ChatInfoPanel />
            </Suspense>
          )}
          {settingsOpen && (
            <Suspense fallback={<PanelFallback />}>
              <SettingsPanel />
            </Suspense>
          )}
          {connectionsPanelOpen && (
            <Suspense fallback={<PanelFallback />}>
              <ConnectionsPanel />
            </Suspense>
          )}
        </div>
        {!activeChatId && (settingsOpen || connectionsPanelOpen) && (
          <div className="flex md:hidden w-full absolute inset-0 z-50 top-0 bottom-14">
            {settingsOpen && (
              <Suspense fallback={<PanelFallback />}>
                <SettingsPanel />
              </Suspense>
            )}
            {connectionsPanelOpen && (
              <Suspense fallback={<PanelFallback />}>
                <ConnectionsPanel />
              </Suspense>
            )}
          </div>
        )}
      </div>
      <MobileNav />
      <Toaster />
    </div>
  )
}
