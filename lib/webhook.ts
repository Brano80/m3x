import { createHmac } from 'crypto'
import { isSafeWebhookUrl } from './ssrf'

// Same secret used to HMAC-sign outgoing webhooks (X-M3X-Signature). Set on Vercel.
// Agents that verify signatures must use the same value you configure here.
//
// Resolved lazily so a missing env var fails loudly on first webhook send rather
// than silently falling back to a public/default secret that attackers could
// use to forge signatures.
function getWebhookSecret(): string {
  const secret =
    process.env.WEBHOOK_SECRET?.trim() || process.env.WEBHOOK_SIGNING_SECRET?.trim()
  if (!secret) {
    throw new Error('WEBHOOK_SECRET env var is required')
  }
  return secret
}

export function signPayload(payload: string): string {
  return createHmac('sha256', getWebhookSecret()).update(payload).digest('hex')
}

const WEBHOOK_TIMEOUT_MS = 10_000

export async function sendWebhook(webhookUrl: string, payload: object): Promise<void> {
  try {
    // Re-validate the URL at send time. Validation at register/PATCH only checks
    // DNS once — an attacker controlling DNS for their own hostname can flip A
    // records to 127.0.0.1 / 169.254.169.254 (DNS rebinding) between validation
    // and send. Re-resolving here closes that window.
    const safe = await isSafeWebhookUrl(webhookUrl)
    if (!safe) {
      console.error('[webhook] refusing to send — URL failed SSRF check at send time:', webhookUrl)
      return
    }

    const 