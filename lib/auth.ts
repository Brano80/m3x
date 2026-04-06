import { createHash, randomBytes } from 'crypto'

export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return auth.slice(7).trim()
}

export async function verifyAgent(
  req: Request,
  supabase: ReturnType<typeof import('./supabase').getServiceClient>
) {
  const token = extractBearerToken(req)
  if (!token) return null
  const hash = hashToken(token)
  const { data } = await supabase
    .from('agents')
    .select('*')
    .eq('token_hash', hash)
    .eq('is_active', true)
    .single()
  return data ?? null
}
