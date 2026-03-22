---
title: "The Free ngrok Alternative With a Persistent URL"
description: "ngrok charges $8/month for a static URL. LivePort gives you one free, assigned on signup. Here's why that matters."
date: "2026-03-23"
author: "Derivative Labs"
---

Every developer who's used ngrok has hit the same wall: you configure a webhook, share a URL with a teammate, or wire up an OAuth callback — and then your laptop closes. The URL dies. You repeat the whole setup.

ngrok's free tier gives you a random URL that changes every time you restart. Want it to stay the same? That's $8/month.

## We built the alternative

LivePort gives every free user one persistent subdomain on signup. You don't choose it — it's assigned automatically. It's yours forever.

Sign up, get `https://abc123.liveport.dev`. Reconnect any time, same URL.

## Who needs this

**Webhook testing** — Configure your Stripe or GitHub webhook endpoint once. Stop reconfiguring it every dev session.

**OAuth development** — Whitelist your redirect URI once. It stays valid.

**Bot development** — Set your Telegram or WhatsApp webhook once. Run `liveport connect 3000` and it just works.

**Automation workflows** — n8n, Make, Zapier — configure the endpoint once, not every time you boot your laptop.

**Sharing with teammates** — Send the URL in Slack. It's still valid tomorrow.

## How it compares

| Tool | Free Static URL | Setup |
|------|----------------|-------|
| ngrok | No ($8/mo) | Install + auth token |
| Cloudflare Tunnel | Yes, but... | Own domain + 30 min config |
| Tailscale Funnel | Yes, but... | Full VPN setup |
| LivePort | **Yes** | Sign up, done |

## The AI agent angle

LivePort was built for AI coding agents — Claude Code, Cursor, OpenClaw. When an agent spins up a dev server, it needs a public URL to test against. With a persistent subdomain, agents don't have to re-discover where things live each session.

The [Agent SDK](/docs), [MCP server](https://www.npmjs.com/package/@liveport/mcp), and [Bridge Keys](/docs) are all still here. The persistent URL is just the thing that gets you in the door.

## Get started

```bash
npx @liveport/cli connect 3000
```

[Sign up at liveport.dev](https://liveport.dev/signup) — your persistent subdomain is waiting.
