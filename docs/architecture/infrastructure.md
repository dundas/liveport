# Cloud Infrastructure Architecture

## Overview

LivePort utilizes a hybrid architecture leveraging **Cloudflare** for edge security/performance and **Fly.io** for compute/tunneling. This "Option 1" approach minimizes costs while maximizing performance and security.

## Architecture Diagram

```mermaid
graph TD
    User[User / Agent] -->|HTTPS| CF[Cloudflare Edge]
    CF -->|Optimized| Fly[Fly.io Region]
    
    subgraph Cloudflare
        DNS[DNS]
        SSL[SSL Termination]
        WAF[WAF & DDoS]
        Cache[Caching]
    end
    
    subgraph Fly.io
        LB[Load Balancer]
        Tunnel[Tunnel Server (Node.js)]
        API[API Server (Next.js/Node)]
        DB[(PostgreSQL)]
        Redis[(Redis)]
    end
    
    Tunnel <-->|WebSocket| Dev[Developer Localhost]
```

## Components

### 1. Cloudflare (Edge Layer)
*   **DNS**: Manages `liveport.dev` and `*.liveport.dev`.
*   **SSL**: Handles wildcard certificate termination.
*   **DDoS Protection**: Protects public tunnel endpoints from abuse.
*   **Caching**: Caches repetitive agent requests to reduce origin load.
*   **WAF**: Blocks malicious traffic patterns.

### 2. Fly.io (Compute Layer)
*   **Tunnel Server**:
    *   Node.js WebSocket server.
    *   Handles multiplexing requests to localhost.
    *   Scales horizontally across regions (e.g., `ord`, `iad`, `lhr`).
*   **API / Dashboard**:
    *   Next.js application.
    *   Handles auth, key management, and billing.
*   **Database**:
    *   Managed PostgreSQL (via mech-storage).
    *   Stores users, keys, and usage metrics.

## Configuration Details

### DNS Records
*   `api.liveport.dev` -> CNAME `liveport-api.fly.dev` (Proxied)
*   `*.liveport.dev` -> CNAME `liveport-tunnel.fly.dev` (Proxied)

### Security Settings
*   **SSL/TLS**: Full (Strict) mode.
*   **WAF**: OWASP Core Ruleset enabled.
*   **Rate Limiting**: 100 req/sec per IP at Cloudflare edge.

## Scaling Strategy
1.  **MVP**: Single Fly.io region (`ord` - Chicago).
2.  **Growth**: Add regions (`lhr`, `sin`) based on user latency.
3.  **Enterprise**: Dedicated Fly.io organizations or private clusters.

