// POST /api/library/search — public semantic search over library.cards
// Ship 1: hard filters (type, verified_only) + pgvector similarity + trust
// where present. No ranking service yet (profiles/floor = Phase 3).
// PRIVACY: reads library.cards ONLY — never intents/agents/matches/handshakes.

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

const VALID_TYPES = ['business', 'agent', 'tool']

async function embedQuery(text: string): Promise<number[] | null> {
  const key = process.env.HUGGINGFACE_API_KEY
  if (!key) return null
  try {
    const res = await fetch(
      'https://router.huggingface.co/hf-inference/models/intfloat/multilingual-e5-large',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        // E5 convention: queries embed with the 'query: ' prefix
        body: JSON.stringify({ inputs: `query: ${text}` }),
      }
    )
    if (res.status === 503) {
      await new Promise(r => setTimeout(r, 8000))
      return embedQuery(text)
    }
    if (!res.ok) return null
    const result = await res.json()
    const vector: number[] = Array.isArray(result[0]) ? result[0] : result
    if (!Array.isArray(vector) || vector.length !== 1024) return null
    return vector
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body.query !== 'string' || body.query.trim().length === 0) {
      return NextResponse.json(
        { error: { message: 'query (non-empty string) is required', code: 'INVALID_QUERY' } },
        { status: 400 }
      )
    }
    const query: string = body.query.trim().slice(0, 500)
    const cardType: string | null =
      typeof body.type === 'string' && VALID_TYPES.includes(body.type) ? body.type : null
    const verifiedOnly: boolean = body.verified_only === true
    const limit: number = Math.min(Math.max(parseInt(body.limit, 10) || 20, 1), 50)

    const vector = await embedQuery(query)
    if (!vector) {
      return NextResponse.json(
        { error: { message: 'Embedding service unavailable', code: 'EMBEDDING_FAILED' } },
        { status: 502 }
      )
    }

    const supabase = getServiceClient()
    const { data, error } = await supabase.rpc('library_search_cards', {
      query_embedding: `[${vector.join(',')}]`,
      card_type: cardType,
      verified_only: verifiedOnly,
      match_count: limit,
    })

    if (error) {
      return NextResponse.json(
        { error: { message: error.message, code: 'SEARCH_FAILED' } },
        { status: 500 }
      )
    }

    return NextResponse.json({
      mode: 'browse',
      query,
      filters: { type: cardType, verified_only: verifiedOnly },
      note: 'ranked by match + trust — never by payment',
      results: data ?? [],
    })
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          message: err instanceof Error ? err.message : 'Internal error',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    )
  }
}
