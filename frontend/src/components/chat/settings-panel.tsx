'use client'

import { useState } from 'react'
import {
  X,
  Palette,
  Image as ImageIcon,
  Moon,
  Sun,
  Bell,
  Shield,
  Info,
  Star,
  User,
  Check,
} from 'lucide-react'
import { useChatStore } from '@/stores/chat-store'
import { useTheme } from 'next-themes'
import { ChatAvatar } from './chat-avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { ACCENT_HEX, AVATAR_COLORS, AVATAR_COLOR_KEYS, WALLPAPERS } from '@/lib/types'
import { updateUserSettings } from '@/lib/actions'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function SettingsPanel() {
  const currentUser = useChatStore((s) => s.currentUser)
  const setCurrentUser = useChatStore((s) => s.setCurrentUser)
  const setSettingsOpen = useChatStore((s) => s.setSettingsOpen)
  const { theme, setTheme } = useTheme()
  const [accent, setAccent] = useState(currentUser?.accentColor || 'emerald')
  const [wallpaper, setWallpaper] = useState(currentUser?.wallpaper || 'dots')
  const [saving, setSaving] = useState(false)

  if (!currentUser) return null

  async function applyAccent(c: string) {
    setAccent(c)
    document.documentElement.style.setProperty('--accent-hex', ACCENT_HEX[c] || ACCENT_HEX.emerald)
    await save({ accentColor: c })
  }

  async function applyWallpaper(w: string) {
    setWallpaper(w)
    await save({ wallpaper: w })
  }

  async function save(patch: any) {
    setSaving(true)
    try {
      const data = await updateUserSettings(patch)
      if (data.user) setCurrentUser(data.user)
    } catch (e: any) {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full sm:w-[380px] shrink-0 border-l flex flex-col bg-sidebar/60 zc-glass-sidebar">
      <div className="flex items-center gap-2 px-4 h-16 border-b shrink-0">
        <span className="font-semibold flex-1 text-lg">Settings</span>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setSettingsOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 zc-scroll">
        <div className="p-4 space-y-6">
          {/* Profile */}
          <div className="flex flex-col items-center text-center">
            <ChatAvatar emoji={currentUser.avatarEmoji} color={currentUser.avatarColor} size="xl" />
            <h2 className="text-xl font-bold mt-3">{currentUser.name}</h2>
            <p className="text-sm text-muted-foreground">@{currentUser.username}</p>
            {currentUser.bio && <p className="text-sm mt-2 text-center">{currentUser.bio}</p>}
          </div>

          {/* Theme */}
          <Section icon={<Moon className="h-4 w-4" />} title="Appearance">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setTheme('light')}
                className={cn(
                  'flex items-center gap-2 p-3 rounded-xl border transition-colors zc-tap',
                  theme === 'light' ? 'bg-accent border-primary' : 'border-border hover:bg-accent/50'
                )}
              >
                <Sun className="h-4 w-4" />
                <span className="text-sm font-medium">Light</span>
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={cn(
                  'flex items-center gap-2 p-3 rounded-xl border transition-colors zc-tap',
                  theme === 'dark' ? 'bg-accent border-primary' : 'border-border hover:bg-accent/50'
                )}
              >
                <Moon className="h-4 w-4" />
                <span className="text-sm font-medium">Dark</span>
              </button>
            </div>
          </Section>

          {/* Accent color */}
          <Section icon={<Palette className="h-4 w-4" />} title="Accent color">
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLOR_KEYS.map((c) => (
                <button
                  key={c}
                  onClick={() => applyAccent(c)}
                  className={cn(
                    'h-10 w-10 rounded-full bg-gradient-to-br transition-all zc-tap',
                    AVATAR_COLORS[c],
                    accent === c ? 'ring-2 ring-offset-2 ring-offset-background scale-110' : 'hover:scale-105'
                  )}
                >
                  {accent === c && <Check className="h-5 w-5 text-white mx-auto drop-shadow" />}
                </button>
              ))}
            </div>
          </Section>

          {/* Wallpaper */}
          <Section icon={<ImageIcon className="h-4 w-4" />} title="Chat wallpaper">
            <div className="grid grid-cols-5 gap-2">
              {WALLPAPERS.map((w) => (
                <button
                  key={w}
                  onClick={() => applyWallpaper(w)}
                  className={cn(
                    'aspect-square rounded-xl border-2 transition-all zc-tap overflow-hidden relative',
                    wallpaper === w ? 'border-primary' : 'border-transparent hover:border-border'
                  )}
                >
                  <div className={cn(
                    'absolute inset-0',
                    w === 'dots' && 'zc-wallpaper-dots',
                    w === 'gradient' && 'zc-wallpaper-gradient',
                    w === 'plain' && 'zc-wallpaper-plain',
                    w === 'grid' && 'zc-wallpaper-grid',
                    w === 'waves' && 'zc-wallpaper-waves'
                  )} />
                  {wallpaper === w && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Check className="h-5 w-5 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </Section>

          {/* Preferences */}
          <Section icon={<Bell className="h-4 w-4" />} title="Preferences">
            <div className="space-y-3">
              <Row label="Notifications" desc="Get notified of new messages">
                <Switch defaultChecked />
              </Row>
              <Row label="Read receipts" desc="Show others you read their messages">
                <Switch defaultChecked />
              </Row>
            </div>
          </Section>

          {/* Quick links */}
          <Section icon={<Star className="h-4 w-4" />} title="More">
            <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent transition-colors text-left zc-tap mt-1">
              <div className="h-9 w-9 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-500">
                <Star className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">Starred messages</div>
                <div className="text-xs text-muted-foreground">View your favorites</div>
              </div>
            </button>
            <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent transition-colors text-left zc-tap mt-1">
              <div className="h-9 w-9 rounded-lg bg-sky-500/15 flex items-center justify-center text-sky-500">
                <Shield className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">Privacy & security</div>
                <div className="text-xs text-muted-foreground">Manage your data</div>
              </div>
            </button>
            <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent transition-colors text-left zc-tap mt-1">
              <div className="h-9 w-9 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-500">
                <Info className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">About Cryptalk</div>
                <div className="text-xs text-muted-foreground">Version 2.0 • Premium</div>
              </div>
            </button>
          </Section>

          <div className="text-center text-xs text-muted-foreground py-2">
            {saving && 'Saving…'}Cryptalk · Made with ✨
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2.5 px-1">
        {icon}
        {title}
      </div>
      {children}
    </div>
  )
}

function Row({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      {children}
    </div>
  )
}
