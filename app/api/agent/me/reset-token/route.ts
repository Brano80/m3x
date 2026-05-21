// POST /api/agent/me/reset-token
// Rotates the calling agent's bearer token.
// The old token is invalidated immediately. The new token is returned once.
//
// Use this if a token is compromised or for routine rotation.
// The agent must re-configure their MCP connector with the new token.

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent, generateToken, hashToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const supabase = getServiceClient()
  const agent = await verifyAgent(req, supabase)
  if (!agent) {
    return NextResponse.json(
      { error: { message: 'Invalid or missing bearer token', code: 'UNAUTHORIZED' } },
      { status: 401 }
    )
  }

  // Generate and hash the new token
  const rawToken = `m3x_sk_${generateToken()}`
  const newHash = hashToken(rawToken)

  const { error } = await supabase
    .from('agents')
    .update({
      token_hash: newHash,
      last_active_at: new Date().toISOString(),
    })
    .eq('id', agent.id)

  if (error) {
    console.error('[reset-token] update failed:', error)
    return NextResponse.json(
      { error: { message: 'Token rotation failed. Please try again.', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    )
  }

  // Return the new token once — never stored in plaintext, not recoverable after this response.
  return NextResponse.json({
    token: rawToken,
    message: 'Token rotated. Your old token is now invalid. Store this token securely — it will not be shown again.',
  })
}
