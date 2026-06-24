'use client'

import { useEffect } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { ACCENT_HEX } from '@/lib/types'

// Applies the user's accent color + wallpaper class to the document root
export function AccentApplier() {
  const currentUser = useChatStore((s) => s.currentUser)
  useEffect(() => {
    if (!currentUser) return
    const hex = ACCENT_HEX[currentUser.accentColor || 'emerald'] || ACCENT_HEX.emerald
    document.documentElement.style.setProperty('--accent-hex', hex)
  }, [currentUser])
  return null
}
