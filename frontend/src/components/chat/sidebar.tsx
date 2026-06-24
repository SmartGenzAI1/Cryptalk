'use client'

import { useState } from 'react'
import {
  MessageCircle,
  Settings,
  Sparkles,
  LogOut,
  Moon,
  Sun,
  Bookmark,
  Users,
  Megaphone,
  Star,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { useChatStore } from '@/stores/chat-store'
import { ChatAvatar } from './chat-avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { ProfileDialog } from './profile-dialog'
import { cn } from '@/lib/utils'
import { apiPost } from '@/lib/api'
import Image from 'next/image'

export function Sidebar() {
  const { theme, setTheme } = useTheme()
  const currentUser = useChatStore((s) => s.currentUser)
  const setAiPanelOpen = useChatStore((s) => s.setAiPanelOpen)
  const aiPanelOpen = useChatStore((s) => s.aiPanelOpen)
  const setSettingsOpen = useChatStore((s) => s.setSettingsOpen)
  const settingsOpen = useChatStore((s) => s.settingsOpen)
  const setCurrentUser = useChatStore((s) => s.setCurrentUser)
  const [profileOpen, setProfileOpen] = useState(false)

  async function handleLogout() {
    await apiPost('/api/auth/logout')
    setCurrentUser(null)
    toast.success('Signed out')
  }

  const navItems = [
    { icon: MessageCircle, label: 'Chats', active: true },
    { icon: Users, label: 'Contacts', active: false },
    { icon: Megaphone, label: 'Channels', active: false },
    { icon: Bookmark, label: 'Saved', active: false },
  ]

  const isConnected = useChatStore((s) => s.isConnected)

  return (
    <TooltipProvider delayDuration={200}>
      <aside className="hidden md:flex w-[68px] shrink-0 flex-col items-center justify-between border-r bg-sidebar/80 zc-glass-sidebar py-4">
        <div className="flex flex-col items-center gap-2">
          <div className="mb-3 relative h-11 w-11 rounded-2xl overflow-hidden shadow-md ring-1 ring-border">
            <Image src="/logo-small.png" alt="Cryptalk" width={44} height={44} className="object-contain" />
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-sidebar',
                isConnected ? 'bg-emerald-500' : 'bg-amber-500'
              )}
              title={isConnected ? 'Connected' : 'Reconnecting…'}
            />
          </div>
          {navItems.map((item) => (
            <Tooltip key={item.label}>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    'h-11 w-11 rounded-xl flex items-center justify-center transition-all zc-tap',
                    item.active
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>

        <div className="flex flex-col items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => { setAiPanelOpen(!aiPanelOpen); if (!aiPanelOpen) setSettingsOpen(false) }}
                className={cn(
                  'h-11 w-11 rounded-xl flex items-center justify-center transition-all zc-tap',
                  aiPanelOpen
                    ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Sparkles className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">AI Assistant</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => { setSettingsOpen(!settingsOpen); if (!settingsOpen) setAiPanelOpen(false) }}
                className={cn(
                  'h-11 w-11 rounded-xl flex items-center justify-center transition-all zc-tap',
                  settingsOpen
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Settings className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Settings</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="h-11 w-11 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground zc-tap"
              >
                {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Toggle theme</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setProfileOpen(true)}
                className="mt-1 zc-tap"
              >
                <ChatAvatar
                  emoji={currentUser?.avatarEmoji || '🙂'}
                  color={currentUser?.avatarColor || 'emerald'}
                  size="sm"
                  online
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Profile</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleLogout}
                className="h-11 w-11 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive zc-tap"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Sign out</TooltipContent>
          </Tooltip>
        </div>
      </aside>

      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </TooltipProvider>
  )
}
