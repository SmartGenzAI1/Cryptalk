/**
 * Icon registry — maps icon keys to local image files.
 *
 * Icons are downloaded from icons8 (color style) and served locally from
 * /public/icons/ for maximum speed and reliability (no external CDN
 * dependency).  The DB stores only the icon key (e.g. "fox"), and this
 * module resolves it to a static asset URL at build time.
 *
 * To add a new icon: drop the file in /public/icons/<category>/ and add
 * the key to the appropriate set below.
 */

// ─── Avatar icons (animals) ────────────────────────────────────────────
export const AVATAR_ICONS = [
  'fox', 'cat', 'dog', 'bird', 'fish', 'lion', 'panda', 'unicorn',
  'giraffe', 'elephant', 'rabbit', 'owl', 'bear', 'frog', 'turtle',
  'dolphin', 'butterfly', 'dragon', 'dinosaur', 'hedgehog', 'parrot',
  'horse', 'cow', 'chicken', 'duck', 'crab', 'octopus', 'jellyfish',
  'snail', 'spider', 'bat', 'deer', 'kangaroo', 'rhinoceros',
  'hippopotamus', 'snake', 'lizard', 'chameleon', 'starfish', 'seahorse',
] as const

export type AvatarIcon = (typeof AVATAR_ICONS)[number]

// ─── Chat type icons ───────────────────────────────────────────────────
export const CHAT_ICONS = {
  direct: 'chat',
  group: 'groups',
  channel: 'megaphone',
  saved: 'bookmark',
} as const

// ─── Sticker icons ─────────────────────────────────────────────────────
export const STICKER_ICONS = [
  'like', 'star', 'gift', 'birthday-cake', 'rocket',
  'trophy', 'crown', 'diamond', 'rainbow', 'sun',
  'moon', 'cloud', 'flower', 'mountain', 'volcano', 'island',
] as const

// ─── URL resolvers ─────────────────────────────────────────────────────

/** Resolve an avatar icon key to a local image URL. */
export function avatarIconUrl(key: string): string {
  if (isLegacyEmoji(key)) return avatarIconUrl('fox') // fallback
  return `/icons/avatars/${key}.png`
}

/** Resolve a chat-type icon to a local image URL. */
export function chatIconUrl(key: string): string {
  const mapped = (CHAT_ICONS as Record<string, string>)[key] || key
  return `/icons/chat/${mapped}.png`
}

/** Resolve a sticker icon key to a local image URL. */
export function stickerIconUrl(key: string): string {
  if (isLegacyEmoji(key)) return stickerIconUrl('star') // fallback
  return `/icons/stickers/${key}.png`
}

/** Resolve a UI icon to a local image URL. */
export function uiIconUrl(key: string): string {
  return `/icons/ui/${key}.png`
}

// ─── Helpers ───────────────────────────────────────────────────────────

/** Detect legacy emoji values (non-ascii, short strings) stored in the DB. */
export function isLegacyEmoji(value: string | undefined | null): boolean {
  if (!value) return true
  return value.length <= 4 && /[^\x00-\x7F]/.test(value)
}

/** Normalize any stored avatar value to a valid icon key. */
export function resolveAvatarKey(value: string | undefined | null): string {
  if (!value || isLegacyEmoji(value)) return 'fox'
  return value
}

/** Check if a sticker key is valid (not a legacy emoji). */
export function isValidStickerKey(value: string): boolean {
  return !isLegacyEmoji(value)
}
