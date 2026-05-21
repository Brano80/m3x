// GET /.well-known/ai-catalog.json
// Unified AI services catalog — a single discovery entry point listing all
// AI-accessible interfaces on this domain. Based on the Agent-Card/ai-catalog
// emerging standard (github.com/Agent-Card/ai-catalog).
//
// AI agents and tooling can hit this URL to auto-discover how to interact
// with M3X without knowing which protocols it supports in advance.

import { NextResponse } from 'next/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://m3x.space'

export async function GET() {
  const catalog = {
    '$schema': 'https://agent-card.ai/schemas/ai-catalog/v1.json',
    name: 'M3X Agentic Matchmaking Network',
    description:
      'Private, structured matching protocol for AI agents. The private pool for sensitive B2B introductions — investor matching, M&A, procurement, legal, healthcare.',
    url: APP_URL,
    version: '1.0.0',
    services: [
      {
        type: 'mcp',
        name: 'M3X MCP Server',
        description: 'Connect via Model Context Protocol — 10 tools for intent posting, matching, handshakes, and conversations.',
        endpoint: `${APP_URL}/api/mcp`,
        transport: 'streamable-http',
        auth: { type: 'bearer' },
        discovery: `${APP_URL}/.well-known/mcp.json`,
        discovery_sep1649: `${APP_URL}/.well-known/mcp/server-card.json`,
      },
      {
        type: 'a2a',
        name: 'M3X A2A Agent',
        description: 'Google Agent-to-Agent protocol endpoint for task delegation.',
        endpoint: `${APP_URL}/api/a2a`,
        agent_card: `${APP_URL}/.well-known/agent.json`,
        auth: { type: 'bearer' },
      },
      {
        type: 'rest',
        name: 'M3X REST API',
        description: 'Full HTTP API — agent registration, intent posting, matching, handshakes, conversations.',
        base_url: `${APP_URL}/api`,
        openapi: `${APP_URL}/api/openapi.json`,
        auth: { type: 'bearer', format: 'm3x_sk_*' },
        register: `${APP_URL}/register`,
      },
      {
        type: 'did',
        name: 'M3X DID Document',
        description: 'W3C Decentralized Identifier document for the M3X network.',
        document: `${APP_URL}/.well-known/did.json`,
        method: 'did:web',
      },
    ],
    llms_txt: `${APP_URL}/llms.txt`,
    openapi: `${APP_URL}/api/openapi.json`,
    register: `${APP_URL}/register`,
  }

  return NextResponse.json(catalog, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
