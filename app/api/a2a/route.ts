// POST /api/a2a
// A2A protocol task handler — JSON-RPC 2.0.
// A2A-compatible agents POST tasks here after discovering M3X via /.well-known/agent.json.
//
// Supported methods:
//   tasks/send   — execute a skill (post_intent, check_matches, initiate_handshake, get_trust_score)
//   tasks/get    — retrieve a previously submitted task result
//
// Auth: Bearer <agent_token>  (same token as REST API)

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'

type JsonRpcRequest = {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params: Record<string, unknown>
}

type TaskStatus = { state: 'submitted' | 'working' | 'completed' | 'failed' }
type TaskArtifact = { parts: { type: 'data'; data: unknown }[] }

function rpcOk(id: string | number, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, result })
}

function rpcError(id: string | number | null, code: number, message: string) {
  return NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } })
}

function taskResult(taskId: string, status: TaskStatus, data?: unknown) {
  const result: {
    id: string
    status: TaskStatus
    artifacts?: TaskArtifact[]
  } = { id: taskId, status }
  if (data !== undefined) {
    result.artifacts = [{ parts: [{ type: 'data', data }] }]
  }
  return result
}

// ---------- Skill handlers ----------

async function skillPostIntent(agent: any, params: Record<string, unknown>, supabase: any) {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://m3x.space'
  const res = await fetch(`${APP_URL}/api/intent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params._raw_token}`,
    },
    body: JSON.stringify({
      side: params.side,
      market: params.market,
      offers: params.offers,
      seeking: params.seeking,
      guardrails: params.guardrails,
      ttl_hours: params.ttl_hours ?? 72,
      webhook_url: params.webhook_url,
    }),
  })
  return res.json()
}

async function skillCheckMatches(agent: any, params: Record<string, unknown>, supabase: any) {
  const q = new URLSearchParams()
  if (params.tier) q.set('tier', String(params.tier))
  if (params.limit) q.set('limit', String(params.limit))

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://m3x.space'
  const res = await fetch(`${APP_URL}/api/matches?${q}`, {
    headers: { Authorization: `Bearer ${params._raw_token}` },
  })
  return res.json()
}

async function skillInitiateHandshake(agent: any, params: Record<string, unknown>, supabase: any) {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://m3x.space'
  const res = await fetch(`${APP_URL}/api/handshake`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params._raw_token}`,
    },
    body: JSON.stringify({ match_id: params.match_id }),
  })
  return res.json()
}

async function skillGetTrustScore(agent: any, params: Record<string, unknown>, supabase: any) {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://m3x.space'
  const res = await fetch(
    `${APP_URL}/api/trust/${encodeURIComponent(String(params.agent_id))}`,
    { headers: { Authorization: `Bearer ${params._raw_token}` } }
  )
  return res.json()
}

// ---------- Main handler ----------

export async function POST(req: NextRequest) {
  const supabase = getServiceClient()

  // Auth — same bearer token as REST API
  const agent = await verifyAgent(req, supabase)
  if (!agent) {
    return rpcError(null, -32001, 'Unauthorized: invalid or missing bearer token')
  }

  let body: JsonRpcRequest
  try {
    body = await req.json()
  } catch {
    return rpcError(null, -32700, 'Parse error: invalid JSON')
  }

  if (body.jsonrpc !== '2.0' || !body.method) {
    return rpcError(body.id ?? null, -32600, 'Invalid JSON-RPC 2.0 request')
  }

  const { id, method, params = {} } = body

  // Inject raw token so skill handlers can call the REST API on behalf of the agent
  const rawToken = req.headers.get('authorization')?.replace('Bearer ', '') ?? ''
  const enrichedParams = { ...params, _raw_token: rawToken }

  // tasks/send — execute a skill
  if (method === 'tasks/send') {
    const taskId = String(params.id ?? crypto.randomUUID())
    const message = params.message as any
    const skillData = message?.parts?.[0]?.data ?? {}
    const skill = String(skillData.skill ?? '')

    const skillParams = { ...skillData, _raw_token: rawToken }

    try {
      let data: unknown

      if (skill === 'post_intent') {
        data = await skillPostIntent(agent, skillParams, supabase)
      } else if (skill === 'check_matches') {
        data = await skillCheckMatches(agent, skillParams, supabase)
      } else if (skill === 'initiate_handshake') {
        data = await skillInitiateHandshake(agent, skillParams, supabase)
      } else if (skill === 'get_trust_score') {
        data = await skillGetTrustScore(agent, skillParams, supabase)
      } else {
        return rpcOk(id, taskResult(taskId, { state: 'failed' }, {
          error: `Unknown skill: "${skill}". Available: post_intent, check_matches, initiate_handshake, get_trust_score`,
        }))
      }

      return rpcOk(id, taskResult(taskId, { state: 'completed' }, data))
    } catch (err: any) {
      return rpcOk(id, taskResult(taskId, { state: 'failed' }, {
        error: err?.message ?? 'Internal error',
      }))
    }
  }

  // tasks/get — M3X tasks are synchronous; return completed stub
  if (method === 'tasks/get') {
    const taskId = String(params.id ?? '')
    return rpcOk(id, taskResult(taskId, { state: 'completed' }))
  }

  return rpcError(id, -32601, `Method not found: "${method}". Supported: tasks/send, tasks/get`)
}
