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

import { ANIMATED_EMOJIS } from './animated-emojis-metadata'

export const ANIMATED_STICKERS = [
  'thumbs-up', 'heart', 'laughing', 'fire', 'party', 'clap', 'wave', 'star',
  'noto-1f680', 'noto-1f92f', 'noto-1f914', 'noto-1f622', 'noto-1f60e', 'noto-1f621',
  'noto-1f4a9', 'noto-1f984', 'noto-1f60d', 'noto-1f609', 'noto-1f631', 'noto-1f618',
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
  'noto-1f680': '🚀',
  'noto-1f92f': '🤯',
  'noto-1f914': '🤔',
  'noto-1f622': '😢',
  'noto-1f60e': '😎',
  'noto-1f621': '😡',
  'noto-1f4a9': '💩',
  'noto-1f984': '🦄',
  'noto-1f60d': '😍',
  'noto-1f609': '😉',
  'noto-1f631': '😱',
  'noto-1f618': '😘',
}

// Map standard emojis to local sticker keys
export const EMOJI_TO_STICKER: Record<string, string> = {
  '👍': 'thumbs-up',
  '❤️': 'heart',
  '😂': 'laughing',
  '🔥': 'fire',
  '🎉': 'party',
  '👏': 'clap',
  '👋': 'wave',
  '⭐': 'star',
  '🚀': 'noto-1f680',
  '🤯': 'noto-1f92f',
  '🤔': 'noto-1f914',
  '😢': 'noto-1f622',
  '😎': 'noto-1f60e',
  '😡': 'noto-1f621',
  '💩': 'noto-1f4a9',
  '🦄': 'noto-1f984',
  '😍': 'noto-1f60d',
  '😉': 'noto-1f609',
  '😱': 'noto-1f631',
  '😘': 'noto-1f618',
}

export function isAnimatedSticker(value: string | undefined | null): boolean {
  if (!value) return false
  if (value.startsWith('noto-')) return true
  if (EMOJI_TO_STICKER[value]) return true
  return (ANIMATED_STICKERS as readonly string[]).includes(value as any)
}

export function animatedStickerUrl(name: string): string {
  if (name.startsWith('noto-')) {
    const codepoint = name.substring(5)
    return `https://fonts.gstatic.com/s/e/notoemoji/latest/${codepoint}/lottie.json`
  }
  const resolved = EMOJI_TO_STICKER[name] || name
  return `/lottie/${resolved}.json`
}

export function getAnimatedEmojiCodepoint(char: string): string | null {
  const match = ANIMATED_EMOJIS.find(e => e.char === char)
  return match ? match.codepoint : null
}

export function getAnimatedEmojisForText(text: string): string[] | null {
  if (!text) return null
  const trimmed = text.trim()
  if (!trimmed) return null

  try {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
    const segments = Array.from(segmenter.segment(trimmed))
      .map(s => s.segment)
      .filter(s => s.trim() !== '')

    if (segments.length === 0 || segments.length > 3) return null

    const codepoints: string[] = []
    for (const seg of segments) {
      let cp = getAnimatedEmojiCodepoint(seg)
      if (!cp) {
        const cleanSeg = seg.replace(/\uFE0F/g, '')
        cp = getAnimatedEmojiCodepoint(cleanSeg)
      }
      if (!cp) {
        return null
      }
      codepoints.push(cp)
    }
    return codepoints
  } catch (e) {
    const cp = getAnimatedEmojiCodepoint(trimmed)
    return cp ? [cp] : null
  }
}

