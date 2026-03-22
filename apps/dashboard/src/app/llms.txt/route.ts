// Generated: 2026-03-22 from docs-generator.json — do not edit manually
const LLMS_TXT = `# LivePort
> Secure localhost tunnels for AI agents

LivePort exposes local development servers to AI coding agents (Claude Code, OpenClaw, Cursor, Cline) so they can test, interact with, and verify running applications.

## Products
- @liveport/cli — CLI tool for creating tunnels
- @liveport/agent-sdk — TypeScript SDK for AI agent integration
- @liveport/mcp — MCP server for Model Context Protocol compatible agents

## Links
- Website: https://liveport.dev
- Documentation: https://liveport.dev/docs
- npm: https://www.npmjs.com/package/@liveport/cli
- GitHub: https://github.com/dundas/liveport
- Pricing: https://liveport.dev/pricing

## Use Cases
- AI coding agents testing frontend changes on localhost
- Cloud browser services accessing local dev servers
- MCP-compatible agents creating tunnels with one tool call
- Quick sharing of local servers with teammates via access tokens

## CLI Commands

### liveport connect <port>
Create a persistent tunnel to expose a local port.
Options: --key <key>, --server <url>, --ttl <duration>, --name <name>, --region <region>
Duration format: 30s, 5m, 2h, 1d
Tier limits: free=2h max, pro/team/enterprise=24h max
Example: liveport connect 3000 --ttl 2h

### liveport share <port>
Create a temporary bridge key + tunnel for quick sharing. Returns an access token.
Options: --key <key>, --server <url>, --ttl <duration>, --max-uses <number>
Defaults: ttl=2h, max-uses=1, maxUses cap=100
Example: liveport share 3000 --ttl 2h --max-uses 1

### liveport status
Show active tunnel status (URL, port, uptime, requests).

### liveport disconnect
Disconnect the active tunnel. Use --all to disconnect all tunnels.

### liveport config set|get|list|delete
Manage CLI configuration (key, server).
Example: liveport config set key lpk_...

## Access Tokens
Tunnels created with \`liveport share\` are protected by access tokens (lpa_ prefix).
Accessing protected tunnels requires: Authorization: Bearer lpa_...
Regular \`liveport connect\` tunnels remain open (no token required).
Access tokens are validated with HMAC-based constant-time comparison.

## Agent SDK
Install: npm install @liveport/agent-sdk

\`\`\`typescript
import { LivePortAgent } from '@liveport/agent-sdk';

const agent = new LivePortAgent({ key: process.env.LIVEPORT_BRIDGE_KEY! });
const tunnel = await agent.connect(3000);
await agent.waitForReady(tunnel);
// Use tunnel.url for requests
await agent.disconnect();
\`\`\`

SDK methods: connect(port, opts?), waitForReady(tunnel, opts?), waitForTunnel(opts?), listTunnels(), disconnect()
Error types: TunnelTimeoutError, ApiError, ConnectionError

## API Endpoints

### POST /api/agent/keys/temporary
Create a temporary bridge key. Requires Bearer auth with a parent bridge key.
Body: { ttlSeconds: number, maxUses: number }
Response: { key, id, expiresAt, maxUses, effectiveTtlSeconds }

### GET /api/agent/tunnels
List active tunnels for a bridge key. Requires Bearer auth.

### GET /api/agent/tunnels/wait?timeout=<ms>
Long-poll for tunnel availability. Returns 408 on timeout.

### GET /health
Tunnel server health check. Returns { status, connections, uptime }.

## Authentication
Bridge keys authenticate tunnel connections (format: lpk_ prefix).
Keys support: expiration dates, max uses (atomic enforcement), port restrictions.
Rate limiting: 30 requests/minute on key validation.

## Security
- Rate limiting on key validation (30 req/min via Redis)
- Atomic maxUses enforcement with conditional SQL
- Tunnel expiry enforcement (30s interval closes expired tunnels)
- Dev key bypass requires NODE_ENV=development AND ALLOW_DEV_KEYS=true
- HMAC constant-time access token comparison
- Hop-by-hop header stripping on proxied requests
- 10MB max request body size
`;

export function GET() {
  return new Response(LLMS_TXT, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
