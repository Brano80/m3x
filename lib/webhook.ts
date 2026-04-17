import { createHmac } from 'crypto'

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

export async function sendWebhook(webhookUrl: string, payload: object): Promise<void> {
  try {
    const body = JSON.stringify(payload)
    // signPayload throws if WEBHOOK_SECRET is unset — caught here so fire-and-forget
    // callers don't surface unhandled rejections.
    const signature = signPayload(body)
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-M3X-Signature': `sha256=${signature}`,
      },
      body,
    })
  } catch (err) {
    // Fire-and-forget — log but do not throw so callers are not disrupted.
    console.error('[webhook] delivery failed:', webhookUrl, err)
  }
}
