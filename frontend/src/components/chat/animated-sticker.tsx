'use client'

import { lazy, Suspense, useState } from 'react'
import { ANIMATED_STICKERS, ANIMATED_STICKER_EMOJI, animatedStickerUrl, isAnimatedSticker } from '@/lib/animated-stickers'
import { ANIMATED_EMOJIS, ANIMATED_EMOJI_CATEGORIES } from '@/lib/animated-emojis-metadata'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

const Player = lazy(() => import('@lottiefiles/react-lottie-player').then(m => ({ default: m.Player })))

export function AnimatedStickerDisplay({ name, size = 128 }: { name: string; size?: number }) {
  if (!isAnimatedSticker(name)) {
    return <span style={{ fontSize: size * 0.6 }}>{name}</span>
  }

  let fallbackChar = '⭐'
  if (name.startsWith('noto-')) {
    const codepoint = name.substring(5)
    const matched = ANIMATED_EMOJIS.find(e => e.codepoint === codepoint)
    if (matched) fallbackChar = matched.char
  } else {
    fallbackChar = ANIMATED_STICKER_EMOJI[name] || '⭐'
  }

  return (
    <Suspense fallback={<span style={{ fontSize: size * 0.6 }}>{fallbackChar}</span>}>
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
  const [activeTab, setActiveTab] = useState<string>('Custom')

  const filteredEmojis = activeTab === 'Custom'
    ? []
    : ANIMATED_EMOJIS.filter(e => e.category === activeTab)

  return (
    <div className="flex flex-col space-y-2 h-72">
      {/* Category Tabs list */}
      <div className="flex items-center space-x-1 overflow-x-auto pb-1 zc-scroll shrink-0 border-b">
        <button
          onClick={() => setActiveTab('Custom')}
          className={cn(
            "text-xs font-semibold px-2.5 py-1.5 rounded-md transition-all shrink-0 zc-tap",
            activeTab === 'Custom'
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-accent"
          )}
        >
          Custom
        </button>
        {ANIMATED_EMOJI_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={cn(
              "text-xs font-semibold px-2.5 py-1.5 rounded-md transition-all shrink-0 zc-tap",
              activeTab === cat
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Stickers Grid */}
      <ScrollArea className="flex-1 w-full rounded-md pr-1">
        {activeTab === 'Custom' ? (
          <div className="grid grid-cols-4 gap-2 p-1">
            {ANIMATED_STICKERS.map((name) => (
              <button
                key={name}
                onClick={() => onSelect(name)}
                className="aspect-square rounded-xl bg-accent/40 hover:bg-primary/10 hover:scale-105 transition-all flex items-center justify-center p-1 zc-tap"
                title={name}
              >
                <AnimatedStickerDisplay name={name} size={48} />
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-2 p-1">
            {filteredEmojis.map((emoji) => {
              const name = `noto-${emoji.codepoint}`
              return (
                <button
                  key={emoji.codepoint}
                  onClick={() => onSelect(name)}
                  className="aspect-square rounded-xl bg-accent/40 hover:bg-primary/10 hover:scale-110 transition-all flex items-center justify-center p-1 text-2xl zc-tap"
                  title={emoji.name}
                >
                  <Suspense fallback={<span>{emoji.char}</span>}>
                    <img
                      src={`https://fonts.gstatic.com/s/e/notoemoji/latest/${emoji.codepoint}/512.webp`}
                      alt={emoji.name}
                      width={36}
                      height={36}
                      loading="lazy"
                      className="object-contain"
                      onError={(e) => {
                        // fallback to text character if webp fails to load
                        (e.target as any).style.display = 'none';
                      }}
                    />
                  </Suspense>
                </button>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
