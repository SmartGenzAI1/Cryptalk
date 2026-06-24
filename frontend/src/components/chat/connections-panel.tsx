'use client'

import { useState, useEffect } from 'react'
import { UserPlus, Check, X, Search, UserCheck, Ban, Pencil } from 'lucide-react'
import { useChatStore } from '@/stores/chat-store'
import { ChatAvatar } from './chat-avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  sendConnectionRequest,
  acceptConnection,
  declineConnection,
  listConnections,
  listPendingRequests,
  blockUser,
  setNickname,
} from '@/lib/actions'
import { apiGet } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { SafeUser } from '@/lib/types'
import { motion } from 'framer-motion'

export function ConnectionsPanel() {
  const setConnectionsPanelOpen = useChatStore((s) => s.setSettingsOpen)
  const [connections, setConnections] = useState<SafeUser[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SafeUser[]>([])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [connData, reqData] = await Promise.all([
        listConnections(),
        listPendingRequests(),
      ])
      setConnections(connData.connections || [])
      setRequests(reqData.requests || [])
    } catch (e) {
      console.error('Failed to load connections', e)
    }
  }

  useEffect(() => {
    if (!searchQuery.trim()) return
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const data = await apiGet<{ users: SafeUser[] }>(`/api/users/search?q=${encodeURIComponent(searchQuery)}`)
        if (!cancelled) setSearchResults(data.users || [])
      } catch {
        if (!cancelled) setSearchResults([])
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [searchQuery])

  async function handleConnect(username: string) {
    try {
      await sendConnectionRequest(username)
      toast.success(`Request sent to @${username}`)
    } catch (e: any) {
      toast.error(e.message || 'Failed to send request')
    }
  }

  async function handleAccept(requestId: string) {
    try {
      await acceptConnection(requestId)
      toast.success('Connection accepted!')
      loadData()
    } catch (e: any) {
      toast.error(e.message || 'Failed to accept')
    }
  }

  async function handleDecline(requestId: string) {
    try {
      await declineConnection(requestId)
      toast.success('Request declined')
      loadData()
    } catch (e: any) {
      toast.error(e.message || 'Failed to decline')
    }
  }

  async function handleBlock(userId: string) {
    try {
      await blockUser(userId)
      toast.success('User blocked')
      loadData()
    } catch (e: any) {
      toast.error(e.message || 'Failed to block')
    }
  }

  async function handleNickname(userId: string, currentName: string) {
    const nickname = prompt(`Set a nickname for ${currentName}:`, currentName)
    if (nickname && nickname.trim()) {
      try {
        await setNickname(userId, nickname.trim())
        toast.success('Nickname set')
      } catch (e: any) {
        toast.error(e.message || 'Failed to set nickname')
      }
    }
  }

  return (
    <div className="w-full sm:w-[380px] shrink-0 border-l flex flex-col bg-sidebar/60 zc-glass-sidebar">
      <div className="flex items-center gap-2 px-4 h-16 border-b shrink-0">
        <UserPlus className="h-5 w-5 text-primary" />
        <span className="font-semibold flex-1 text-lg">Connections</span>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setConnectionsPanelOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="find" className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3 m-2">
          <TabsTrigger value="find" className="text-xs">
            <Search className="h-3.5 w-3.5 mr-1" /> Find
          </TabsTrigger>
          <TabsTrigger value="requests" className="text-xs relative">
            Requests
            {requests.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                {requests.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="list" className="text-xs">
            <UserCheck className="h-3.5 w-3.5 mr-1" /> Mine
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1 zc-scroll">
          <TabsContent value="find" className="m-2 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by username..."
                className="pl-9"
              />
            </div>
            <div className="space-y-1">
              {searchResults.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  {searchQuery ? 'No users found' : 'Search to find people'}
                </p>
              ) : (
                searchResults.map((u) => (
                  <motion.div
                    key={u.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-accent group"
                  >
                    <ChatAvatar emoji={u.avatarEmoji} color={u.avatarColor} size="sm" online={u.isOnline} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{u.name}</div>
                      <div className="text-xs text-muted-foreground truncate">@{u.username}</div>
                    </div>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 zc-tap" onClick={() => handleConnect(u.username)}>
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  </motion.div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="requests" className="m-2 space-y-1">
            {requests.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No pending requests</p>
            ) : (
              requests.map((r) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-accent"
                >
                  <ChatAvatar emoji={r.from.avatarEmoji} color={r.from.avatarColor} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{r.from.name}</div>
                    <div className="text-xs text-muted-foreground truncate">@{r.from.username}</div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-500 zc-tap" onClick={() => handleAccept(r.id)}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive zc-tap" onClick={() => handleDecline(r.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </motion.div>
              ))
            )}
          </TabsContent>

          <TabsContent value="list" className="m-2 space-y-1">
            {connections.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No connections yet</p>
            ) : (
              connections.map((u) => (
                <div key={u.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-accent group">
                  <ChatAvatar emoji={u.avatarEmoji} color={u.avatarColor} size="sm" online={u.isOnline} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{u.name}</div>
                    <div className="text-xs text-muted-foreground truncate">@{u.username}</div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 zc-tap" onClick={() => handleNickname(u.id, u.name)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 text-destructive zc-tap" onClick={() => handleBlock(u.id)}>
                    <Ban className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  )
}
