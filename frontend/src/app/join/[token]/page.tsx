'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { joinChatByToken } from '@/lib/actions'
import { saveGroupKey } from '@/lib/key-store'
import { fromBase64 } from '@/lib/crypto'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function JoinChatPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    let active = true

    async function execute() {
      try {
        // Retrieve the symmetric group key from the client-side URL hash
        const hash = window.location.hash
        let groupKeyBase64 = ''
        if (hash.startsWith('#groupKey=')) {
          groupKeyBase64 = hash.substring('#groupKey='.length)
        }

        const data = await joinChatByToken(token)
        if (!active) return

        // Save the group key under the new chat ID
        if (data.chat_id && groupKeyBase64) {
          const groupKeyBytes = fromBase64(groupKeyBase64)
          await saveGroupKey(data.chat_id, groupKeyBytes)
        }

        toast.success('Joined chat successfully')
        router.push('/')
      } catch (err: any) {
        if (active) {
          toast.error(err.message || 'Failed to join chat')
          router.push('/')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    execute()
    return () => { active = false }
  }, [token, router])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Joining conversation...</p>
      </div>
    </div>
  )
}
