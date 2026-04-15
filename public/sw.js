// M3X Service Worker
// Phase A: shell caching + offline fallback
// Phase B: FCM push notifications (wired in next step)

const CACHE = 'm3x-v1'
const OFFLINE_URL = '/dashboard'

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(['/dashboard', '/'])
    )
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  // Only handle same-origin navigation requests for offline fallback
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(OFFLINE_URL))
    )
  }
})

// Push notification handler (Phase B — FCM)
self.addEventListener('push', (e) => {
  if (!e.data) return
  const data = e.data.json()
  e.waitUntil(
    self.registration.showNotification(data.title ?? 'M3X Match', {
      body: data.body ?? 'You have a new match.',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: data.tag ?? 'm3x-match',
      data: { url: data.url ?? '/dashboard' },
    })
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then((list) => {
      const url = e.notification.data?.url ?? '/dashboard'
      const existing = list.find((c) => c.url.includes('/dashboard'))
      if (existing) return existing.focus()
      return clients.openWindow(url)
    })
  )
})
