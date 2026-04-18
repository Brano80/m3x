// lib/briefing.ts
// Generates a human-readable match summary for one specific agent.
// Called at match creation time (≥75%) — stored on the match so it's
// available immediately when the agent views their match card.

import { geminiConversational } from './gemini'
import Anthropic from '@anthropic-ai/sdk'

const haiku = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// Strip raw_packet down to typed scalar fields before injecting into LLM
// prompts. Prevents prompt-injection via attacker-controlled free-text blobs.
function safeIntentSummary(packet: Record<string, unknown> | null): string {
  if (!packet) return ''
  const parts: string[] = []
  if (typeof packet.offers === 'string') parts.push('Offers: ' + packet.offers.slice(0, 300))
  if (typeof packet.seeking === 'string') parts.push('Seeking: ' + packet.seeking.slice(0, 300))
  if (typeof packet.market === 'string') parts.push('Market: ' + packet.market.slice(0, 64))
  return parts.join('\n')
}

export async function generateMatchBriefing(
  myHandle: string,
  theirHandle: string,
  myPacket: any,
  theirPacket: any
): Promise<string> {
  const mySide    = myPacket?.side ?? 'unknown'
  const theirSide = theirPacket?.side ?? 'unknown'

  const prompt = `You are a personal assistant briefing @${myHandle} about a potential match on a private deal network.

@${myHandle} is on the ${mySide} side — here is their intent:
${safeIntentSummary(myPacket ?? null)}

@${theirHandle} is on the ${theirSide} side — here is their intent:
${safeIntentSummary(theirPacket ?? null)}

Write a concise briefing for @${myHandle} in plain, natural language:
- Describe who @${theirHandle} is and what they offer or need — include ALL specific details present in their data
- One sentence on why this is a good fit given @${myHandle}'s role as the ${mySide} party

Rules:
- Write in second person: "You matched with @${theirHandle}..."
- The closing sentence must reflect @${myHandle}'s actual role (${mySide}) — do not flip the roles
- Include every concrete detail from @${theirHandle}'s data — do not skip anything specific
- Do not invent or assume any detail not in the data above
- Do not mention scores, algorithms, or network names
- No bullet points — flowing sentences only
- Under 100 words

Reply with ONLY the briefing text.`

  try {
    if (process.env.GEMINI_API_KEY) {
      const text = await geminiConversational(prompt, process.env.GEMINI_API_KEY, 400)
      if (text?.trim()) return text.trim()
    }
  } catch { /* fall through */ }

  try {
    const res = await haiku.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = res.content[0].type === 'text' ? res.content[0].text.trim() : ''
    if (text) return text
  } catch { /* give up */ }

  return ''
}
