'use client'

import { useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { AVATAR_COLORS, resolveAvatarKey } from '@/lib/types'
import { avatarIconUrl, isLegacyEmoji } from '@/lib/icons'

interface ChatAvatarProps {
  emoji: string // icon key (e.g. "fox") or legacy emoji
  color: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  online?: boolean
  className?: string
  ring?: boolean
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

export function ChatAvatar({ emoji, color, size = 'md', online, className, ring }: ChatAvatarProps) {
  const [imgError, setImgError] = useState(false)
  const gradient = AVATAR_COLORS[color] || AVATAR_COLORS.emerald
  const s = sizeMap[size]
  const iconKey = resolveAvatarKey(emoji)
  const legacy = isLegacyEmoji(emoji)

  return (
    <div className={cn('relative shrink-0', className)}>
      <div
        className={cn(
          'flex items-center justify-center rounded-full bg-gradient-to-br shadow-sm select-none overflow-hidden',
          gradient,
          s.box,
          ring && 'ring-2 ring-background'
        )}
      >
        {legacy ? (
          // Legacy emoji fallback
          <span className="text-lg leading-none">{emoji || '🦊'}</span>
        ) : imgError ? (
          // Image load failed — show first letter
          <span className="text-white font-bold uppercase" style={{ fontSize: s.img * 0.45 }}>
            {iconKey[0]}
          </span>
        ) : (
          <Image
            src={avatarIconUrl(iconKey)}
            alt={iconKey}
            width={s.img}
            height={s.img}
            onError={() => setImgError(true)}
            className="object-contain drop-shadow-sm"
            unoptimized
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
