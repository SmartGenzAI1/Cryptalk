'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Download, X } from 'lucide-react'

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      const dismissed = localStorage.getItem('zc-install-dismissed')
      if (!dismissed) setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setShow(false)
  }

  const handleDismiss = () => {
    localStorage.setItem('zc-install-dismissed', 'true')
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-80">
      <div className="rounded-xl border border-emerald-500/20 bg-zinc-900 p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <Download className="mt-0.5 h-5 w-5 text-emerald-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-white">Install Cryptalk</p>
            <p className="text-xs text-zinc-400 mt-1">Add to home screen for the best experience</p>
          </div>
          <button onClick={handleDismiss} className="text-zinc-500 hover:text-zinc-300">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={handleInstall} className="bg-emerald-600 hover:bg-emerald-700">
            Install
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDismiss} className="text-zinc-400">
            Not now
          </Button>
        </div>
      </div>
    </div>
  )
}
