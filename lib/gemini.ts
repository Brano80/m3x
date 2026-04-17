// lib/gemini.ts
// Shared Gemini 2.5 Flash helpers with correct parts parsing.
//
// Gemini 2.5 Flash is a thinking model. When thinking is enabled it returns
// multiple parts: thought parts (thought: true) followed by the actual response.
// Always find the non-thought part — never assume parts[0] is the reply.

export const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

/** Extract the actual response text, skipping any thought parts. */
export function extractGeminiText(data: any): string {
  const parts: any[] = data?.candidates?.[0]?.content?.parts ?? []
  // Find the first part that is NOT a thought
  const textPart = parts.find((p) => !p.thought) ?? parts[parts.length - 1]
  return textPart?.text?.trim() ?? ''
}

/** Call Gemini for STRUCTURED tasks (scoring, extraction, classification).
 *  Thinking disabled — faster, cheaper, JSON output is reliable. */
export async function geminiStructured(
  prompt: string,
  apiKey: string,
  maxTokens = 512
): Promise<string> {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}`)
  return extractGeminiText(await res.json())
}

/** Call Gemini for CONVERSATIONAL tasks (replies, opening messages, analysis).
 *  Thinking enabled — better quality for nuanced language. */
export async function geminiConversational(
  prompt: string,
  apiKey: string,
  maxTokens = 1024,
  temperature = 0.7
): Promise<string> {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
        // thinking enabled (default) — do NOT set thinkingBudget: 0
      },
    }),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}`)
  return extractGeminiText(await res.json())
}
