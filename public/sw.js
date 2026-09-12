/*
 * Offline shell for Shule SMS.
 *
 * The app shipped a web manifest but no service worker, so it installed to a
 * home screen and then failed completely without connectivity — the one thing a
 * PWA is worth in this market.
 *
 * Strategy is deliberately conservative for a system of record:
 *   - navigations: network first, falling back to a cached offline page.
 *   - static build assets: cache first (they are content-hashed).
 *   - anything under /api: network only. Stale students, marks or fee balances
 *     are worse than an honest "you are offline", and queued writes would need
 *     conflict handling this app does not have.
 */
const VERSION = 'shule-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll([OFFLINE_URL, '/manifest.json', '/favicon.svg']))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Never serve stale school data.
  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error()))
    )
    return
  }

  // Build output is content-hashed, so a cache hit is always correct.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((hit) =>
        hit || fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(VERSION).then((c) => c.put(request, copy))
          }
          return res
        })
      )
    )
  }
})
