'use client'

import { useEffect } from 'react'

/**
 * Registers the offline shell. Kept out of Providers so it stays a no-op during
 * SSR and on browsers without service worker support, and so a registration
 * failure can never take the app down with it.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return
    const register = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((e) => console.warn('service worker registration failed:', e))
    }
    // Registering after load keeps it off the critical path on slow connections.
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  return null
}
