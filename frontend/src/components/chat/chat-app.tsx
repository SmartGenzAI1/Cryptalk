'use client'

import { useEffect } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { useSocket } from '@/hooks/use-socket'
import { Sidebar } from './sidebar'
import { ChatList } from './chat-list'
import { ChatWindow } from './chat-window'
import { AiAssistantPanel } from './ai-assistant-panel'
import { ChatInfoPanel } from './chat-info-panel'
import { SettingsPanel } from './settings-panel'
import { AccentApplier } from './accent-applier'
import { MobileNav } from './mobile-nav'
import { Toaster } from '@/components/ui/toaster'
import { apiGet } from '@/lib/api'
import { initE2EE } from '@/lib/e2ee'

export function ChatApp() {
  useSocket()
  const aiPanelOpen = useChatStore((s) => s.aiPanelOpen)
  const infoPanelOpen = useChatStore((s) => s.infoPanelOpen)
  const settingsOpen = useChatStore((s) => s.settingsOpen)
  const activeChatId = useChatStore((s) => s.activeChatId)
  const setChats = useChatStore((s) => s.setChats)
  const setCurrentUser = useChatStore((s) => s.setCurrentUser)
  const setE2eeEnabled = useChatStore((s) => s.setE2eeEnabled)

  // Load chats + refresh user presence + init E2EE on mount
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const [chatsData, meData] = await Promise.all([
          apiGet<{ chats: any[] }>('/api/chats'),
          apiGet<{ user: any }>('/api/users/me'),
        ])
        if (mounted) {
          if (chatsData.chats) setChats(chatsData.chats)
          if (meData.user) setCurrentUser(meData.user)

          // Initialize E2EE — generates keys if needed, uploads public keys
          if (meData.user) {
            try {
              const e2eeStatus = await initE2EE(meData.user.id)
              if (mounted) setE2eeEnabled(e2eeStatus.isE2EEEnabled)
            } catch (e: any) {
              console.warn('[E2EE] init failed (non-fatal):', e?.message || e)
            }
          }
        }
      } catch (e) {
        console.error('failed to load chats', e)
      }
    })()
    return () => {
      mounted = false
    }
  }, [setChats, setCurrentUser, setE2eeEnabled])

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-background">
      <AccentApplier />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        {/* On mobile: show chat list OR chat window (not both) */}
        <div className={`${activeChatId ? 'hidden' : 'flex'} md:flex w-full md:w-[360px] shrink-0`}>
          <ChatList />
        </div>
        <div className={`${activeChatId ? 'flex' : 'hidden'} md:flex flex-1 min-w-0`}>
          <ChatWindow />
          {infoPanelOpen && activeChatId && <ChatInfoPanel />}
          {aiPanelOpen && <AiAssistantPanel />}
          {settingsOpen && <SettingsPanel />}
        </div>
        {/* On mobile: show AI/Settings panel full-screen when no chat selected */}
        {!activeChatId && (aiPanelOpen || settingsOpen) && (
          <div className="flex md:hidden w-full absolute inset-0 z-50 top-0 bottom-14">
            {aiPanelOpen && <AiAssistantPanel />}
            {settingsOpen && <SettingsPanel />}
          </div>
        )}
      </div>
      {/* Mobile bottom navigation */}
      <MobileNav />
      <Toaster />
    </div>
  )
}
