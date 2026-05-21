// GET /.well-known/mcp/server-card.json
// SEP-1649 / PR-2127 canonical path for MCP server discovery.
// Identical content to /.well-known/mcp.json — both paths are served
// so clients using either convention find the card.

import { NextResponse } from 'next/server'
import { buildMcpServerCard } from '../../mcp.json/route'

export async function GET() {
  return NextResponse.json(buildMcpServerCard(), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
