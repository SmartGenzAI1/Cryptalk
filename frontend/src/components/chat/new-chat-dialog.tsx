'use client'

import { useEffect, useState } from 'react'
import { Search, MessageCircle, Users, Megaphone, Check } from 'lucide-react'
import { useChatStore } from '@/stores/chat-store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ChatAvatar } from './chat-avatar'
import { AVATAR_COLORS, AVATAR_COLOR_KEYS } from '@/lib/types'
import { AVATAR_ICONS, avatarIconUrl } from '@/lib/icons'
import { toast } from 'sonner'
import type { SafeUser } from '@/lib/types'
import { apiGet, apiPost } from '@/lib/api'
import { cn } from '@/lib/utils'

const ICON_CHOICES = AVATAR_ICONS.slice(0, 24) // first 24 for picker
const COLOR_CHOICES = AVATAR_COLOR_KEYS

export function NewChatDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {open && <NewChatForm onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function NewChatForm({ onDone }: { onDone: () => void }) {
  const currentUser = useChatStore((s) => s.currentUser)
  const upsertChat = useChatStore((s) => s.upsertChat)
  const setActiveChatId = useChatStore((s) => s.setActiveChatId)
  const setActiveChat = useChatStore((s) => s.setActiveChat)
  const setMessages = useChatStore((s) => s.setMessages)
  // state initializes fresh on each mount — no reset effect needed
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<SafeUser[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [groupName, setGroupName] = useState('')
  const [groupDesc, setGroupDesc] = useState('')
  const [groupEmoji, setGroupEmoji] = useState('groups')
  const [groupColor, setGroupColor] = useState('violet')
  const [isChannel, setIsChannel] = useState(false)
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      if (!query.trim()) {
        setUsers([])
        return
      }
      try {
        const data = await apiGet<{ users: SafeUser[] }>(`/api/users/search?q=${encodeURIComponent(query)}`)
        if (!cancelled) setUsers(data.users || [])
      } catch {
        if (!cancelled) setUsers([])
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  function toggleSelect(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  async function createDirect(otherId: string) {
    try {
      const data = await apiPost<{ chat: any }>('/api/chats', { type: 'direct', memberIds: [otherId] })
      await openChatAfterCreate(data.chat)
    } catch (e: any) {
      toast.error(e.message || 'Failed')
    }
  }

  async function createGroup() {
    if (!groupName.trim()) {
      toast.error('Enter a group name')
      return
    }
    try {
      // Initialize libsodium and generate a secure 32-byte symmetric group key
      const sodiumModule = await import('libsodium-wrappers')
      const sodium = sodiumModule.default || sodiumModule
      await sodium.ready
      const groupKey = sodium.randombytes_buf(32)

      const { toBase64, encryptMessage } = await import('@/lib/crypto')
      const { loadIdentityKey, saveGroupKey } = await import('@/lib/key-store')
      
      const myIdentity = await loadIdentityKey()
      if (!myIdentity) {
        throw new Error('Please configure your identity keys before starting chats')
      }
      const myPublicKey = toBase64(myIdentity.encryption.publicKey)

      // Encrypt the group key for ourselves
      const encryptedKeys: Record<string, string> = {}
      const myEncryptedPayload = await encryptMessage(
        toBase64(groupKey),
        myPublicKey,
        myIdentity.encryption.privateKey
      )
      encryptedKeys[currentUser!.id] = JSON.stringify(myEncryptedPayload)

      // Fetch recipient keys and encrypt the group key for each selected member
      for (const uid of selected) {
        try {
          const keys = await apiGet<{ identity_public_key: string | null }>(`/api/keys/${uid}`)
          if (keys.identity_public_key) {
            const payload = await encryptMessage(
              toBase64(groupKey),
              keys.identity_public_key,
              myIdentity.encryption.privateKey
            )
            encryptedKeys[uid] = JSON.stringify(payload)
          }
        } catch (e) {
          console.warn(`Could not encrypt group key for member ${uid}:`, e)
        }
      }

      const data = await apiPost<{ chat: any }>('/api/chats', {
        type: isChannel ? 'channel' : 'group',
        title: groupName.trim(),
        description: groupDesc.trim(),
        memberIds: selected,
        avatarEmoji: groupEmoji,
        avatarColor: groupColor,
        expiresInDays: expiresInDays,
        memberKeys: encryptedKeys,
      })

      // Store group key locally under the newly created chat ID
      await saveGroupKey(data.chat.id, groupKey)
      await openChatAfterCreate(data.chat)
    } catch (e: any) {
      toast.error(e.message || 'Failed to create group')
    }
  }

  async function openChatAfterCreate(chat: any) {
    // build chat list item shape
    const listItem = {
      ...chat,
      updatedAt: chat.createdAt,
      lastReadAt: new Date().toISOString(),
      role: 'owner',
      lastMessage: null,
    }
    upsertChat(listItem)
    setActiveChatId(chat.id)
    setActiveChat({
      ...chat,
      type: chat.type,
      createdAt: chat.createdAt,
      members: chat.members,
    })
    setMessages(chat.id, [])
    // notify other members via socket
    const socket = (await import('@/hooks/use-socket')).getSocket()
    socket?.emit('chat-updated', {
      chatId: chat.id,
      memberIds: chat.members.map((m: any) => m.user.id),
      chat: listItem,
    })
    onDone()
    toast.success(isChannel ? 'Channel created!' : selected.length > 1 || groupName ? 'Group created!' : 'Chat started!')
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>New chat</DialogTitle>
      </DialogHeader>
      <Tabs defaultValue="direct" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="direct">
              <MessageCircle className="h-4 w-4 mr-1.5" /> Direct
            </TabsTrigger>
            <TabsTrigger value="group">
              <Users className="h-4 w-4 mr-1.5" /> Group
            </TabsTrigger>
          </TabsList>

          <TabsContent value="direct" className="space-y-3 mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by username or name"
                className="pl-9"
                autoFocus
              />
            </div>
            <div className="max-h-80 overflow-y-auto zc-scroll -mx-2">
              {users.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-10">
                  {query ? 'No users found' : 'Start typing to search users'}
                </p>
              ) : (
                users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => createDirect(u.id)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent text-left"
                  >
                    <ChatAvatar emoji={u.avatarEmoji} color={u.avatarColor} size="md" online={u.isOnline} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{u.name}</div>
                      <div className="text-xs text-muted-foreground truncate">@{u.username}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="group" className="space-y-3 mt-4">
            <div className="flex items-center gap-2">
              <Button
                variant={!isChannel ? 'default' : 'outline'}
                size="sm"
                onClick={() => setIsChannel(false)}
                className={!isChannel ? 'bg-gradient-to-r from-emerald-500 to-teal-600 border-0' : ''}
              >
                <Users className="h-4 w-4 mr-1" /> Group
              </Button>
              <Button
                variant={isChannel ? 'default' : 'outline'}
                size="sm"
                onClick={() => setIsChannel(true)}
                className={isChannel ? 'bg-gradient-to-r from-violet-500 to-fuchsia-600 border-0' : ''}
              >
                <Megaphone className="h-4 w-4 mr-1" /> Channel
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <Label className="text-xs">Icon</Label>
                <div className="flex flex-wrap gap-1 mt-1 max-h-24 overflow-y-auto zc-scroll">
                  {ICON_CHOICES.map((name) => (
                    <button
                      key={name}
                      onClick={() => setGroupEmoji(name)}
                      className={cn(
                        'h-8 w-8 rounded-lg flex items-center justify-center transition-all zc-tap',
                        groupEmoji === name ? 'bg-primary/20 ring-2 ring-primary scale-105' : 'hover:bg-accent'
                      )}
                    >
                      <img src={avatarIconUrl(name)} alt={name} width={28} height={28} loading="lazy" className="object-contain" />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs">Color</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {COLOR_CHOICES.slice(0, 8).map((c) => (
                    <button
                      key={c}
                      onClick={() => setGroupColor(c)}
                      className={`h-8 w-8 rounded-lg bg-gradient-to-br ${AVATAR_COLORS[c]} ${groupColor === c ? 'ring-2 ring-offset-2 ring-offset-background ring-primary' : ''}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="gn">{isChannel ? 'Channel' : 'Group'} name</Label>
              <Input id="gn" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder={isChannel ? 'My Channel' : 'My Group'} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="gd">Description (optional)</Label>
              <Textarea id="gd" value={groupDesc} onChange={(e) => setGroupDesc(e.target.value)} rows={2} placeholder="What's this about?" />
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Add members…"
                className="pl-9"
              />
            </div>

            <div className="max-h-40 overflow-y-auto zc-scroll -mx-2">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => toggleSelect(u.id)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent text-left"
                >
                  <ChatAvatar emoji={u.avatarEmoji} color={u.avatarColor} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate text-sm">{u.name}</div>
                    <div className="text-xs text-muted-foreground truncate">@{u.username}</div>
                  </div>
                  {selected.includes(u.id) && <Check className="h-4 w-4 text-primary" />}
                </button>
              ))}
            </div>

            {selected.length > 0 && (
              <div className="text-xs text-muted-foreground">{selected.length} member(s) selected</div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Auto-delete after (optional)</Label>
              <div className="flex flex-wrap gap-1">
                {[
                  { label: 'Never', value: null },
                  { label: '1 day', value: 1 },
                  { label: '3 days', value: 3 },
                  { label: '7 days', value: 7 },
                ].map((opt) => (
                  <button
                    key={String(opt.value)}
                    onClick={() => setExpiresInDays(opt.value)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs border transition-colors zc-tap',
                      expiresInDays === opt.value
                        ? 'bg-primary/15 border-primary text-primary font-medium'
                        : 'border-border text-muted-foreground hover:bg-accent'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {expiresInDays && (
                <p className="text-[11px] text-amber-500">
                  This {isChannel ? 'channel' : 'group'} will be permanently deleted after {expiresInDays} day{expiresInDays > 1 ? 's' : ''}.
                </p>
              )}
            </div>

            <Button onClick={createGroup} className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 border-0">
              Create {isChannel ? 'channel' : 'group'}
            </Button>
          </TabsContent>
        </Tabs>
    </>
  )
}
