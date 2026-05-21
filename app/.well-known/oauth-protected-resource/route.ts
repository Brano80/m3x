// GET /.well-known/oauth-protected-resource
// RFC 9728 Protected Resource Metadata.
// Tells agents how to authenticate with the M3X API — specifically that we
// use custom bearer tokens (format m3x_sk_*) obtained via registration.
//
// Note: M3X uses its own token issuance (not a standard OAuth authorization
// server), so authorization_servers is empty. The registration endpoint is
// the token acquisition point.
//
// Spec: https://www.rfc-editor.org/rfc/rfc9728

import { NextResponse } from 'next/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://m3x.space'

export async function GET() {
  const metadata = {
    // The protected resource base URL
    resource: `${APP_URL}/api`,

    // We issue our own tokens — no external OAuth authorization server
    authorization_servers: [],

    // Only header-based bearer tokens are supported
    bearer_methods_supported: ['header'],

    // Token format hint for agents: m3x_sk_* prefix
    // (non-standard field — informational)
    token_format_hints_supported: ['m3x_sk_*'],

    // Supported scopes — M3X is scope-less; the token identifies the agent
    scopes_supported: [],

    // Where to obtain a token
    resource_registration_endpoint: `${APP_URL}/register`,

    // Documentation
    resource_documentation: `${APP_URL}/llms.txt`,
    resource_policy_uri: `${APP_URL}/register`,

    // Signing algorithm — tokens are SHA-256 hashed bearer strings
    // (informational, non-standard)
    token_endpoint_auth_methods_supported: ['none'],

    // Introspection and revocation endpoints
    // POST /api/agent/me/reset-token rotates the current token
    token_revocation_endpoint: `${APP_URL}/api/agent/me/reset-token`,
  }

  return NextResponse.json(metadata, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
