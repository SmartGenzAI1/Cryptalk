'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Smartphone, X } from 'lucide-react'

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [show, setShow] = useState(false)
  const [isAndroid, setIsAndroid] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Don't show if already installed in standalone mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true

    if (isStandalone) return

    const ua = navigator.userAgent || ''
    const android = /Android/i.test(ua)
    setIsAndroid(android)

    const dismissed = localStorage.getItem('zc-install-dismissed')
    const dismissedTime = dismissed ? parseInt(dismissed, 10) : 0
    // Re-prompt after 7 days if dismissed
    const now = Date.now()
    const shouldShow = !dismissedTime || now - dismissedTime > 7 * 24 * 60 * 60 * 1000

    const handler = (e: Event) => {
      if (shouldShow) {
        e.preventDefault()
        setDeferredPrompt(e)
        setShow(true)
      }
    }

    window.addEventListener('beforeinstallprompt', handler)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      setInstalling(true)
      try {
        await deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice
        if (outcome === 'accepted') {
          setShow(false)
        }
      } catch {
        // user cancelled or error
      } finally {
        setInstalling(false)
        setDeferredPrompt(null)
      }
    } else {
      // Fallback instruction for mobile browsers
      alert('To install Cryptalk on your device:\n\n1. Tap the menu button (⋮ in Chrome or Safari Share icon)\n2. Select "Add to Home screen" or "Install App"')
    }
  }

  const handleDismiss = () => {
    localStorage.setItem('zc-install-dismissed', Date.now().toString())
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-96 animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="rounded-2xl border border-emerald-500/30 bg-zinc-950/95 backdrop-blur-xl p-4 shadow-2xl shadow-emerald-950/40">
        <div className="flex items-start gap-3.5">
          <div className="relative shrink-0">
            <img
              src="/apple-icon.png"
              alt="Cryptalk Logo"
              className="h-11 w-11 rounded-xl object-cover ring-2 ring-emerald-500/40 shadow-md"
            />
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-black">
              ✓
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white tracking-wide">Install Cryptalk</p>
              <button
                onClick={handleDismiss}
                className="text-zinc-400 hover:text-zinc-200 transition-colors p-1 -mr-1 -mt-1 rounded-md"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
              {isAndroid
                ? 'Install as Android app for encrypted calls & instant notifications'
                : 'Add to Home Screen for fast encrypted messaging'}
            </p>
          </div>
        </div>

        <div className="mt-3.5 flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleInstall}
            disabled={installing}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs h-9 shadow-md shadow-emerald-900/30 gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            {installing ? 'Installing...' : 'Install App'}
          </Button>

          {isAndroid && (
            <a
              href="https://github.com/SmartGenzAI1/Cryptalk/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 px-3 h-9 rounded-lg border border-emerald-500/20 bg-emerald-950/20 hover:bg-emerald-950/40 transition-colors"
            >
              <Smartphone className="h-3.5 w-3.5" />
              APK
            </a>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={handleDismiss}
            className="text-zinc-400 hover:text-zinc-200 text-xs h-9 px-3"
          >
            Later
          </Button>
        </div>
      </div>
    </div>
  )
}
