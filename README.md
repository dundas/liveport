# LivePort

**Secure localhost tunnels for AI agents.** Expose your dev server to Claude Code, OpenClaw, and Cursor with zero config.

[![npm](https://img.shields.io/npm/v/@liveport/cli)](https://www.npmjs.com/package/@liveport/cli)
[![npm](https://img.shields.io/npm/v/@liveport/mcp)](https://www.npmjs.com/package/@liveport/mcp)
[![License](https://img.shields.io/github/license/dundas/liveport)](LICENSE)

## Quick Start

```bash
# CLI — expose localhost in one command
npx @liveport/cli connect 3000

# MCP — let AI agents create tunnels via tool calls
npx @liveport/mcp
```

No account required. No interstitial page. No config.

## Why LivePort

| | ngrok | Cloudflare Tunnel | Tailscale Funnel | **LivePort** |
|---|---|---|---|---|
| Setup | CLI + account + auth token | Domain + CF account + cloudflared | Full Tailscale VPN | **Zero-config** |
| Persistent URL (free) | ✗ ($8/mo) | ✗ (needs domain) | ✗ (needs Tailscale) | **✓ Auto-assigned on signup** |
| Interstitial page | ✓ (breaks agents) | ✗ | ✗ | **✗** |
| AI agent native | ✗ | ✗ | ✗ | **✓ MCP + SDK built-in** |
| Best for | Webhooks, demos | Production tunnels | Private networks | **AI dev workflows** |

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| [`@liveport/cli`](https://www.npmjs.com/package/@liveport/cli) | CLI tunnel client | `npx @liveport/cli` |
| [`@liveport/mcp`](https://www.npmjs.com/package/@liveport/mcp) | MCP server for AI agents | `npx @liveport/mcp` |
| [`@liveport/agent-sdk`](https://www.npmjs.com/package/@liveport/agent-sdk) | TypeScript SDK | `npm i @liveport/agent-sdk` |

## Use Cases

- **AI coding agents** (Claude Code, Cursor, OpenClaw) — test localhost changes without deploying
- **Webhook development** — stable URL for Stripe, GitHub, Telegram webhooks
- **OAuth development** — whitelist redirect URIs once, not every session
- **Automation workflows** — give n8n, Make, and Zapier a stable endpoint

## Development

```bash
pnpm install
pnpm build
pnpm dev
pnpm test
```

## Links

- Website: [liveport.dev](https://liveport.dev)
- Docs: [liveport.dev/docs](https://liveport.dev/docs)
- Blog: [liveport.dev/blog](https://liveport.dev/blog)
- Pricing: [liveport.dev/pricing](https://liveport.dev/pricing)

## License

MIT — *A [Derivative Labs](https://derivative.io) product.*
