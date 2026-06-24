'use client'

import { lazy, Suspense } from 'react'
import { ANIMATED_STICKERS, ANIMATED_STICKER_EMOJI, animatedStickerUrl, isAnimatedSticker } from '@/lib/animated-stickers'

const Player = lazy(() => import('@lottiefiles/react-lottie-player').then(m => ({ default: m.Player })))

export function AnimatedStickerDisplay({ name, size = 128 }: { name: string; size?: number }) {
  if (!isAnimatedSticker(name)) {
    return <span style={{ fontSize: size * 0.6 }}>{name}</span>
  }
  return (
    <Suspense fallback={<span style={{ fontSize: size * 0.6 }}>{ANIMATED_STICKER_EMOJI[name] || '⭐'}</span>}>
      <Player
        src={animatedStickerUrl(name)}
        loop
        autoplay
        style={{ width: size, height: size }}
      />
    </Suspense>
  )
}

export function AnimatedStickerPicker({ onSelect }: { onSelect: (name: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto zc-scroll">
      {ANIMATED_STICKERS.map((name) => (
        <button
          key={name}
          onClick={() => onSelect(name)}
          className="aspect-square rounded-xl bg-accent hover:bg-primary/15 hover:scale-105 transition-all flex items-center justify-center zc-tap"
          title={name}
        >
          <AnimatedStickerDisplay name={name} size={48} />
        </button>
      ))}
    </div>
  )
}
