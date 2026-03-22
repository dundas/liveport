---
title: "How to Skip ngrok's Browser Warning Page"
description: "ngrok's free tier shows a 'You are about to visit' warning page on every tunnel URL. Here's how to skip it with one header — plus when the fix doesn't work and what to do instead."
date: "2026-03-23"
author: "Derivative Labs"
---

# How to Skip ngrok's Browser Warning Page

ngrok's free tier shows a "You are about to visit" warning page on every tunnel URL. Here's how to skip it.

## The Fix

Add this request header to any HTTP request hitting your ngrok tunnel:

```
ngrok-skip-browser-warning: true
```

The value can be anything — `true`, `1`, `69`, `please` — ngrok just checks if the header exists.

### curl

```bash
curl -H "ngrok-skip-browser-warning: true" https://your-tunnel.ngrok-free.app/api/data
```

### JavaScript (fetch)

```javascript
fetch('https://your-tunnel.ngrok-free.app/api/data', {
  headers: {
    'ngrok-skip-browser-warning': 'true'
  }
})
```

### Python (requests)

```python
import requests

response = requests.get(
    'https://your-tunnel.ngrok-free.app/api/data',
    headers={'ngrok-skip-browser-warning': 'true'}
)
```

### React / Axios

```javascript
axios.get('https://your-tunnel.ngrok-free.app/api/data', {
  headers: { 'ngrok-skip-browser-warning': 'true' }
})
```

### ngrok CLI (add it to all requests automatically)

```bash
ngrok http 3000 --request-header-add "ngrok-skip-browser-warning: true"
```

This injects the header into all incoming requests — no client-side changes needed. This is the cleanest fix if you control the ngrok process.

## Why the Warning Page Exists

ngrok uses shared domains on the free tier. The warning tells visitors they're accessing a user-hosted tunnel, not an official ngrok service. It returns HTML — so if your tunnel is serving an API and the consumer expects JSON, it gets HTML instead and breaks silently.

## When the Header Fix Doesn't Work

The header workaround solves programmatic API access. It does not solve everything:

**Browsers.** If a human visits your tunnel URL in Chrome, they still see the warning page. You can install [ModHeader](https://modheader.com/) to add the header automatically, but that only fixes your browser — not your teammates' or clients'.

**Webhook providers.** Stripe, GitHub, Telegram — when they send webhooks to your tunnel URL, they don't include custom headers. The `--request-header-add` CLI flag adds headers to incoming requests, but it can't control what the webhook provider sends.

**CI/CD pipelines.** Many CI systems don't let you easily add custom headers to all outbound requests. If your pipeline hits the tunnel URL as part of a test, it may get HTML instead of your app's response.

**AI coding agents.** Claude Code, Cursor, and other AI agents that access tunnel URLs don't add the header. The agent hits the URL expecting JSON, gets HTML, and either errors out or tries to "fix" a problem that doesn't exist.

## If You Want to Avoid the Warning Page Entirely

Upgrading to ngrok's Hobbyist plan ($8/month billed annually, $10/month billed monthly) removes the warning page completely.

If you'd rather not pay for something other tools offer free, there are [several alternatives that don't have a warning page at all](/blog/best-ngrok-alternatives).
