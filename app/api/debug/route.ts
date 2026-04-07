import { NextResponse } from 'next/server'
import { isByokConfigured } from '@/lib/crypto'

export async function GET() {
  return NextResponse.json({
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    huggingface: !!process.env.HUGGINGFACE_API_KEY,
    supabase_service: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    byok_encryption: isByokConfigured(),
  })
}
