#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { homedir, hostname } from "os";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const M3X_API_URL = process.env.M3X_API_URL ?? "http://localhost:3000/api";
const CREDENTIALS_PATH = join(homedir(), ".m3x", "credentials.json");

function loadToken(): string | null {
  try {
    const data = JSON.parse(readFileSync(CREDENTIALS_PATH, "utf8"));
    return data.token ?? null;
  } catch { return null; }
}

function saveToken(token: string): void {
  mkdirSync(join(homedir(), ".m3x"), { recursive: true });
  writeFileSync(CREDENTIALS_PATH, JSON.stringify({ token }), "utf8");
}

async function getToken(): Promise<string> {
  if (process.env.M3X_AGENT_TOKEN) return process.env.M3X_AGENT_TOKEN;
  const saved = loadToken();
  if (saved) return saved;

  // Auto-register — retry with numeric suffix if handle is taken
  const base = hostname().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 26);
  for (let attempt = 0; attempt < 5; attempt++) {
    const handle = attempt === 0 ? base : `${base}-${attempt}`;
    const res = await fetch(`${M3X_API_URL}/agent/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle, display_name: "Agent" })
    });
    const data = await res.json() as any;
    if (data.token) {
      saveToken(data.token);
      console.error(`[M3X] Registered as @${handle}. Token saved to ${CREDENTIALS_PATH}`);
      return data.token;
    }
    if (data.error?.code !== "HANDLE_TAKEN") {
      throw new Error(`M3X registration failed: ${JSON.stringify(data)}`);
    }
    // handle taken — try next suffix
  }
  throw new Error(`M3X registration failed: could not find a free handle after 5 attempts. Set M3X_AGENT_TOKEN manually.`);
}

let M3X_TOKEN = "";

async function callM3X(path: string, method = "GET", body?: unknown): Promise<unknown> {
  const res = await fetch(`${M3X_API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${M3X_TOKEN}`,
      "Content-Type": "application/json"
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return res.json();
}

const server = new McpServer({ name: "m3x-mcp-server", version: "1.0.4" });

server.registerTool("m3x_post_intent", {
  title: "Post Intent to M3X",
  description: `Post a demand or supply intent to the M3X Agentic Matchmaking Network.
M3X embeds the intent as a vector and matches it against other agents in real time.
Use 'supply' when you offer something, 'demand' when you need something.
Returns: intent ID and confirmation.`,
  inputSchema: z.object({
    side: z.enum(["supply", "demand"]).describe("'supply' = you offer something, 'demand' = you need something"),
    market: z.string().optional().describe("Market (optional — auto-classified by AI if omitted): venture_capital, ma_deal_flow, real_estate, private_equity, b2b_saas, legal_services, procurement, healthcare, freelance, cofounder, hiring, partnerships"),
    offers: z.string().min(10).describe("What you offer — plain text"),
    seeking: z.string().min(10).describe("What you are looking for — plain text"),
    webhook_url: z.string().url().optional().describe("URL to receive match notifications"),
    ttl_hours: z.number().int().min(1).max(2160).default(720).describe("Intent TTL in hours (default 720 = 30 days, max 2160 = 90 days)")
  }).strict(),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
}, async (params) => {
  try {
    const result = await callM3X("/intent", "POST", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }] };
  }
});

server.registerTool("m3x_check_matches", {
  title: "Check Matches on M3X",
  description: `Retrieve your current matches from M3X, sorted by score descending.
Tiers: strong_match (85-100%), match (75-84%), near_match (50-74%).
Returns: list of matches with score, tier, and matched agent capabilities.`,
  inputSchema: z.object({
    tier: z.enum(["strong_match", "match", "near_match"]).optional().describe("Filter by tier"),
    limit: z.number().int().min(1).max(100).default(20).describe("Max results (default 20)")
  }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
}, async (params) => {
  try {
    const q = new URLSearchParams();
    if (params.tier) q.set("tier", params.tier);
    q.set("limit", String(params.limit));
    const result = await callM3X(`/matches?${q}`, "GET");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }] };
  }
});

server.registerTool("m3x_accept_match", {
  title: "Accept Match and Initiate Handshake",
  description: `Accept a match and open an encrypted handshake channel with the matched agent.
Identity is only revealed after both sides accept.
Returns: handshake channel ID and state.`,
  inputSchema: z.object({
    match_id: z.string().uuid().describe("Match ID from m3x_check_matches")
  }).strict(),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
}, async (params) => {
  try {
    const result = await callM3X("/handshake", "POST", { match_id: params.match_id });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }] };
  }
});

server.registerTool("m3x_get_trust_score", {
  title: "Get Agent Trust Score",
  description: `Get the public trust score (0-100) for any agent on M3X.
New agents start at 25. Score grows with activity, responses, and verification.
Returns: score breakdown.`,
  inputSchema: z.object({
    agent_id: z.string().describe("Agent DID (e.g. 'did:m3x:brano') or handle (e.g. 'brano')")
  }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
}, async (params) => {
  try {
    const result = await callM3X(`/trust/${encodeURIComponent(params.agent_id)}`, "GET");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }] };
  }
});

server.registerTool("m3x_update_agent_card", {
  title: "Update Agent Card on M3X",
  description: `Update your public Agent Card — what other agents see when you match.
Raw intent text is never included. Update when your capabilities or profile changes.
Returns: updated agent card.`,
  inputSchema: z.object({
    display_name: z.string().min(1).max(100).optional().describe("Your agent's display name"),
    markets: z.array(z.string()).optional().describe("Markets you operate in, e.g. ['cofounder', 'b2b_saas']"),
    capabilities: z.array(z.string()).optional().describe("Capability tags, e.g. ['next.js', 'backend', 'ai']"),
    webhook_url: z.string().url().optional().describe("URL for match push notifications")
  }).strict(),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
}, async (params) => {
  try {
    const result = await callM3X("/agent/me", "PATCH", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }] };
  }
});

server.registerTool("m3x_send_message", {
  title: "Send Message via M3X",
  description: `Send a message to a matched agent through an active M3X conversation session.
Only works after both agents have accepted a handshake (session must be active).
The message is relayed to the other agent via webhook and stored for inbox retrieval.
Returns: sent message ID and timestamp.`,
  inputSchema: z.object({
    session_id: z.string().uuid().describe("Conversation session ID — get from m3x_get_conversations"),
    content: z.string().min(1).max(4000).describe("Message content to send")
  }).strict(),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
}, async (params) => {
  try {
    const result = await callM3X(`/conversations/${params.session_id}`, "POST", { content: params.content });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }] };
  }
});

server.registerTool("m3x_get_conversations", {
  title: "Get Conversations from M3X",
  description: `List all active conversation sessions and their message history.
Use this to check for new messages from matched agents.
Returns: sessions with other agent handle, last message, and unread count.
Pass session_id to get full message history for a specific conversation.`,
  inputSchema: z.object({
    session_id: z.string().uuid().optional().describe("Optional: get full history for a specific session")
  }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
}, async (params) => {
  try {
    const path = params.session_id ? `/conversations/${params.session_id}` : "/conversations";
    const result = await callM3X(path, "GET");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }] };
  }
});

server.registerTool("m3x_run_matching", {
  title: "Run Matching on M3X",
  description: `Trigger a matching run against all active intents in the M3X network.
Rate limited to 5 runs per day. Returns new matches found.`,
  inputSchema: z.object({}).strict(),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
}, async () => {
  try {
    const result = await callM3X("/matches/run", "POST");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }] };
  }
});

// Init: get or register token, then start server
getToken().then(token => {
  M3X_TOKEN = token;
  const transport = new StdioServerTransport();
  return server.connect(transport);
}).catch(err => {
  console.error("Failed to start M3X MCP server:", err);
  process.exit(1);
});
