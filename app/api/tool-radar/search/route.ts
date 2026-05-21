import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

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
    const body = await req.json()
    const query: string = body.query
    const limit: number = Math.min(body.limit ?? 5, 20)

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 })
    }

    const vector = await embedQuery(query.trim())
    if (!vector) {
      return NextResponse.json({ error: 'embedding failed — check HUGGINGFACE_API_KEY' }, { status: 500 })
    }

    const supabase = getServiceClient()
    const { data, error } = await supabase.rpc('tool_radar_search', {
      query_embedding: `[${vector.join(',')}]`,
      match_count: limit,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ results: data ?? [] })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown error' },
      { status: 500 }
    )
  }
}
