// lib/fcm.ts — server-side FCM push via Google FCM V1 HTTP API
// Uses service account credentials (no firebase-admin SDK needed)

import { GoogleAuth } from 'google-auth-library'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'm3x-space'
const FCM_URL = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`

let _auth: GoogleAuth | null = null

function getAuth() {
  if (_auth) return _auth
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  if (!privateKey || !clientEmail) {
    console.warn('[fcm] FIREBASE_PRIVATE_KEY or FIREBASE_CLIENT_EMAIL not set — push disabled')
    return null
  }
  _auth = new GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  })
  return _auth
}

export interface FcmPayload {
  title: string
  body: string
  url?: string      // opens this URL when notification is tapped
  tag?: string      // deduplication key
}

export async function sendFcmPush(fcmToken: string, payload: FcmPayload): Promise<boolean> {
  const auth = getAuth()
  if (!auth) return false

  try {
    const accessToken = await auth.getAccessToken()
    const res = await fetch(FCM_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          webpush: {
            notification: {
              icon: '/favicon.ico',
              badge: '/favicon.ico',
              tag: payload.tag ?? 'm3x',
            },
            fcm_options: payload.url ? { link: payload.url } : undefined,
          },
        },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[fcm] push failed:', res.status, err)
      // Token invalid/expired — caller should clear it
      if (res.status === 404 || err.includes('UNREGISTERED')) return false
      return false
    }

    console.log('[fcm] push sent to token ending', fcmToken.slice(-8))
    return true
  } catch (err) {
    console.error('[fcm] error:', err)
    return false
  }
}

// Convenience: send match notification to an agent (no-op if no fcm_token)
export async function notifyMatchFound(agent: { fcm_token?: string | null; handle: string }, matchScore: number, matchedHandle: string) {
  if (!agent.fcm_token) return
  await sendFcmPush(agent.fcm_token, {
    title: `New match — ${Math.round(matchScore * 100)}%`,
    body: `@${matchedHandle} matched your intent on M3X`,
    url: 'https://m3x.space/dashboard',
    tag: 'm3x-match',
  })
}

export async function notifyHandshake(agent: { fcm_token?: string | null }, fromHandle: string) {
  if (!agent.fcm_token) return
  await sendFcmPush(agent.fcm_token, {
    title: 'Handshake request',
    body: `@${fromHandle} wants to connect on M3X`,
    url: 'https://m3x.space/dashboard',
    tag: 'm3x-handshake',
  })
}

export async function notifyHandshakeAccepted(agent: { fcm_token?: string | null }, fromHandle: string) {
  if (!agent.fcm_token) return
  await sendFcmPush(agent.fcm_token, {
    title: 'Handshake accepted',
    body: `@${fromHandle} accepted your handshake — connection active`,
    url: 'https://m3x.space/dashboard',
    tag: 'm3x-handshake',
  })
}
