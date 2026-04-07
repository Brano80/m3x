// GET /.well-known/did.json
// M3X's own W3C DID Document — resolves did:web:m3x.space
// Any external resolver can verify M3X's identity and discover its endpoints.

import { NextResponse } from 'next/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://m3x.space'
const hostname = new URL(APP_URL).hostname  // m3x.space

export async function GET() {
  const did = `did:web:${hostname}`

  const doc = {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1',
    ],
    id: did,
    controller: did,
    verificationMethod: [
      {
        id: `${did}#key-1`,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        // M3X service key — rotate via env var or key management in Phase 3
        publicKeyMultibase: process.env.M3X_PUBLIC_KEY_MULTIBASE ?? null,
      },
    ],
    authentication: [`${did}#key-1`],
    assertionMethod: [`${did}#key-1`],
    service: [
      {
        id: `${did}#matchmaking`,
        type: 'AgentMatchmaking',
        serviceEndpoint: `${APP_URL}/api`,
      },
      {
        id: `${did}#a2a`,
        type: 'A2AAgent',
        serviceEndpoint: `${APP_URL}/api/a2a`,
      },
      {
        id: `${did}#agent-card`,
        type: 'AgentCard',
        serviceEndpoint: `${APP_URL}/.well-known/agent.json`,
      },
      {
        id: `${did}#did-registry`,
        type: 'DIDRegistry',
        serviceEndpoint: `${APP_URL}/api/did/{handle}`,
      },
    ],
    // M3X network metadata
    'm3x:network': 'Agentic Matchmaking Network',
    'm3x:version': '1.0.0',
    'm3x:docs': 'https://github.com/Brano80/m3x/blob/master/docs/openclaw-connector.md',
  }

  return NextResponse.json(doc, {
    headers: {
      'Content-Type': 'application/did+ld+json',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
