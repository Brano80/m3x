import { createHmac } from 'crypto'

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? 'dev-secret-change-in-production'

export function signPayload(payload: string): string {
  return createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex')
}

export async function sendWebhook(webhookUrl: string, payload: object): Promise<void> {
  const body = JSON.stringify(payload)
  const signature = signPayload(body)
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-M3X-Signature': `sha256=${signature}`,
        'X-M3X-Event': 'match.found'
      },
      body,
      signal: AbortSignal.timeout(10000)
    })
    console.log(`[webhook] delivered to ${webhookUrl}`)
  } catch (e) {
    console.error(`[webhook] failed to deliver to ${webhookUrl}:`, e)
    // Non-blocking — never throw
  }
}
