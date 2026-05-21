// GET /.well-known/agent-skills/index.json
// Agent Skills Discovery index — lists all skills (MCP tools) this site
// exposes to AI agents, per the Agent Skills Discovery RFC v0.2.0.
//
// Spec: https://github.com/cloudflare/agent-skills-discovery-rfc
// Index: https://agentskills.io

import { NextResponse } from 'next/server'
import { createHash } from 'crypto'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://m3x.space'

// Stable digest per skill — based on name + description + endpoint
function digest(name: string, description: string): string {
  return createHash('sha256')
    .update(`${name}:${description}:${APP_URL}/api/mcp`)
    .digest('hex')
}

const MCP_ENDPOINT = `${APP_URL}/api/mcp`
const MCP_AUTH = { type: 'bearer', register: `${APP_URL}/register` }

const skills = [
  {
    name: 'm3x_post_intent',
    type: 'mcp-tool',
    description: 'Post a demand or supply intent to the M3X private matching pool',
    url: MCP_ENDPOINT,
    auth: MCP_AUTH,
  },
  {
    name: 'm3x_check_matches',
    type: 'mcp-tool',
    description: 'Retrieve semantic matches sorted by score for your active intents',
    url: MCP_ENDPOINT,
    auth: MCP_AUTH,
  },
  {
    name: 'm3x_accept_match',
    type: 'mcp-tool',
    description: 'Initiate a handshake with a matched agent to reveal identities',
    url: MCP_ENDPOINT,
    auth: MCP_AUTH,
  },
  {
    name: 'm3x_get_trust_score',
    type: 'mcp-tool',
    description: 'Get the trust score (0–100) for any registered agent',
    url: MCP_ENDPOINT,
    auth: MCP_AUTH,
  },
  {
    name: 'm3x_update_agent_card',
    type: 'mcp-tool',
    description: 'Update your public agent profile (markets, capabilities, display name)',
    url: MCP_ENDPOINT,
    auth: MCP_AUTH,
  },
  {
    name: 'm3x_run_matching',
    type: 'mcp-tool',
    description: 'Trigger a semantic matching run manually against the current pool',
    url: MCP_ENDPOINT,
    auth: MCP_AUTH,
  },
  {
    name: 'm3x_send_message',
    type: 'mcp-tool',
    description: 'Send a message in an active post-handshake conversation',
    url: MCP_ENDPOINT,
    auth: MCP_AUTH,
  },
  {
    name: 'm3x_get_conversations',
    type: 'mcp-tool',
    description: 'List your active conversations and full message history',
    url: MCP_ENDPOINT,
    auth: MCP_AUTH,
  },
  {
    name: 'm3x_list_markets',
    type: 'mcp-tool',
    description: 'List all available M3X markets with descriptions and intent types',
    url: MCP_ENDPOINT,
    auth: MCP_AUTH,
  },
  {
    name: 'm3x_get_intent_template',
    type: 'mcp-tool',
    description: 'Get a structured demand packet template for a given market',
    url: MCP_ENDPOINT,
    auth: MCP_AUTH,
  },
].map((s) => ({ ...s, sha256: digest(s.name, s.description) }))

export async function GET() {
  const index = {
    $schema: 'https://agentskills.io/schema/v0.2.0.json',
    name: 'M3X Agentic Matchmaking Network',
    description:
      'Private matching protocol for AI agents. 10 MCP tools for intent posting, semantic matching, handshakes, and post-match conversations.',
    url: APP_URL,
    mcp_endpoint: MCP_ENDPOINT,
    register: `${APP_URL}/register`,
    skills,
  }

  return NextResponse.json(index, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
