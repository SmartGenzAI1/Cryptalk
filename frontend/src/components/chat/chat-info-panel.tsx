'use client'

import { useState, useEffect } from 'react'
import { X, Bell, Users, Image as ImageIcon, Link2, Shield } from 'lucide-react'
import { useChatStore, EMPTY_MESSAGES } from '@/stores/chat-store'
import { ChatAvatar } from './chat-avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { formatLastSeen } from '@/lib/format'
import { stickerIconUrl, isLegacyEmoji } from '@/lib/icons'

export function ChatInfoPanel() {
  const activeChat = useChatStore((s) => s.activeChat)
  const activeChatId = useChatStore((s) => s.activeChatId)
  const messages = useChatStore((s) => s.messages[activeChatId] ?? EMPTY_MESSAGES)
  const onlineUserIds = useChatStore((s) => s.onlineUserIds)
  const currentUser = useChatStore((s) => s.currentUser)
  const e2eeEnabled = useChatStore((s) => s.e2eeEnabled)
  const setInfoPanelOpen = useChatStore((s) => s.setInfoPanelOpen)
  const [safetyNumber, setSafetyNumber] = useState('')

  const isDirect = activeChat?.type === 'direct'
  const other = activeChat?.members.find((m) => m.user.id !== currentUser?.id)
  const online = other ? onlineUserIds.has(other.user.id) : false

  // Generate safety number for E2EE verification (Signal-style)
  useEffect(() => {
    if (!activeChat || !e2eeEnabled || !isDirect || !other) return
    let cancelled = false
    ;(async () => {
      try {
        const { generateSafetyNumber } = await import('@/lib/crypto')
        const { apiGet } = await import('@/lib/api')
        const keys = await apiGet<{ identity_public_key: string }>(`/api/keys/${other.user.id}`)
        if (!cancelled && keys.identity_public_key) {
          const num = await generateSafetyNumber(keys.identity_public_key)
          if (!cancelled) setSafetyNumber(num)
        }
      } catch {
        if (!cancelled) setSafetyNumber('Unable to generate')
      }
    })()
    return () => { cancelled = true }
  }, [e2eeEnabled, isDirect, other, activeChat])

  if (!activeChat) return null

  // media: stickers & images from messages
  const media = messages.filter((m) => m.type === 'sticker' || m.type === 'image')
  const links = messages.flatMap((m) => {
    const matches = m.content.match(/https?:\/\/[^\s]+/g)
    return matches ? matches.map((u) => ({ url: u, messageId: m.id })) : []
  })

  return (
    <div className="w-full sm:w-[340px] shrink-0 border-l flex flex-col bg-sidebar/50">
      <div className="flex items-center gap-2 px-4 h-16 border-b shrink-0">
        <span className="font-semibold flex-1">Info</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setInfoPanelOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 zc-scroll">
        <div className="p-4 space-y-5">
          {/* Profile header */}
          <div className="flex flex-col items-center text-center">
            <ChatAvatar
              emoji={activeChat.avatarEmoji}
              color={activeChat.avatarColor}
              size="xl"
              online={isDirect ? online : undefined}
            />
            <h2 className="text-xl font-bold mt-3">{activeChat.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {isDirect
                ? other
                  ? formatLastSeen(other.user.lastSeen, online)
                  : 'Direct chat'
                : activeChat.type === 'saved'
                ? 'Your personal cloud'
                : activeChat.type === 'channel'
                ? `${activeChat.members.length} subscribers`
                : `${activeChat.members.length} members`}
            </p>
          </div>


          {/* E2EE Verification — Safety Number */}
          {e2eeEnabled && isDirect && other && (
            <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4 text-emerald-500" />
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">End-to-End Encrypted</span>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Verify this chat's security by comparing the safety number below with {other.user.name}.
              </p>
              <div className="bg-background rounded-lg p-3 text-center">
                <code className="text-sm font-mono font-bold tracking-wider text-emerald-600 dark:text-emerald-400">
                  {safetyNumber || 'Loading…'}
                </code>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 text-center">
                If the numbers match, your chat is secure.
              </p>
            </div>
          )}

          {activeChat.description && (
            <div className="rounded-xl bg-accent/50 p-3">
              <div className="text-xs font-semibold text-muted-foreground mb-1">Description</div>
              <p className="text-sm">{activeChat.description}</p>
            </div>
          )}

          <Tabs defaultValue="members">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="members" className="text-xs">
                <Users className="h-3.5 w-3.5 mr-1" /> Members
              </TabsTrigger>
              <TabsTrigger value="media" className="text-xs">
                <ImageIcon className="h-3.5 w-3.5 mr-1" /> Media
              </TabsTrigger>
              <TabsTrigger value="links" className="text-xs">
                <Link2 className="h-3.5 w-3.5 mr-1" /> Links
              </TabsTrigger>
            </TabsList>

            <TabsContent value="members" className="mt-3 space-y-1">
              {activeChat.members.map((m) => {
                const u = m.user
                const isOnline = onlineUserIds.has(u.id)
                return (
                  <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent">
                    <ChatAvatar emoji={u.avatarEmoji} color={u.avatarColor} size="sm" online={isOnline} userId={u.id} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">
                        {u.id === currentUser?.id ? 'You' : u.name}
                        {m.role === 'owner' && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-bold">
                            OWNER
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {isOnline ? 'online' : `@${u.username}`}
                      </div>
                    </div>
                  </div>
                )
              })}
            </TabsContent>

            <TabsContent value="media" className="mt-3">
              {media.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">No media yet</p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {media.map((m) => (
                    <div key={m.id} className="aspect-square rounded-lg bg-accent flex items-center justify-center p-1">
                      {m.type === 'sticker' && !isLegacyEmoji(m.content) ? (
                        <img src={stickerIconUrl(m.content)} alt={m.content} width={64} height={64} loading="lazy" className="object-contain" />
                      ) : (
                        <span className="text-3xl">{m.content}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="links" className="mt-3 space-y-1">
              {links.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">No shared links yet</p>
              ) : (
                links.slice(0, 20).map((l, i) => (
                  <a
                    key={i}
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block px-3 py-2 rounded-lg hover:bg-accent text-sm break-all text-primary hover:underline"
                  >
                    {l.url}
                  </a>
                ))
              )}
            </TabsContent>
          </Tabs>

          <div className="pt-2 border-t">
            <Button variant="ghost" className="w-full justify-start text-muted-foreground">
              <Bell className="h-4 w-4 mr-2" /> Notifications
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
