/**
 * Exact row count via PostgREST HEAD + Content-Range.
 * More reliable than supabase-js `count` alone in some serverless runtimes
 * (Prefer / Content-Range handling can yield null count).
 */
export async function fetchTableCount(
  supabaseUrl: string,
  serviceRoleKey: string,
  table: string
): Promise<{ count: number | null; error?: string }> {
  const base = supabaseUrl.replace(/\/$/, '')
  const url = `${base}/rest/v1/${table}?select=id`
  const res = await fetch(url, {
    method: 'HEAD',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'count=exact',
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { count: null, error: `HTTP ${res.status} ${text.slice(0, 200)}` }
  }

  const cr = res.headers.get('content-range')
  if (!cr) {
    return { count: null, error: 'missing content-range header' }
  }

  const parts = cr.split('/')
  const total = parts[1]
  if (!total || total === '*') {
    return { count: null, error: `unexpected content-range: ${cr}` }
  }

  const n = parseInt(total, 10)
  return { count: Number.isFinite(n) ? n : null, error: Number.isFinite(n) ? undefined : `parse: ${total}` }
}
