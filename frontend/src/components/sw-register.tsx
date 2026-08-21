'use client'

import { useEffect, useState } from 'react'

export function SWRegister() {
  const [updateReady, setUpdateReady] = useState(false)
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }

    let registration: ServiceWorkerRegistration | undefined

    const register = async () => {
      try {
        registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        })

        // Detect a waiting service worker (new version available)
        if (registration.waiting && navigator.serviceWorker.controller) {
          setWaitingWorker(registration.waiting)
          setUpdateReady(true)
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration?.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            if (
              installing.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              setWaitingWorker(installing)
              setUpdateReady(true)
            }
          })
        })

        // Listen for sync completion messages from the SW
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === 'SYNC_COMPLETE') {
            console.info(`[SW] ${event.data.count} queued request(s) synced`)
          }
        })
      } catch (err) {
        console.error('[SW] Registration failed:', err)
      }
    }

    register()

    // Check for updates periodically
    const interval = setInterval(() => {
      registration?.update().catch(() => {})
    }, 60 * 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  const applyUpdate = () => {
    waitingWorker?.postMessage({ type: 'SKIP_WAITING' })
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    })
    setUpdateReady(false)
  }

  const dismissUpdate = () => setUpdateReady(false)

  return (
    <>
      {updateReady && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-[9999] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-emerald-500/30 bg-black/90 px-4 py-3 text-sm text-white shadow-lg backdrop-blur"
        >
          <span>Update available</span>
          <button
            onClick={applyUpdate}
            className="rounded-md bg-emerald-500 px-3 py-1 font-medium text-black hover:bg-emerald-400"
          >
            Reload
          </button>
          <button
            onClick={dismissUpdate}
            aria-label="Dismiss"
            className="text-neutral-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}
    </>
  )
}

export default SWRegister
