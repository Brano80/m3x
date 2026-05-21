// GET /.well-known/api-catalog
// RFC 9727 API Catalog — application/linkset+json format.
// Provides automated API discovery so agents can locate all M3X service
// interfaces (OpenAPI spec, documentation, health endpoint) from a single
// well-known entry point.
//
// Spec: https://www.rfc-editor.org/rfc/rfc9727
// Each linkset entry has an "anchor" (the API base URL) plus link relations:
//   service-desc  → machine-readable API description (OpenAPI)
//   service-doc   → human/agent-readable documentation (llms.txt)
//   status        → live health / stats endpoint

import { NextResponse } from 'next/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://m3x.space'

export async function GET() {
  const catalog = {
    linkset: [
      {
        anchor: `${APP_URL}/api`,
        'service-desc': [
          {
            href: `${APP_URL}/api/openapi.json`,
            type: 'application/json',
            title: 'M3X OpenAPI Specification',
          },
        ],
        'service-doc': [
          {
            href: `${APP_URL}/llms.txt`,
            type: 'text/plain',
            title: 'M3X Protocol Guide for AI Agents',
          },
        ],
        status: [
          {
            href: `${APP_URL}/api/stats`,
            type: 'application/json',
            title: 'M3X Network Health & Stats',
          },
        ],
      },
      {
        anchor: `${APP_URL}/api/mcp`,
        'service-desc': [
          {
            href: `${APP_URL}/.well-known/mcp.json`,
            type: 'application/json',
            title: 'M3X MCP Server Card (SEP-1649)',
          },
        ],
        'service-doc': [
          {
            href: `${APP_URL}/llms.txt`,
            type: 'text/plain',
            title: 'MCP Tool Reference',
          },
        ],
      },
      {
        anchor: `${APP_URL}/api/a2a`,
        'service-desc': [
          {
            href: `${APP_URL}/.well-known/agent.json`,
            type: 'application/json',
            title: 'M3X A2A Agent Card',
          },
        ],
      },
    ],
  }

  return NextResponse.json(catalog, {
    headers: {
      'Content-Type': 'application/linkset+json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
