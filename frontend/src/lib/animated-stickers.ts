export const DEFAULT_AVATARS = [
  'avatar-1', 'avatar-2', 'avatar-3', 'avatar-4',
  'avatar-5', 'avatar-6', 'avatar-7', 'avatar-8',
] as const

export function defaultAvatarUrl(index: number): string {
  const i = ((index % 8) + 8) % 8
  return `/icons/defaults/${DEFAULT_AVATARS[i]}.svg`
}

export function defaultAvatarForUser(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0
  }
  return defaultAvatarUrl(Math.abs(hash))
}

export const ANIMATED_STICKERS = [
  'thumbs-up', 'heart', 'laughing', 'fire', 'party', 'clap', 'wave', 'star',
] as const

export type AnimatedSticker = (typeof ANIMATED_STICKERS)[number]

export const ANIMATED_STICKER_EMOJI: Record<string, string> = {
  'thumbs-up': '👍',
  'heart': '❤️',
  'laughing': '😂',
  'fire': '🔥',
  'party': '🎉',
  'clap': '👏',
  'wave': '👋',
  'star': '⭐',
}

export function animatedStickerUrl(name: string): string {
  return `/lottie/${name}.json`
}

export function isAnimatedSticker(value: string): boolean {
  return (ANIMATED_STICKERS as readonly string[]).includes(value)
}
