// Shared types for Cryptalk

export type ChatType = 'direct' | 'group' | 'channel' | 'saved'

export interface SafeUser {
  id: string
  username: string
  name: string
  bio: string
  avatarColor: string
  avatarEmoji: string // icon name (e.g. "fox") or legacy emoji
  isOnline: boolean
  lastSeen: string
  accentColor?: string
  wallpaper?: string
  email?: string
}

export interface ChatWithMembers {
  id: string
  type: ChatType
  title: string
  description: string
  avatarColor: string
  avatarEmoji: string
  createdBy: string
  createdAt: string
  members: Array<{
    id: string
    role: string
    user: SafeUser
    lastReadAt: string
    pinnedAt?: string | null
    muted?: boolean
    pinnedMessageId?: string | null
  }>
}

export interface MessageWithSender {
  id: string
  chatId: string
  senderId: string
  content: string
  type: string
  replyToId: string | null
  replyTo?: {
    id: string
    content: string
    type: string
    senderId: string
    senderName: string
  } | null
  editedAt: string | null
  createdAt: string
  deletedAt: string | null
  duration?: number | null
  starred?: boolean
  pinned?: boolean
  expiresIn?: number | null
  status?: string | null
  sender: SafeUser
  reactions: Array<{
    id: string
    emoji: string
    user: SafeUser
  }>
}

export function toSafeUser(u: any): SafeUser {
  const seed = u.username || u.id || 'default'
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  const colorKeys = Object.keys(AVATAR_COLORS)
  const colorIndex = Math.abs(hash) % colorKeys.length
  
  const iconFallback = [
    "fox", "cat", "dog", "bird", "fish", "lion", "panda", "unicorn",
    "giraffe", "elephant", "rabbit", "owl", "bear", "frog", "turtle",
    "dolphin", "butterfly", "dragon", "dinosaur", "hedgehog", "parrot",
    "horse", "cow", "chicken", "duck", "crab", "octopus", "jellyfish",
  ]
  const emojiIndex = Math.abs(hash + 1) % iconFallback.length
  
  const detColor = colorKeys[colorIndex]
  const detEmoji = iconFallback[emojiIndex]

  let avatarColor = u.avatarColor || detColor
  let avatarEmoji = u.avatarEmoji || detEmoji
  let accentColor = u.accentColor || 'emerald'
  let wallpaper = u.wallpaper || 'dots'

  if (typeof window !== 'undefined') {
    const currentUserStr = localStorage.getItem('zc-currentUser')
    if (currentUserStr) {
      try {
        const curUser = JSON.parse(currentUserStr)
        if (curUser && curUser.id === u.id) {
          avatarColor = localStorage.getItem('zc-avatarColor') || avatarColor
          avatarEmoji = localStorage.getItem('zc-avatarEmoji') || avatarEmoji
          accentColor = localStorage.getItem('zc-accentColor') || accentColor
          wallpaper = localStorage.getItem('zc-wallpaper') || wallpaper
        }
      } catch (e) {}
    }
  }

  return {
    id: u.id,
    username: u.username,
    name: u.name,
    bio: u.bio ?? '',
    avatarColor,
    avatarEmoji,
    isOnline: u.isOnline ?? false,
    lastSeen: u.lastSeen?.toISOString?.() ?? u.lastSeen ?? new Date().toISOString(),
    accentColor,
    wallpaper,
    email: u.email ?? '',
  }
}

// avatar color palette → tailwind gradient classes
export const AVATAR_COLORS: Record<string, string> = {
  emerald: 'from-emerald-400 to-teal-500',
  violet: 'from-violet-400 to-fuchsia-500',
  rose: 'from-rose-400 to-pink-500',
  amber: 'from-amber-400 to-orange-500',
  cyan: 'from-cyan-400 to-sky-500',
  lime: 'from-lime-400 to-green-500',
  purple: 'from-purple-400 to-violet-500',
  teal: 'from-teal-400 to-emerald-500',
}

export const AVATAR_COLOR_KEYS = Object.keys(AVATAR_COLORS)

// accent color → hex (for dynamic theming)
export const ACCENT_HEX: Record<string, string> = {
  emerald: '#10b981',
  violet: '#8b5cf6',
  rose: '#f43f5e',
  amber: '#f59e0b',
  cyan: '#06b6d4',
  lime: '#84cc16',
  purple: '#a855f7',
  teal: '#14b8a6',
}

// wallpaper options
export const WALLPAPERS = ['dots', 'gradient', 'plain', 'grid', 'waves'] as const
export type Wallpaper = typeof WALLPAPERS[number]

// re-exported from icons module for backward compat
export {
  AVATAR_ICONS,
  STICKER_ICONS,
  CHAT_ICONS as CHAT_TYPE_ICONS,
  avatarIconUrl as iconUrl,
  avatarIconUrl,
  stickerIconUrl,
  chatIconUrl,
  uiIconUrl,
  isLegacyEmoji as isEmoji,
  isLegacyEmoji,
  resolveAvatarKey as resolveAvatarIcon,
  resolveAvatarKey,
} from '@/lib/icons'
