# LivePort

Secure localhost tunnels for AI agents. Expose your dev server to Claude Code, OpenClaw, and Cursor with zero config.

[![npm](https://img.shields.io/npm/v/@liveport/cli)](https://www.npmjs.com/package/@liveport/cli)
[![npm](https://img.shields.io/npm/v/@liveport/mcp)](https://www.npmjs.com/package/@liveport/mcp)
[![License](https://img.shields.io/github/license/dundas/liveport)](LICENSE)

## The Problem

AI coding agents can write your code but can't test it against your running dev server. The dev server runs on localhost — invisible to cloud browsers, headless Playwright instances, and remote AI agents.

Existing tunnel tools weren't designed for this:

- **ngrok**: Interstitial warning page breaks automated agents expecting JSON. URLs change on restart. Paid for persistent URLs.
- **Cloudflare Tunnel**: Requires a domain + Cloudflare account + 30 min setup. Overkill for a dev session.
- **Tailscale Funnel**: Requires Tailscale VPN setup. Not a standalone tool.

## How LivePort Works

LivePort creates a secure tunnel from your localhost to a public URL. One command, zero config, no account required.

```bash
# CLI
npx @liveport/cli --port 3000

# MCP (for AI agents)
npx @liveport/mcp
```

## Comparison

| | ngrok | Cloudflare Tunnel | Tailscale Funnel | **LivePort** |
|---|---|---|---|---|
| Setup | CLI + account | Domain + CF account + cloudflared | Tailscale VPN | **Zero-config** |
| Free tier | 1 tunnel, interstitial page | Free, needs domain | Free with Tailscale | **Free** |
| AI agent compatible | Interstitial breaks agents | Works but heavy | Works but requires VPN | **Purpose-built** |
| Best for | Webhook testing, demos | Production tunnels | Private network access | **AI dev workflows** |

## Packages

| Package | Description |
|---------|-------------|
| [@liveport/cli](https://www.npmjs.com/package/@liveport/cli) | CLI tool for creating tunnels |
| [@liveport/agent-sdk](https://www.npmjs.com/package/@liveport/agent-sdk) | TypeScript SDK for AI agent integration |
| [@liveport/mcp](https://www.npmjs.com/package/@liveport/mcp) | MCP server for Model Context Protocol compatible agents |

## Use Cases

- **AI coding agents** testing frontend changes on localhost
- **Cloud browser services** accessing local dev servers
- **MCP-compatible agents** creating tunnels with one tool call

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start development
pnpm dev

# Run tests
pnpm test
```

## Links

- Website: [liveport.dev](https://liveport.dev)
- Documentation: [liveport.dev/docs](https://liveport.dev/docs)
- Pricing: [liveport.dev/pricing](https://liveport.dev/pricing)

## License

MIT

*LivePort is a [Derivative Labs](https://derivative.io) product.*
