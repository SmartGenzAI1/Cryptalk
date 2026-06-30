'use client'

import { MessageCircle, Users, Megaphone, Settings } from 'lucide-react'
import { useChatStore } from '@/stores/chat-store'
import { cn } from '@/lib/utils'

export function MobileNav() {
  const setSettingsOpen = useChatStore((s) => s.setSettingsOpen)
  const setConnectionsPanelOpen = useChatStore((s) => s.setConnectionsPanelOpen)
  const settingsOpen = useChatStore((s) => s.settingsOpen)
  const connectionsPanelOpen = useChatStore((s) => s.connectionsPanelOpen)
  const setActiveChatId = useChatStore((s) => s.setActiveChatId)
  const activeChatId = useChatStore((s) => s.activeChatId)
  const chatFilter = useChatStore((s) => s.chatFilter)
  const setChatFilter = useChatStore((s) => s.setChatFilter)

  if (activeChatId) return null

  return (
    <nav className="md:hidden flex items-center justify-around h-14 border-t bg-sidebar/80 zc-glass-sidebar shrink-0 safe-area-pb">
      <NavBtn icon={MessageCircle} label="Chats" active={chatFilter === 'all' && !connectionsPanelOpen && !settingsOpen} onClick={() => { setChatFilter('all'); setActiveChatId(null); setConnectionsPanelOpen(false); setSettingsOpen(false) }} />
      <NavBtn icon={Users} label="People" active={connectionsPanelOpen} onClick={() => { setConnectionsPanelOpen(!connectionsPanelOpen); if (!connectionsPanelOpen) setSettingsOpen(false) }} />
      <NavBtn icon={Megaphone} label="Channels" active={chatFilter === 'channel' && !connectionsPanelOpen && !settingsOpen} onClick={() => { setChatFilter('channel'); setActiveChatId(null); setConnectionsPanelOpen(false); setSettingsOpen(false) }} />
      <NavBtn icon={Settings} label="Settings" active={settingsOpen} onClick={() => { setSettingsOpen(!settingsOpen); if (!settingsOpen) setConnectionsPanelOpen(false) }} />
    </nav>
  )
}

function NavBtn({ icon: Icon, label, active, onClick }: { icon: any; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={cn('flex flex-col items-center justify-center gap-0.5 h-full flex-1 zc-tap transition-colors', active ? 'text-primary' : 'text-muted-foreground')}>
      <Icon className="h-5 w-5" />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  )
}
