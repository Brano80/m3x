import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

const INGEST_SECRET = process.env.TOOL_RADAR_INGEST_SECRET

async function embedText(text: string): Promise<number[] | null> {
  const key = process.env.HUGGINGFACE_API_KEY
  if (!key) return null
  try {
    const res = await fetch(
      'https://router.huggingface.co/hf-inference/models/intfloat/multilingual-e5-large',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: `passage: ${text}` })
      }
    )
    if (res.status === 503) { await new Promise(r => setTimeout(r, 8000)); return embedText(text) }
    if (!res.ok) return null
    const result = await res.json()
    const vector: number[] = Array.isArray(result[0]) ? result[0] : result
    if (!Array.isArray(vector) || vector.length !== 1024) return null
    return vector
  } catch { return null }
}

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const auth = req.headers.get('authorization')
    if (INGEST_SECRET && auth !== `Bearer ${INGEST_SECRET}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const {
      name, tagline, description, problem_solved,
      use_cases, stack_tags, license, github_url,
      source = 'manual', sovereignty_flag = false
    } = body

    if (!name || !tagline || !problem_solved) {
      return NextResponse.json({ error: 'name, tagline, and problem_solved are required' }, { status: 400 })
    }

    // Build search doc for embedding
    const search_doc = [name, tagline, description, problem_solved, ...(use_cases ?? []), ...(stack_tags ?? [])].filter(Boolean).join(' ')

    // Generate embedding
    const vector = await embedText(search_doc)
    if (!vector) {
      return NextResponse.json({ error: 'embedding failed — check HUGGINGFACE_API_KEY' }, { status: 500 })
    }

    const supabase = getServiceClient()

    // Upsert by name (idempotent)
    const { data, error } = await supabase
      .schema('tool_radar')
      .from('tool_cards')
      .upsert({
        name, tagline, description, problem_solved,
        use_cases: use_cases ?? [],
        stack_tags: stack_tags ?? [],
        license: license ?? 'unknown',
        github_url: github_url ?? null,
        source,
        sovereignty_flag,
        search_doc,
        embedding: `[${vector.join(',')}]`,
        added_by: 'brano',
        save_count: 0,
      }, { onConflict: 'name' })
      .select('id, name')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: data.id, name: data.name })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown error' }, { status: 500 })
  }
}
