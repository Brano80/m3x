// Uses Gemini 2.0 Flash via REST API (no SDK needed) — ~10x cheaper than Haiku
// Falls back to Claude Haiku if GEMINI_API_KEY is not set

import Anthropic from '@anthropic-ai/sdk'

const GEMINI_MODEL = 'gemini-2.0-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const EXTRACTION_PROMPT = (offers: string, seeking: string, market: string) =>
  `Extract structured signals from this agent intent. Return ONLY valid JSON, no preamble, no markdown.

OFFERS: ${offers}
SEEKING: ${seeking}
MARKET: ${market}

Return exactly this JSON:
{
  "intent_type": "seeking_investor|seeking_client|seeking_partner|offering_service|seeking_hire|open_to_work|seeking_cofounder",
  "geography": ["locations mentioned e.g. EU, Germany, remote, global"],
  "urgency": "high|medium|low|unspecified",
  "market_segment": "enterprise|SMB|consumer|startup|agency|unspecified",
  "required_capabilities": ["capabilities sought from others"],
  "offered_capabilities": ["capabilities this agent brings"],
  "language": "ISO 639-1 code e.g. en, de, pt"
}`

async function extractWithGemini(offers: string, seeking: string, market: string, keyOverride?: string) {
  const res = await fetch(`${GEMINI_URL}?key=${keyOverride ?? process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: EXTRACTION_PROMPT(offers, seeking, market) }] }],
      generationConfig: { maxOutputTokens: 512, temperature: 0 },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in Gemini response')
  return JSON.parse(match[0])
}

async function extractWithHaiku(offers: string, seeking: string, market: string, keyOverride?: string) {
  const client = new Anthropic({ apiKey: keyOverride ?? process.env.ANTHROPIC_API_KEY })
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: EXTRACTION_PROMPT(offers, seeking, market) }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  console.log('[extract] raw response:', text.slice(0, 200))
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in Haiku response')
  return JSON.parse(match[0])
}

// byok: { provider: 'gemini' | 'anthropic', key: string } — agent's own key takes priority
export async function extractIntentSignals(offers: string, seeking: string, market: string, byok?: { provider: string; key: string }) {
  try {
    // BYOK: use agent's own key first
    if (byok?.provider === 'gemini' && byok.key) {
      console.log('[extract] using agent BYOK Gemini key')
      return await extractWithGemini(offers, seeking, market, byok.key)
    }
    if (byok?.provider === 'anthropic' && byok.key) {
      console.log('[extract] using agent BYOK Anthropic key')
      return await extractWithHaiku(offers, seeking, market, byok.key)
    }

    // Fallback to infra keys
    if (process.env.GEMINI_API_KEY) {
      console.log('[extract] using Gemini 2.0 Flash')
      try {
        return await extractWithGemini(offers, seeking, market)
      } catch (geminiErr) {
        console.error('[extract] Gemini failed, falling back to Haiku:', geminiErr instanceof Error ? geminiErr.message : String(geminiErr))
        if (process.env.ANTHROPIC_API_KEY) {
          console.log('[extract] falling back to Haiku after Gemini failure')
          return await extractWithHaiku(offers, seeking, market)
        }
        return null
      }
    }

    if (process.env.ANTHROPIC_API_KEY) {
      console.log('[extract] GEMINI_API_KEY not set, falling back to Haiku')
      return await extractWithHaiku(offers, seeking, market)
    }

    console.warn('[extract] no AI key configured, skipping extraction')
    return null
  } catch (err) {
    console.error('[extract] error:', err)
    return null
  }
}
