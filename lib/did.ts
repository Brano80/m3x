/**
 * W3C DID Document builder — M3X AMN
 *
 * Supports two DID methods:
 *   did:m3x:<handle>          — native M3X method, resolved via /api/did/:handle
 *   did:web:m3x.space:agents:<handle>  — W3C did:web method, resolved via /agents/:handle/did.json
 *
 * At MVP, verification keys are optional. If an agent registered a
 * public_key_multibase (Ed25519), it's included in the DID Document.
 * If not, a placeholder stub is included so the document is still valid
 * W3C DID syntax — just without a real verifiable key yet.
 *
 * Phase 2 upgrade path: agents generate an Ed25519 keypair client-side,
 * submit the public key at registration, sign webhook/A2A payloads with
 * the private key. Counterparts verify via the DID Document.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://m3x.space'

export type AgentForDid = {
  handle: string
  did: string
  display_name?: string | null
  markets?: string[] | null
  capabilities?: string[] | null
  // webhook_url / a2a_endpoint intentionally NOT part of this type:
  // they are private and must never appear in a public DID document.
  public_key_multibase?: string | null
  trust_score?: number
  created_at?: string
}

export function buildDidDocument(agent: AgentForDid) {
  const did = agent.did  // e.g. did:m3x:brano
  const keyId = `${did}#key-1`

  // Verification method — real key if provided, stub otherwise
  const verificationMethod = agent.public_key_multibase
    ? {
        id: keyId,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase: agent.public_key_multibase,
      }
    : {
        id: keyId,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        // No key registered yet — document is structurally valid but unverifiable
        // Agent can update via PATCH /api/agent/me to add their public key
        publicKeyMultibase: null,
      }

  // Services — public endpoints only. The agent's webhook_url and private
  // a2a_endpoint are NEVER included here: the DID document is unauthenticated
  // and those are revealed only after mutual handshake acceptance.
  const services: object[] = [
    {
      id: `${did}#m3x-matchmaking`,
      type: 'AgentMatchmaking',
      serviceEndpoint: `${APP_URL}/api`,
    },
    {
      id: `${did}#a2a`,
      type: 'A2AAgent',
      serviceEndpoint: `${APP_URL}/api/a2a`,
    },
    {
      id: `${did}#did-doc`,
      type: 'LinkedDomains',
      serviceEndpoint: `${APP_URL}/api/did/${agent.handle}`,
    },
  ]

  const doc: Record<string, unknown> = {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1',
    ],
    id: did,
    controller: did,
    verificationMethod: [verificationMethod],
    authentication: [keyId],
    assertionMethod: [keyId],
    service: services,

    // M3X extensions — not part of W3C spec but valid under open-world assumption
    'm3x:handle': `@${agent.handle}`,
    'm3x:markets': agent.markets ?? [],
    'm3x:capabilities': agent.capabilities ?? [],
    'm3x:trust_score': agent.trust_score ?? 25,
    'm3x:registered_at': agent.created_at ?? null,

    // also resolvable as did:web
    'alsoKnownAs': [
      `did:web:${new URL(APP_URL).hostname}:agents:${agent.handle}`,
    ],
  }

  return doc
}
