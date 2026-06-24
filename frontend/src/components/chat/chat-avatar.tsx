'use client'

import { memo, useState } from 'react'
import { cn } from '@/lib/utils'
import { AVATAR_COLORS } from '@/lib/types'
import { avatarIconUrl, isLegacyEmoji, resolveAvatarKey } from '@/lib/icons'
import { defaultAvatarForUser } from '@/lib/animated-stickers'

interface ChatAvatarProps {
  emoji: string
  color: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  online?: boolean
  className?: string
  ring?: boolean
  userId?: string
  // When true, loads the avatar image eagerly (no lazy-loading). Use for the
  // first few visible chat-list avatars so they appear instantly on first paint.
  eager?: boolean
}

const sizeMap = {
  sm: { box: 'h-9 w-9', img: 32 },
  md: { box: 'h-11 w-11', img: 40 },
  lg: { box: 'h-14 w-14', img: 52 },
  xl: { box: 'h-20 w-20', img: 72 },
}

const dotSize = {
  sm: 'h-2.5 w-2.5',
  md: 'h-3 w-3',
  lg: 'h-3.5 w-3.5',
  xl: 'h-4 w-4',
}

function ChatAvatarImpl({ emoji, color, size = 'md', online, className, ring, userId, eager }: ChatAvatarProps) {
  const [imgError, setImgError] = useState(false)
  const s = sizeMap[size]
  const iconKey = resolveAvatarKey(emoji)
  const legacy = isLegacyEmoji(emoji)
  const showDefault = (!emoji || legacy || !iconKey) && userId
  const defaultUrl = showDefault ? defaultAvatarForUser(userId) : null
  const loadingAttr = eager ? 'eager' : 'lazy'

  return (
    <div className={cn('relative shrink-0', className)}>
      <div
        className={cn(
          'flex items-center justify-center rounded-full shadow-sm select-none overflow-hidden',
          showDefault ? '' : cn('bg-gradient-to-br', AVATAR_COLORS[color] || AVATAR_COLORS.emerald),
          s.box,
          ring && 'ring-2 ring-background'
        )}
      >
        {legacy ? (
          <span className="text-lg leading-none">{emoji || '🦊'}</span>
        ) : showDefault && defaultUrl ? (
          <img
            src={defaultUrl}
            alt="avatar"
            loading={loadingAttr}
            className="w-full h-full object-cover"
          />
        ) : imgError ? (
          <span className="text-white font-bold uppercase" style={{ fontSize: s.img * 0.45 }}>
            {iconKey[0]}
          </span>
        ) : (
          <img
            src={avatarIconUrl(iconKey)}
            alt={iconKey}
            width={s.img}
            height={s.img}
            loading={loadingAttr}
            onError={() => setImgError(true)}
            className="object-contain drop-shadow-sm"
            style={{ width: `${s.img * 0.72}px`, height: `${s.img * 0.72}px` }}
          />
        )}
      </div>
      {online !== undefined && (
        <span
          className={cn(
            'absolute -bottom-0 -right-0 rounded-full border-2 border-background',
            dotSize[size],
            online ? 'bg-emerald-500 zc-online-pulse' : 'bg-zinc-400'
          )}
        />
      )}
    </div>
  )
}

export const ChatAvatar = memo(ChatAvatarImpl)
