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
  ArrowLeft,
  Trash2,
  AlertTriangle,
  Lock,
  Zap,
  KeyRound,
  Bookmark,
  LogOut,
  Heart,
} from 'lucide-react'
import { useChatStore } from '@/stores/chat-store'
import { useTheme } from 'next-themes'
import { ChatAvatar } from './chat-avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { ACCENT_HEX, AVATAR_COLORS, AVATAR_COLOR_KEYS, WALLPAPERS } from '@/lib/types'
import { updateUserSettings, deleteAccount } from '@/lib/actions'
import { apiPost } from '@/lib/api'
import { clearAllKeys } from '@/lib/key-store'
import { clearChatCache } from '@/lib/message-cache'
import { clearAttachmentCache } from '@/lib/attachments'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

type SettingsView = 'main' | 'privacy' | 'about' | 'delete'

function maskEmail(email: string): string {
  if (!email) return ''
  const [localPart, domain] = email.split('@')
  if (!domain) return email
  if (localPart.length <= 3) {
    return `${localPart}****@${domain}`
  }
  return `${localPart.slice(0, 3)}****${localPart.slice(-2)}@${domain}`
}

export function SettingsPanel() {
  const currentUser = useChatStore((s) => s.currentUser)
  const setCurrentUser = useChatStore((s) => s.setCurrentUser)
  const setSettingsOpen = useChatStore((s) => s.setSettingsOpen)
  const chats = useChatStore((s) => s.chats)
  const setActiveChatId = useChatStore((s) => s.setActiveChatId)
  const { theme, setTheme } = useTheme()
  const [accent, setAccent] = useState(currentUser?.accentColor || 'emerald')
  const [wallpaper, setWallpaper] = useState(currentUser?.wallpaper || 'dots')
  const [saving, setSaving] = useState(false)
  const [subView, setSubView] = useState<SettingsView>('main')
  const [deleteConfirmUsername, setDeleteConfirmUsername] = useState('')

  if (!currentUser) return null

  const handleOpenSaved = () => {
    const savedChat = chats.find((c) => c.type === 'saved')
    if (savedChat) {
      setActiveChatId(savedChat.id)
      setSettingsOpen(false)
    } else {
      toast.error('Saved Messages not found')
    }
  }

  async function applyAccent(c: string) {
    setAccent(c)
    document.documentElement.style.setProperty('--accent-hex', ACCENT_HEX[c] || ACCENT_HEX.emerald)
    if (typeof window !== 'undefined') {
      localStorage.setItem('zc-accentColor', c)
    }
    if (currentUser) {
      setCurrentUser({ ...currentUser, accentColor: c })
    }
  }

  async function applyWallpaper(w: string) {
    setWallpaper(w)
    if (typeof window !== 'undefined') {
      localStorage.setItem('zc-wallpaper', w)
    }
    if (currentUser) {
      setCurrentUser({ ...currentUser, wallpaper: w })
    }
  }

  async function handleClearData() {
    if (
      !confirm(
        'Are you sure you want to clear all E2EE keys and cache? You will lose access to decrypting previous encrypted group/private messages.'
      )
    )
      return
    try {
      await clearAllKeys()
      await clearChatCache()
      clearAttachmentCache()
      await apiPost('/api/auth/logout')
      setCurrentUser(null)
      toast.success('Local E2EE keys and caches wiped successfully')
      window.location.reload()
    } catch (e) {
      toast.error('Failed to clear keys')
    }
  }

  async function handleDeleteAccount() {
    if (!currentUser) return
    if (deleteConfirmUsername !== currentUser.username) {
      toast.error('Username does not match')
      return
    }
    setSaving(true)
    try {
      await deleteAccount()
      await apiPost('/api/auth/logout')
      // Clear key store & cache
      await clearAllKeys()
      await clearChatCache()
      clearAttachmentCache()
      setCurrentUser(null)
      toast.success('Your account and keys have been permanently deleted')
      window.location.reload()
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete account')
    } finally {
      setSaving(false)
    }
  }

  async function handleLogoutConfirm() {
    if (confirm('Are you sure you want to sign out? Your active session will be closed.')) {
      await handleLogout()
    }
  }

  async function handleLogout() {
    try {
      await apiPost('/api/auth/logout')
      setCurrentUser(null)
      toast.success('Signed out')
    } catch {
      // Force local signout if API fails
      setCurrentUser(null)
    }
  }

  return (
    <div className="w-full h-full shrink-0 md:border-l flex flex-col bg-background shadow-xl">
      {/* HEADER */}
      <div className="flex items-center gap-2 px-4 h-16 border-b shrink-0">
        {subView !== 'main' ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => {
              if (subView === 'delete') {
                setSubView('privacy')
              } else {
                setSubView('main')
              }
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        ) : null}
        <span className="font-semibold flex-1 text-lg">
          {subView === 'main' && 'Settings'}
          {subView === 'privacy' && 'Privacy & Security'}
          {subView === 'about' && 'About Cryptalk'}
          {subView === 'delete' && 'Delete Account'}
        </span>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setSettingsOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 zc-scroll">
        <div className="p-4 space-y-6">
          {subView === 'main' && (
            <div className="space-y-6 zc-fade-in">
              {/* Profile info */}
              <div className="flex flex-col items-center text-center">
                <ChatAvatar emoji={currentUser.avatarEmoji} color={currentUser.avatarColor} size="xl" />
                <h2 className="text-xl font-bold mt-3">{currentUser.name}</h2>
                <p className="text-sm text-muted-foreground">@{currentUser.username}</p>
                {currentUser.email && (
                  <p className="text-xs text-muted-foreground/80 mt-1 font-mono">
                    {maskEmail(currentUser.email)}
                  </p>
                )}
                {currentUser.bio && <p className="text-sm mt-2 text-center text-muted-foreground">{currentUser.bio}</p>}
              </div>

              {/* Theme Settings */}
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

              {/* Menu items */}
              <Section icon={<Star className="h-4 w-4" />} title="More">
                <button
                  onClick={handleOpenSaved}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent transition-colors text-left zc-tap mt-1"
                >
                  <div className="h-9 w-9 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-500">
                    <Bookmark className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">Saved Messages</div>
                    <div className="text-xs text-muted-foreground">Personal cloud & note storage</div>
                  </div>
                </button>

                <button
                  onClick={() => setSubView('privacy')}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent transition-colors text-left zc-tap mt-1"
                >
                  <div className="h-9 w-9 rounded-lg bg-sky-500/15 flex items-center justify-center text-sky-500">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">Privacy & security</div>
                    <div className="text-xs text-muted-foreground">Manage E2EE & your data</div>
                  </div>
                </button>

                <button
                  onClick={() => setSubView('about')}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent transition-colors text-left zc-tap mt-1"
                >
                  <div className="h-9 w-9 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-500">
                    <Info className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">About Cryptalk</div>
                    <div className="text-xs text-muted-foreground">Version 2.0 • Premium Details</div>
                  </div>
                </button>

                <button
                  onClick={handleLogoutConfirm}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-destructive/15 text-destructive transition-colors text-left zc-tap mt-1"
                >
                  <div className="h-9 w-9 rounded-lg bg-destructive/15 flex items-center justify-center text-destructive">
                    <LogOut className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">Sign out</div>
                    <div className="text-xs text-muted-foreground">Close active session</div>
                  </div>
                </button>
              </Section>
            </div>
          )}

          {subView === 'privacy' && (
            <div className="space-y-5 zc-fade-in">
              <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 space-y-2.5">
                <div className="flex items-center gap-2 text-primary font-bold text-sm">
                  <Lock className="h-4 w-4 shrink-0" />
                  End-to-End Encrypted (E2EE)
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Cryptalk encrypts messages client-side using XChaCha20-Poly1305. The keys are stored inside your device's indexedDB key-store and never sent to our servers. Your conversations are completely private.
                </p>
              </div>

              <Section icon={<Shield className="h-4 w-4" />} title="Privacy Policy">
                <div className="space-y-4 px-1 text-sm leading-relaxed text-muted-foreground">
                  <div>
                    <h4 className="font-semibold text-foreground text-xs uppercase mb-1">Zero Log Policy</h4>
                    <p className="text-xs">
                      We do not track, index, or store metadata, IP logs, or analytics. Your messages belong to you, and we collect zero user analytical data.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground text-xs uppercase mb-1">Server Ephemerality</h4>
                    <p className="text-xs">
                      Delivered messages are instantly wiped from the backend database. Undelivered messages or media attachments are automatically deleted once the self-destruct timers or delivery confirms are finalized.
                    </p>
                  </div>
                </div>
              </Section>

              <Section icon={<AlertTriangle className="h-4 w-4" />} title="Data Actions">
                <div className="space-y-2 mt-1">
                  <button
                    onClick={handleClearData}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 border border-dashed border-border transition-colors text-left zc-tap"
                  >
                    <div className="h-9 w-9 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-500">
                      <KeyRound className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">Wipe E2EE keys & cache</div>
                      <div className="text-xs text-muted-foreground">Log out & wipe local data</div>
                    </div>
                  </button>

                  <button
                    onClick={() => setSubView('delete')}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-destructive/10 hover:text-destructive border border-dashed border-border transition-colors text-left zc-tap"
                  >
                    <div className="h-9 w-9 rounded-lg bg-destructive/15 flex items-center justify-center text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">Delete account</div>
                      <div className="text-xs text-muted-foreground">Permanently delete server data</div>
                    </div>
                  </button>
                </div>
              </Section>
            </div>
          )}

          {subView === 'about' && (
            <div className="space-y-6 text-center zc-fade-in py-2">
              <div className="flex flex-col items-center">
                <div className="relative h-20 w-20 rounded-3xl overflow-hidden shadow-lg border bg-gradient-to-br from-emerald-400 to-teal-500 p-3 mb-4 flex items-center justify-center">
                  <span className="text-white text-4xl font-extrabold select-none">C</span>
                </div>
                <h3 className="text-xl font-bold">Cryptalk</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Version 2.0.0 • Production</p>
                <div className="mt-3 px-3 py-1 bg-primary/10 border border-primary/20 text-[10px] font-bold uppercase tracking-wider text-primary rounded-full">
                  ⚡ Premium Lifetime License
                </div>
              </div>

              <p className="text-xs leading-relaxed text-muted-foreground max-w-sm mx-auto px-4">
                Cryptalk is a state-of-the-art secure chat application designed for absolute privacy. Feature-rich, fast, and protected by military-grade client-side encryption.
              </p>

              <div className="grid grid-cols-2 gap-3 text-left">
                <div className="p-3 rounded-xl border bg-accent/30 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Lock className="h-3.5 w-3.5 text-primary" />
                    E2EE Crypto
                  </div>
                  <p className="text-[10px] text-muted-foreground">XChaCha20-Poly1305 secure keys</p>
                </div>
                <div className="p-3 rounded-xl border bg-accent/30 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                    Ultra Fast
                  </div>
                  <p className="text-[10px] text-muted-foreground">Sub-millisecond socket delivery</p>
                </div>
                <div className="p-3 rounded-xl border bg-accent/30 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Shield className="h-3.5 w-3.5 text-blue-500" />
                    Zero Logs
                  </div>
                  <p className="text-[10px] text-muted-foreground">No tracking or analytics</p>
                </div>
                <div className="p-3 rounded-xl border bg-accent/30 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Star className="h-3.5 w-3.5 text-pink-500" />
                    Lottie
                  </div>
                  <p className="text-[10px] text-muted-foreground">Telegram animated emojis</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 text-left space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  About Us (SmartGenzAI)
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  SmartGenzAI is dedicated to building next-generation secure, private, and surveillance-free communication platforms. We believe privacy is a fundamental human right, not a luxury.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-1 text-left">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Important Disclaimer
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Cryptalk is currently in its early phase of development. While cryptographic and E2EE protocols are active, you may encounter bugs. Please do not use it for critical secrets or store irreplaceable data.
                </p>
              </div>

              <div className="border-t pt-4 text-xs text-muted-foreground">
                <p>Designed and built for absolute privacy.</p>
                <p className="font-semibold text-foreground mt-1">© SmartGenzAI. All rights reserved.</p>
              </div>
            </div>
          )}

          {subView === 'delete' && (
            <div className="space-y-5 zc-fade-in">
              <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-center space-y-3">
                <div className="h-12 w-12 rounded-full bg-destructive/20 flex items-center justify-center text-destructive mx-auto">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-bold text-destructive text-base">Irreversible Action</h4>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    This will permanently delete your username, public E2EE key bundles, profile bio, avatar preferences, and active conversations from our database.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl border bg-accent/30 text-xs text-muted-foreground space-y-2 leading-relaxed">
                <p className="font-semibold text-foreground">⚠️ LOCAL DECRYPTION LOSS WARNING:</p>
                <p>
                  Your local cryptographic keys will also be destroyed. Even if some message transcripts remain locally in your browser cache, you will be unable to decrypt them ever again.
                </p>
              </div>

              <div className="space-y-2.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide px-1">
                  To confirm, type your username: <span className="font-mono text-foreground font-semibold">@{currentUser.username}</span>
                </label>
                <Input
                  value={deleteConfirmUsername}
                  onChange={(e) => setDeleteConfirmUsername(e.target.value)}
                  placeholder="Type username here"
                  className="rounded-xl"
                  autoFocus
                />
              </div>

              <div className="space-y-2 pt-2">
                <Button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmUsername !== currentUser.username || saving}
                  className="w-full rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 font-medium py-5 zc-tap"
                >
                  {saving ? 'Deleting Account…' : 'Yes, Delete My Account'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setSubView('privacy')}
                  className="w-full rounded-xl py-5 zc-tap border border-border"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div className="text-center text-xs text-muted-foreground py-3 flex flex-col items-center gap-2">
            <a
              href="https://razorpay.me/@CodeChap?amount=kXxURMaXFk%2Bmrv%2B9uGrYpg%3D%3D"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-pink-500/10 hover:bg-pink-500/20 text-pink-500 font-semibold text-xs transition-colors zc-tap shadow-sm border border-pink-500/20"
            >
              <Heart className="h-3.5 w-3.5 fill-pink-500" /> Support & Sponsor Cryptalk
            </a>
            <span>{saving && 'Saving… '}Cryptalk · Made with ✨</span>
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
