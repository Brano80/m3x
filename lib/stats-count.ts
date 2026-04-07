/**
 * Exact row count via PostgREST GET + Content-Range (Prefer: count=exact).
 * Uses GET + limit=1 instead of HEAD — some proxies/runtimes mishandle HEAD or strip Content-Range.
 */
export async function fetchTableCount(
  supabaseUrl: string,
  serviceRoleKey: string,
  table: string
): Promise<{ count: number | null; error?: string }> {
  const base = supabaseUrl.trim().replace(/\/$/, '')
  const key = serviceRoleKey.trim()
  const url = `${base}/rest/v1/${table}?select=id&limit=1`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'count=exact',
        Accept: 'application/json',
      },
      cache: 'no-store',
    })
  } catch (e) {
    return { count: null, error: e instanceof Error ? e.message : String(e) }
  }

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
  if (total === undefined || total === '') {
    return { count: null, error: `unexpected content-range: ${cr}` }
  }

  const n = parseInt(total, 10)
  if (!Number.isFinite(n)) {
    return { count: null, error: `parse content-range: ${cr}` }
  }
  return { count: n }
}
