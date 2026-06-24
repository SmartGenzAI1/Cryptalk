'use client'

import { useEffect, useState } from 'react'
import { useChatStore } from '@/stores/chat-store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChatAvatar } from './chat-avatar'
import { AVATAR_COLORS, AVATAR_COLOR_KEYS } from '@/lib/types'
import { AVATAR_ICONS, avatarIconUrl } from '@/lib/icons'
import { toast } from 'sonner'
import { apiPatch } from '@/lib/api'
import { cn } from '@/lib/utils'

export function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const currentUser = useChatStore((s) => s.currentUser)
  const setCurrentUser = useChatStore((s) => s.setCurrentUser)
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [icon, setIcon] = useState('fox')
  const [color, setColor] = useState('emerald')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (currentUser && open) {
      setName(currentUser.name)
      setBio(currentUser.bio)
      setIcon(currentUser.avatarEmoji)
      setColor(currentUser.avatarColor)
    }
  }, [currentUser, open])

  async function handleSave() {
    setSaving(true)
    try {
      const data = await apiPatch<{ user: any }>('/api/users/me', {
        name,
        bio,
        avatarEmoji: icon,
        avatarColor: color,
      })
      setCurrentUser(data.user)
      toast.success('Profile updated')
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (!currentUser) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center mb-4">
          <ChatAvatar emoji={icon} color={color} size="xl" />
          <p className="text-sm text-muted-foreground mt-2">@{currentUser.username}</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Display name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
          </div>
          <div className="space-y-1.5">
            <Label>Bio</Label>
            <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} placeholder="A few words about you" maxLength={500} />
          </div>
          <div className="space-y-1.5">
            <Label>Avatar icon</Label>
            <ScrollArea className="h-32 w-full rounded-lg border">
              <div className="grid grid-cols-8 gap-1 p-2">
                {AVATAR_ICONS.map((name) => (
                  <button
                    key={name}
                    onClick={() => setIcon(name)}
                    className={cn(
                      'aspect-square rounded-lg flex items-center justify-center transition-all zc-tap',
                      icon === name ? 'bg-primary/20 ring-2 ring-primary scale-105' : 'hover:bg-accent'
                    )}
                  >
                    <img
                      src={avatarIconUrl(name)}
                      alt={name}
                      width={32}
                      height={32}
                      loading="lazy"
                      className="object-contain"
                    />
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-1.5">
              {AVATAR_COLOR_KEYS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    'h-8 w-8 rounded-lg bg-gradient-to-br transition-all zc-tap',
                    AVATAR_COLORS[c],
                    color === c ? 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-110' : 'hover:scale-105'
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-gradient-to-r from-emerald-500 to-teal-600 border-0">
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
