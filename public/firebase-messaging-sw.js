// firebase-messaging-sw.js — handles FCM background messages
// Must be at the root scope (/firebase-messaging-sw.js)

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyArfAjVmmLiMyeBsOFYrF68ftIGFuC3RmY',
  projectId: 'm3x-space',
  messagingSenderId: '653745093492',
  appId: '1:653745093492:web:4542ec8bb2692c41730a21',
})

const messaging = firebase.messaging()

// Background message handler — fires when app is not in foreground
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification ?? {}
  const url = payload.fcm_options?.link ?? '/dashboard'

  self.registration.showNotification(title ?? 'M3X', {
    body: body ?? 'You have a new notification.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'm3x-push',
    data: { url },
  })
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = e.notification.data?.url ?? '/dashboard'
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then((list) => {
      const existing = list.find((c) => c.url.includes('m3x.space'))
      if (existing) { existing.focus(); return }
      return clients.openWindow(url)
    })
  )
})
