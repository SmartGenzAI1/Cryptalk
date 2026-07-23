// icon registry: maps icon keys to local image files in /public/icons/.
// DB stores only the icon key (e.g. "fox"); this module resolves it to an asset URL.

// avatar icons (animals)
export const AVATAR_ICONS = [
  'fox', 'cat', 'dog', 'bird', 'fish', 'lion', 'panda', 'unicorn',
  'giraffe', 'elephant', 'rabbit', 'owl', 'bear', 'frog', 'turtle',
  'dolphin', 'butterfly', 'dragon', 'dinosaur', 'hedgehog', 'parrot',
  'horse', 'cow', 'chicken', 'duck', 'crab', 'octopus', 'jellyfish',
  'snail', 'spider', 'bat', 'deer', 'kangaroo', 'rhinoceros',
  'hippopotamus', 'snake', 'lizard', 'chameleon', 'starfish', 'seahorse',
] as const

export type AvatarIcon = (typeof AVATAR_ICONS)[number]

// chat type icons
export const CHAT_ICONS = {
  direct: 'chat',
  group: 'groups',
  channel: 'megaphone',
  saved: 'bookmark',
} as const

// sticker icons
export const STICKER_ICONS = [
  'like', 'star', 'gift', 'birthday-cake', 'rocket',
  'trophy', 'crown', 'diamond', 'rainbow', 'sun',
  'moon', 'cloud', 'flower', 'mountain', 'volcano', 'island',
] as const

// url resolvers

export function avatarIconUrl(key: string): string {
  if (!key || isLegacyEmoji(key) || !(AVATAR_ICONS as readonly string[]).includes(key)) {
    return `/icons/avatars/fox.png`
  }
  return `/icons/avatars/${key}.png`
}

export function chatIconUrl(key: string): string {
  const mapped = (CHAT_ICONS as Record<string, string>)[key] || key
  return `/icons/chat/${mapped}.png`
}

export function stickerIconUrl(key: string): string {
  if (isLegacyEmoji(key)) return stickerIconUrl('star') // fallback
  return `/icons/stickers/${key}.png`
}

export function uiIconUrl(key: string): string {
  return `/icons/ui/${key}.png`
}

// helpers

// detect legacy emoji values (non-ascii, short strings) stored in the DB
export function isLegacyEmoji(value: string | undefined | null): boolean {
  if (!value) return true
  return value.length <= 4 && /[^\x00-\x7F]/.test(value)
}

export function resolveAvatarKey(value: string | undefined | null): string {
  if (!value || isLegacyEmoji(value)) return 'fox'
  return value
}

export function isValidStickerKey(value: string): boolean {
  return !isLegacyEmoji(value)
}
