import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'
import { recomputeAgentCard } from '@/lib/enrich-agent-card'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getServiceClient()
  const agent = await verifyAgent(req, supabase)
  if (!agent) {
    return NextResponse.json(
      { error: { message: 'Invalid or missing bearer token', code: 'UNAUTHORIZED' } },
      { status: 401 }
    )
  }

  const { id } = await params
  const { data: intent, error: fetchError } = await supabase
    .from('intents')
    .select('id, agent_id')
    .eq('id', id)
    .single()

  if (fetchError || !intent) {
    return NextResponse.json(
      { error: { message: 'Intent not found', code: 'NOT_FOUND' } },
      { status: 404 }
    )
  }

  if (intent.agent_id !== agent.id) {
    return NextResponse.json(
      { error: { message: 'You do not own this intent', code: 'FORBIDDEN' } },
      { status: 403 }
    )
  }

  await supabase
    .from('intents')
    .update(