'use client'

import { useState } from 'react'
import {
  MessageCircle,
  Settings,
  LogOut,
  Moon,
  Sun,
  Bookmark,
  Users,
  Megaphone,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { useChatStore } from '@/stores/chat-store'
import { ChatAvatar } from './chat-avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { lazy, Suspense } from 'react'

const ProfileDialog = lazy(() => import('./profile-dialog').then(m => ({ default: m.ProfileDialog })))
import { cn } from '@/lib/utils'
import { apiPost } from '@/lib/api'
import Image from 'next/image'

export function Sidebar() {
  const { theme, setTheme } = useTheme()
  const currentUser = useChatStore((s) => s.currentUser)
  const setSettingsOpen = useChatStore((s) => s.setSettingsOpen)
  const settingsOpen = useChatStore((s) => s.settingsOpen)
  const setCurrentUser = useChatStore((s) => s.setCurrentUser)
  const [profileOpen, setProfileOpen] = useState(false)

  const chats = useChatStore((s) => s.chats)
  const setActiveChatId = useChatStore((s) => s.setActiveChatId)
  const activeChatId = useChatStore((s) => s.activeChatId)

  const isConnected = useChatStore((s) => s.isConnected)
  const e2eeEnabled = useChatStore((s) => s.e2eeEnabled)
  const setConnectionsPanelOpen = useChatStore((s) => s.setConnectionsPanelOpen)
  const connectionsPanelOpen = useChatStore((s) => s.connectionsPanelOpen)

  async function handleLogout() {
    await apiPost('/api/auth/logout')
    setCurrentUser(null)
    toast.success('Signed out')
  }

  const savedChat = chats.find((c) => c.type === 'saved')
  const isSavedActive = savedChat && activeChatId === savedChat.id

  const navItems = [
    { icon: MessageCircle, label: 'Chats', active: !connectionsPanelOpen && !settingsOpen && !isSavedActive, onClick: () => { setConnectionsPanelOpen(false); setSettingsOpen(false); if (isSavedActive) setActiveChatId(null); } },
    { icon: Users, label: 'Connections', active: connectionsPanelOpen, onClick: () => { setConnectionsPanelOpen(!connectionsPanelOpen); } },
    { icon: Bookmark, label: 'Saved', active: !!isSavedActive, onClick: () => {
        if (savedChat) {
          setActiveChatId(savedChat.id)
        } else {
          toast.error('Saved Messages not found')
        }
      } 
    },
  ]

  return (
    <TooltipProvider delayDuration={150}>
      <aside className="hidden md:flex w-[72px] shrink-0 flex-col items-center justify-between border-r bg-card/75 backdrop-blur-xl zc-glass-sidebar py-5 select-none shadow-sm">
        <div className="flex flex-col items-center gap-3 w-full px-2">
          <div className="mb-2 relative h-12 w-12 flex items-center justify-center group cursor-pointer">
            <div className="absolute -inset-1 rounded-2xl bg-emerald-500/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
            <Image src="/logo.png" alt="Cryptalk" width={44} height={44} className="object-contain relative z-10 transition-transform group-hover:scale-105" priority />
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background z-20',
                isConnected ? 'bg-emerald-500 zc-online-pulse' : 'bg-amber-500'
              )}
              title={isConnected ? 'Connected' : 'Reconnecting…'}
            />
            {e2eeEnabled && (
              <span
                className="absolute -top-0.5 -left-0.5 h-4 w-4 rounded-full bg-emerald-500 border-2 border-background flex items-center justify-center z-20 shadow-sm"
                title="End-to-end encrypted"
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
            )}
          </div>
          {navItems.map((item) => (
            <Tooltip key={item.label}>
              <TooltipTrigger asChild>
                <button
                  onClick={(item as any).onClick}
                  className={cn(
                    'h-11 w-11 rounded-2xl flex items-center justify-center transition-all zc-tap relative group',
                    item.active
                      ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25 font-semibold'
                      : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-semibold text-xs">{item.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3 w-full px-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => { setSettingsOpen(!settingsOpen); if (!settingsOpen) setConnectionsPanelOpen(false) }}
                className={cn(
                  'h-11 w-11 rounded-2xl flex items-center justify-center transition-all zc-tap',
                  settingsOpen
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25'
                    : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground'
                )}
              >
                <Settings className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-semibold text-xs">Settings</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="h-11 w-11 rounded-2xl flex items-center justify-center text-muted-foreground hover:bg-accent/70 hover:text-foreground zc-tap transition-colors"
              >
                {theme === 'dark' ? <Sun className="h-5 w-5 text-amber-400" /> : <Moon className="h-5 w-5 text-indigo-500" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-semibold text-xs">Toggle theme</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setProfileOpen(true)}
                className="mt-1 zc-tap transition-transform hover:scale-105"
              >
                <ChatAvatar
                  emoji={currentUser?.avatarEmoji || '🙂'}
                  color={currentUser?.avatarColor || 'emerald'}
                  size="sm"
                  online
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-semibold text-xs">Profile</TooltipContent>
          </Tooltip>
        </div>
      </aside>

      {profileOpen && (
        <Suspense fallback={null}>
          <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
        </Suspense>
      )}
    </TooltipProvider>
  )
}
