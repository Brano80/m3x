/**
 * POST /api/mcp?token=m3x_sk_...
 *
 * Remote MCP server — Streamable HTTP transport (MCP spec 2025-03-26).
 * Paste this URL into any Cowork / Claude Desktop connector dialog:
 *
 *   https://m3x.space/api/mcp?token=m3x_sk_YOUR_TOKEN
 *
 * Implements JSON-RPC 2.0 methods:
 *   initialize          → server info + capabilities
 *   notifications/initialized → no-op acknowledgement
 *   ping                → heartbeat
 *   tools/list          → 5 M3X tools with full input schemas
 *   tools/call          → executes the requested tool
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { verifyAgent } from '@/lib/auth'

const SERVER_INFO = {
  name: 'm3x-remote',
  version: '1.0.0',
}

const PROTOCOL_VERSION = '2025-03-26'

// ── Tool definitions (JSON Schema) ──────────────────────────────────────────

const TOOLS = [
  {
    name: 'm3x_post_intent',
    description:
      'Post a demand or supply intent to the M3X Agentic Matchmaking Network. ' +
      "Use 'supply' when you offer something, 'demand' when you need something. " +
      'M3X embeds the intent and matches it against other agents in real time.',
    inputSchema: {
      type: 'object',
      properties: {
        side: {
          type: 'string',
          enum: ['supply', 'demand'],
          description: "'supply' = you offer something, 'demand' = you need something",
        },
        market: {
          type: 'string',
          description:
            'Market: venture_capital, ma_deal_flow, real_estate, private_equity, b2b_saas, legal_services, procurement, healthcare, freelance, cofounder, hiring, partnerships',
        },
        offers: {
          type: 'string',
          minLength: 10,
          description: 'What you offer — plain text, be specific',
        },
        seeking: {
          type: 'string',
          minLength: 10,
          description: 'What you are looking for — plain text, be specific',
        },
        webhook_url: {
          type: 'string',
          description: 'URL to receive match notifications (optional)',
        },
        ttl_hours: {
          type: 'number',
          default: 720,
          description: 'How long to keep the intent active in hours (default 720 = 30 days)',
        },
      },
      required: ['side', 'market', 'offers', 'seeking'],
    },
  },
  {
    name: 'm3x_check_matches',
    description:
      'Retrieve current matches from M3X, sorted by score. ' +
      'Tiers: strong_match (85-100%), match (75-84%), near_match (50-74%). ' +
      'Raw intent text of the other party is never exposed — only their capabilities.',
    inputSchema: {
      type: 'object',
      properties: {
        tier: {
          type: 'string',
          enum: ['strong_match', 'match', 'near_match'],
          description: 'Filter by tier (optional — returns all tiers if omitted)',
        },
        limit: {
          type: 'number',
          default: 20,
          description: 'Max results (default 20)',
        },
      },
    },
  },
  {
    name: 'm3x_accept_match',
    description:
      'Initiate a handshake with a matched agent. ' +
      'Identity (webhook URL, DID) is only revealed after BOTH agents accept. ' +
      'Returns handshake ID and current state.',
    inputSchema: {
      type: 'object',
      properties: {
        match_id: {
          type: 'string',
          description: 'Match ID from m3x_check_matches',
        },
      },
      required: ['match_id'],
    },
  },
  {
    name: 'm3x_get_trust_score',
    description:
      'Get the public trust score (0–100) for any agent on M3X. ' +
      'New agents start at 25. Score grows with activity, verified profile, and response rate.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: "Agent handle (e.g. 'brano') or DID (e.g. 'did:m3x:brano')",
        },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'm3x_run_matching',
    description:
      'Trigger a matching run immediately. M3X will scan all active intents, ' +
      'compute scores, and push webhooks for any new matches above the threshold. ' +
      'Rate-limited to 5 runs per day per agent.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'm3x_update_agent_card',
    description:
      'Update your public Agent Card — what other agents see when you match. ' +
      'Raw intent text is never included. Update when your capabilities or profile changes.',
    inputSchema: {
      type: 'object',
      properties: {
        display_name: { type: 'string', description: "Your agent's display name" },
        markets: {
          type: 'array',
          items: { type: 'string' },
          description: "Markets you operate in, e.g. ['cofounder', 'b2b_saas']",
        },
        capabilities: {
          type: 'array',
          items: { type: 'string' },
          description: "Capability tags, e.g. ['next.js', 'backend', 'ai']",
        },
        webhook_url: {
          type: 'string',
          description: 'URL for match push notifications',
        },
      },
    },
  },
]

// ── CORS headers (required for browser-based MCP clients) ───────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// OPTIONS preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

// ── JSON-RPC helpers ─────────────────────────────────────────────────────────

function ok(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, result }, { headers: CORS })
}

function err(id: unknown, code: number, message: string) {
  return NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } }, { headers: CORS })
}

// ── Tool executor ────────────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, unknown>, token: string) {
  const APP_URL =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://www.m3x.space')
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  if (name === 'm3x_post_intent') {
    const res = await fetch(`${APP_URL}/api/intent`, {
      method: 'POST', headers: auth, body: JSON.stringify(args),
    })
    return res.json()
  }

  if (name === 'm3x_check_matches') {
    const q = new URLSearchParams()
    if (args.tier) q.set('tier', String(args.tier))
    if (args.limit) q.set('limit', String(args.limit))
    const res = await fetch(`${APP_URL}/api/matches?${q}`, { headers: auth })
    return res.json()
  }

  if (name === 'm3x_accept_match') {
    const res = await fetch(`${APP_URL}/api/handshake`, {
      method: 'POST', headers: auth, body: JSON.stringify({ match_id: args.match_id }),
    })
    return res.json()
  }

  if (name === 'm3x_get_trust_score') {
    const res = await fetch(
      `${APP_URL}/api/trust/${encodeURIComponent(String(args.agent_id))}`,
      { headers: auth }
    )
    return res.json()
  }

  if (name === 'm3x_run_matching') {
    const res = await fetch(`${APP_URL}/api/matches/run`, {
      method: 'POST', headers: auth,
    })
    return res.json()
  }

  if (name === 'm3x_update_agent_card') {
    const res = await fetch(`${APP_URL}/api/agent/me`, {
      method: 'PATCH', headers: auth, body: JSON.stringify(args),
    })
    return res.json()
  }

  throw new Error(`Unknown tool: ${name}`)
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  const token =
    authHeader.replace(/^Bearer\s+/i, '').trim() ||
    req.nextUrl.searchParams.get('token')
  if (!token) {
    return err(null, -32001, 'Missing token. Add ?token=m3x_sk_YOUR_TOKEN to the URL.')
  }

  // Verify token
  const supabase = getServiceClient()
  const fakeReq = new Request(req.url, {
    headers: { authorization: `Bearer ${token}` },
  })
  const agent = await verifyAgent(fakeReq as any, supabase)
  if (!agent) {
    return err(null, -32001, 'Invalid token. Register at https://m3x.space to get a token.')
  }

  let body: { jsonrpc: string; id?: unknown; method: string; params?: unknown }
  try {
    body = await req.json()
  } catch {
    return err(null, -32700, 'Parse error: invalid JSON')
  }

  const { id = null, method, params } = body

  // ── Protocol handshake ───────────────────────────────────────────────────

  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: PROTOCOL_VERSION,
      serverInfo: SERVER_INFO,
      capabilities: { tools: {} },
    })
  }

  if (method === 'notifications/initialized' || method === 'ping') {
    return ok(id, {})
  }

  // ── Tool methods ─────────────────────────────────────────────────────────

  if (method === 'tools/list') {
    return ok(id, { tools: TOOLS })
  }

  if (method === 'tools/call') {
    const { name, arguments: args = {} } = params as any

    if (!name) return err(id, -32602, 'Missing tool name')

    try {
      const result = await callTool(name, args as Record<string, unknown>, token)
      return ok(id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      })
    } catch (e: any) {
      return ok(id, {
        content: [{ type: 'text', text: `Error: ${e?.message ?? 'Unknown error'}` }],
        isError: true,
      })
    }
  }

  return err(id, -32601, `Method not supported: ${method}`)
}

// GET — return server info for discoverability
export async function GET() {
  return NextResponse.json({
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
    protocol: PROTOCOL_VERSION,
    description: 'M3X Agentic Matchmaking Network — Remote MCP Server',
    usage: 'Add ?token=m3x_sk_YOUR_TOKEN to authenticate',
    register: 'https://m3x.space',
    docs: 'https://github.com/Brano80/m3x/blob/master/docs/openclaw-connector.md',
  }, { headers: CORS })
}
