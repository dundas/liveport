# Changelog

All notable changes to LivePort will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `@liveport/mcp` MCP server with 5 tools: `liveport_connect`, `liveport_list_tunnels`, `liveport_get_tunnel_url`, `liveport_disconnect`, `liveport_status` (PR #31, 2026-03-14)
- PostHog analytics to LivePort dashboard with `$pageview` and `$identify` events (PR #30, 2026-03-14)

### Fixed
- Normalize `MECH_APPS_URL` `/api` suffix in `MechStorageClient` constructor — fixes production 500 errors on all bridge key and tunnel API routes caused by double `/api` prefix (PR #32, 2026-03-14)
- Fix error field parsing in agent-sdk — API returns `{error, code}` but SDK read `error.message` (undefined); now uses `error.message ?? error.error ?? "Request failed"` (PR #32, 2026-03-14)
- Fix stale default URL in dashboard db.ts (`mech-apps.fly.dev` → `storage.mechdna.net`) (PR #32, 2026-03-14)
- Trim `NEXT_PUBLIC_POSTHOG_KEY` to remove trailing newline added by Vercel env CLI (PR #30, 2026-03-14)

### Changed
- `/api` suffix stripping moved into `MechStorageClient` constructor — all consumers safe by default (PR #32, 2026-03-14)
- Update `.env.example` Redis URL to `rediss://` (TLS) for Upstash compatibility (PR #32, 2026-03-14)
- Set Node.js 22.x for Vercel build (PR #29, 2026-03-14)

### Changed - WebSocket Raw Byte Piping Refactor (PRD-005)

#### Overview
Refactored WebSocket implementation to use raw byte piping instead of parsing WebSocket frames. This eliminates "RSV1 must be clear" errors and improves performance by avoiding frame parsing overhead.

#### Technical Details

**Tunnel Server Changes**:
- Access underlying TCP socket (`(ws as any)._socket`) for raw byte access
- Relay raw bytes via `socket.on("data")` instead of `ws.on("message")`
- Send `WebSocketDataMessage` instead of `WebSocketFrameMessage`
- Base64-encode raw bytes for binary-safe JSON transmission
- Preserve all WebSocket frame metadata (RSV bits, masking keys, extension data)

**CLI Changes**:
- Create TCP connection with `net.connect()` for WebSocket upgrade handshake
- Manually construct HTTP upgrade request and parse 101 response
- Relay raw bytes from local server via `socket.on("data")`
- Decode base64-encoded raw bytes and write to TCP socket
- Remove WebSocket frame parsing logic

**Message Type Changes**:
- Added `websocket_data` message type for raw byte relay
- `websocket_frame` message type deprecated (kept for backwards compatibility)
- Raw bytes are base64-encoded in `WebSocketDataMessage.payload.data`

#### Benefits
- ✅ Eliminates "RSV1 must be clear" errors
- ✅ Preserves all WebSocket frame metadata (RSV bits, masking, extensions)
- ✅ Improved performance (no frame parsing overhead)
- ✅ Simpler codebase (direct byte piping)
- ✅ Better error handling (raw TCP socket errors visible)

#### Backwards Compatibility
- `websocket_frame` handler kept for backwards compatibility
- `handleFrame()` method marked as deprecated
- No breaking changes for existing users
- Both message types coexist during transition period

#### Testing
- 30 unit tests for tunnel-server raw byte piping (websocket-proxy.test.ts)
- 34 unit tests for CLI TCP connection handling (websocket-handler.test.ts)
- 5 integration tests for end-to-end WebSocket flow (test-websocket-integration.mjs)
- Updated existing integration tests to expect `websocket_data` messages
- All 179 tests passing

#### Files Changed
- `apps/tunnel-server/src/types.ts` - Added `WebSocketDataMessage` type
- `apps/tunnel-server/src/websocket-proxy.ts` - Raw byte piping implementation
- `apps/tunnel-server/src/websocket-handler.ts` - Added `websocket_data` handler
- `packages/cli/src/types.ts` - Added `WebSocketDataMessage` type
- `packages/cli/src/websocket-handler.ts` - TCP connection + raw byte relay
- `packages/cli/src/tunnel-client.ts` - Added `websocket_data` case handler
- `apps/tunnel-server/src/websocket-proxy.test.ts` - NEW: Unit tests
- `packages/cli/src/websocket-handler.test.ts` - NEW: Unit tests
- `test-websocket-integration.mjs` - NEW: Integration test suite
- `run-integration-tests.sh` - NEW: Integration test runner

#### Migration Notes
No migration required for existing users. The refactor is backwards compatible and transparent to end users.

#### Related
- PRD: `tasks/prd-005-refactor-websocket-raw-byte-piping.md`
- Gap Analysis: `tasks/005-gap-analysis-websocket-raw-byte-piping.md`
- Task List: `tasks/tasks-005-prd-websocket-raw-byte-piping.md`

---

## [0.1.0] - 2024-XX-XX

Initial release (coming soon)

[Unreleased]: https://github.com/your-org/liveport/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/your-org/liveport/releases/tag/v0.1.0
