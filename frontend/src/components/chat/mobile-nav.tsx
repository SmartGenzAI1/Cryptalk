'use client'

import { MessageCircle, Users, Megaphone, Settings, Sparkles } from 'lucide-react'
import { useChatStore } from '@/stores/chat-store'
import { cn } from '@/lib/utils'
import Image from 'next/image'

export function MobileNav() {
  const setAiPanelOpen = useChatStore((s) => s.setAiPanelOpen)
  const setSettingsOpen = useChatStore((s) => s.setSettingsOpen)
  const aiPanelOpen = useChatStore((s) => s.aiPanelOpen)
  const settingsOpen = useChatStore((s) => s.settingsOpen)
  const setActiveChatId = useChatStore((s) => s.setActiveChatId)
  const activeChatId = useChatStore((s) => s.activeChatId)

  return (
    <nav className="md:hidden flex items-center justify-around h-14 border-t bg-sidebar/80 zc-glass-sidebar shrink-0 safe-area-pb">
      <NavBtn icon={MessageCircle} label="Chats" active={!activeChatId && !aiPanelOpen && !settingsOpen} onClick={() => { setActiveChatId(null); setAiPanelOpen(false); setSettingsOpen(false) }} />
      <NavBtn icon={Users} label="Contacts" />
      <NavBtn icon={Megaphone} label="Channels" />
      <NavBtn
        icon={Sparkles}
        label="AI"
        active={aiPanelOpen}
        onClick={() => { setAiPanelOpen(!aiPanelOpen); if (!aiPanelOpen) setSettingsOpen(false) }}
        accent
      />
      <NavBtn
        icon={Settings}
        label="Settings"
        active={settingsOpen}
        onClick={() => { setSettingsOpen(!settingsOpen); if (!settingsOpen) setAiPanelOpen(false) }}
      />
    </nav>
  )
}

function NavBtn({
  icon: Icon,
  label,
  active,
  onClick,
  accent,
}: {
  icon: any
  label: string
  active?: boolean
  onClick?: () => void
  accent?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-0.5 h-full flex-1 zc-tap transition-colors',
        active
          ? accent
            ? 'text-violet-500'
            : 'text-primary'
          : 'text-muted-foreground'
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  )
}
