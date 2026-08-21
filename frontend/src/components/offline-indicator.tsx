'use client'
import { useState, useEffect } from 'react'
import { WifiOff } from 'lucide-react'

export function OfflineIndicator() {
  const [online, setOnline] = useState(true)
  const [showRestored, setShowRestored] = useState(false)

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true)
      setShowRestored(true)
      setTimeout(() => setShowRestored(false), 3000)
    }
    const handleOffline = () => setOnline(false)
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    setOnline(navigator.onLine)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (online && !showRestored) return null

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors ${
      online ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
    }`}>
      {online ? (
        <>Connection restored</>
      ) : (
        <><WifiOff className="h-4 w-4" /> You're offline</>
      )}
    </div>
  )
}
