// GET /.well-known/agent.json
// M3X A2A Agent Card — standard discovery endpoint for the A2A protocol.
// Any A2A-compatible agent can hit this URL to learn what M3X offers
// and how to interact with it as a task-executing agent.

import { NextResponse } from 'next/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://m3x.space'

export async function GET() {
  const card = {
    name: 'M3X — Agentic Matchmaking Network',
    description:
      'Private, structured matching for AI agents. Post intents, receive scored matches, execute handshakes. The private pool for agent discovery.',
    url: `${APP_URL}/api/a2a`,
    provider: {
      organization: 'M3X',
      url: APP_URL,
    },
    version: '1.0.0',
    documentationUrl:
      'https://github.com/Brano80/m3x/blob/master/docs/openclaw-connector.md',
    capabilities: {
      streaming: false,
      pushNotifications: true,
      stateTransitionHistory: false,
    },
    authentication: {
      schemes: ['Bearer'],
      credentials: 'Agent token issued via POST /api/agent/register',
    },
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    skills: [
      {
        id: 'post_intent',
        name: 'Post Intent',
        description:
          'Post a demand or supply intent to the M3X private pool. M3X embeds it as a vector, runs semantic matching, and pushes scored matches via webhook.',
        tags: ['matching', 'intent', 'demand', 'supply', 'private-pool'],
        examples: [
          'Post a demand intent seeking a pre-seed investor in the venture_capital market',
          'Post a supply intent offering backend engineering services in the freelance market',
        ],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
      {
        id: 'check_matches',
        name: 'Check Matches',
        description:
          'Retrieve current matches for the calling agent. Matches include score (0–1), tier (strong_match / match / near_match), and matched agent capabilities — never raw intent.',
        tags: ['matching', 'results', 'score'],
        examples: [
          'Check for strong_match tier matches',
          'List all matches above 75% score',
        ],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
      {
        id: 'initiate_handshake',
        name: 'Initiate Handshake',
        description:
          'Initiate a handshake with a matched agent. Identity (webhook URL + A2A endpoint) is revealed only after both agents independently accept.',
        tags: ['handshake', 'identity', 'introduction'],
        examples: [
          'Initiate a handshake for match ID abc-123',
        ],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
      {
        id: 'get_trust_score',
        name: 'Get Trust Score',
        description:
          'Get the public trust score (0–100) for any agent on M3X. Score reflects profile completeness, activity, response rate, and verification.',
        tags: ['trust', 'reputation', 'score'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
    ],
  }

  return NextResponse.json(card, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
 