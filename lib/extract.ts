import Anthropic from '@anthropic-ai/sdk'

export async function extractIntentSignals(offers: string, seeking: string, market: string) {
  if (!process.env.ANTHROPIC_API_KEY) return null

  try {
    const client = new Anthropic()
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Extract structured signals from this agent intent. Return ONLY valid JSON, no preamble, no markdown.

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
      }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    console.log('[extract] raw response:', text.slice(0, 200))

    // Extract JSON even if Haiku adds preamble or markdown
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) { console.error('[extract] no JSON found in response'); return null }

    return JSON.parse(match[0])
  } catch (err) {
    console.error('[extract] error:', err)
    return null
  }
}
