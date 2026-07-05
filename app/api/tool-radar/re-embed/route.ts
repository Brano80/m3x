import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

const INGEST_SECRET = process.env.TOOL_RADAR_INGEST_SECRET

async function embedText(text: string): Promise<number[] | null> {
  const key = process.env.HUGGINGFACE_API_KEY
  if (!key) return null
  // Try router first, fall back to classic API
  const urls = [
    'https://router.huggingface.co/hf-inference/models/intfloat/multilingual-e5-large',
    'https://api-inference.huggingface.co/models/intfloat/multilingual-e5-large',
  ]
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: `passage: ${text}` }),
      })
      if (res.status === 503) {
        await new Promise(r => setTimeout(r, 8000))
        const res2 = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: `passage: ${text}` }),
        })
        if (!res2.ok) continue
        const r2 = await res2.json()
        const v2: number[] = Array.isArray(r2[0]) ? r2[0] : r2
        if (Array.isArray(v2) && v2.length === 1024) return v2
        continue
      }
      if (!res.ok) continue
      const result = await res.json()
      const vector: number[] = Array.isArray(result[0]) ? result[0] : result
      if (Array.isArray(vector) && vector.length === 1024) return vector
    } catch {
      continue
    }
  }
  return null
}

// GET /api/tool-radar/re-embed?secret=<secret>&missing=true
// GET /api/tool-radar/re-embed?secret=<secret>&id=<uuid>
export async function GET(req: NextRequest) {
  // Auth
  const secret = req.nextUrl.searchParams.get('secret')
  if (INGEST_SECRET && secret !== INGEST_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()

  // Determine which tools to re-embed
  const id = req.nextUrl.searchParams.get('id')
  const missing = req.nextUrl.searchParams.get('missing') === 'true'

  let query = supabase.schema('tool_radar').from('tool_cards')
    .select('id, name, tagline, description, problem_solved, use_cases, stack_tags, search_doc')

  if (id) {
    query = query.eq('id', id)
  } else if (missing) {
    query = query.is('embedding', null)
  } else {
    return NextResponse.json({ error: 'provide ?missing=true or ?id=<uuid>' }, { status: 400 })
  }

  const { data: tools, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!tools || tools.length === 0) return NextResponse.json({ ok: true, processed: 0, message: 'nothing to do' })

  const results: { name: string; id: string; ok: boolean; error?: string }[] = []

  for (const tool of tools) {
    const useCases = Array.isArray(tool.use_cases) ? tool.use_cases : []
    const stackTags = Array.isArray(tool.stack_tags) ? tool.stack_tags : []
    const search_doc = tool.search_doc ||
      [tool.name, tool.tagline, tool.description, tool.problem_solved, ...useCases, ...stackTags]
        .filter(Boolean).join(' ')

    const vector = await embedText(search_doc)
    if (!vector) {
      results.push({ name: tool.name, id: tool.id, ok: false, error: 'embedding failed' })
      continue
    }

    const { error: updateErr } = await supabase
      .schema('tool_radar')
      .from('tool_cards')
      .update({
        search_doc,
        embedding: `[${vector.join(',')}]`,
      })
      .eq('id', tool.id)

    if (updateErr) {
      results.push({ name: tool.name, id: tool.id, ok: false, error: updateErr.message })
    } else {
      results.push({ name: tool.name, id: tool.id, ok: true })
    }

    // Brief pause between HF calls to avoid rate limiting
    await new Promise(r => setTimeout(r, 300))
  }

  const succeeded = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length
  return NextResponse.json({ ok: true, processed: tools.length, succeeded, failed, results })
}
