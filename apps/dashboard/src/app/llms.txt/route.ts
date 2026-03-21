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
`;

export function GET() {
  return new Response(LLMS_TXT, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
