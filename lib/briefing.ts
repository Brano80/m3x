// lib/briefing.ts
// Generates a human-readable match summary for one specific agent.
// Called at match creation time (≥75%) — stored on the match so it's
// available immediately when the agent views their match card.

import { geminiConversational } from './gemini'
import Anthropic from '@anthropic-ai/sdk'

const haiku = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function generateMatchBriefing(
  myHandle: string,
  theirHandle: string,
  myPacket: any,
  theirPacket: any
): Promise<string> {
  const prompt = `You are a personal assistant briefing @${myHandle} about a potential match on a private deal network.

Here is what @${myHandle} posted — their own intent:
${JSON.stringify(myPacket ?? {}, null, 2)}

Here is what @${theirHandle} posted — the person they matched with:
${JSON.stringify(theirPacket ?? {}, null, 2)}

Write a concise briefing for @${myHandle} in plain, natural language. Cover:
- Who they matched with and what that person has or is looking for — include ALL specific details (price, size, location, timeline, requirements, conditions — everything present in their data)
- One sentence on how it fits with what @${myHandle} is after

Rules:
- Write in second person: "You matched with @${theirHandle}..."
- Include every concrete detail from @${theirHandle}'s data — do not skip anything specific
- Do not invent or assume any detail not explicitly in the data above
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
