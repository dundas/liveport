# LivePort Agent SDK Examples

This directory contains practical examples demonstrating different use cases for the LivePort Agent SDK.

## Running the Examples

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Set your bridge key:**
   ```bash
   export LIVEPORT_KEY=lpk_your_bridge_key_here
   ```

3. **Start a local tunnel:**
   ```bash
   # In a separate terminal
   liveport connect 3000
   ```

4. **Run an example:**
   ```bash
   npx tsx examples/01-basic-usage.ts
   ```

## Examples Overview

### `01-basic-usage.ts`
**Simplest example** showing how to wait for a tunnel and make a request.

**Use case:** Quick start, proof of concept

**Key concepts:**
- Creating an agent instance
- Waiting for tunnel
- Making HTTP requests
- Basic error handling

---

### `02-testing-integration.ts`
**Testing framework integration** using Vitest (works with Jest too).

**Use case:** Automated testing, CI/CD pipelines

**Key concepts:**
- beforeAll/afterAll hooks
- Multiple test cases
- Sharing tunnel across tests
- Timeout configuration

---

### `03-ai-agent-workflow.ts`
**Complete AI agent workflow** that discovers, tests, and analyzes endpoints.

**Use case:** AI-powered testing, endpoint discovery, performance analysis

**Key concepts:**
- Endpoint discovery
- Performance measurement
- Result analysis
- AI recommendations

---

### `04-multiple-tunnels.ts`
**Working with multiple tunnels** for microservices testing.

**Use case:** Multi-service architectures, microservices

**Key concepts:**
- Listing all tunnels
- Finding tunnels by port
- Testing multiple services
- Service-specific logic

---

### `05-error-handling.ts`
**Comprehensive error handling** patterns and best practices.

**Use case:** Production applications, robust error handling

**Key concepts:**
- Specific error types
- User-friendly error messages
- Retry logic
- Cleanup and recovery

---

## Common Patterns

### Pattern 1: Wait with Timeout

```typescript
const agent = new LivePortAgent({ key: "lpk_..." });

try {
  const tunnel = await agent.waitForTunnel({ timeout: 60000 });
  // Use tunnel.url
} catch (error) {
  if (error instanceof TunnelTimeoutError) {
    console.log("No tunnel available");
  }
}
```

### Pattern 2: Test Suite Integration

```typescript
let tunnelUrl: string;

beforeAll(async () => {
  const agent = new LivePortAgent({ key: process.env.LIVEPORT_KEY! });
  const tunnel = await agent.waitForTunnel();
  tunnelUrl = tunnel.url;
});

test("API test", async () => {
  const response = await fetch(`${tunnelUrl}/api/endpoint`);
  // assertions...
});
```

### Pattern 3: Multiple Services

```typescript
const agent = new LivePortAgent({ key: "lpk_..." });
const tunnels = await agent.listTunnels();

const apiTunnel = tunnels.find(t => t.localPort === 3000);
const webTunnel = tunnels.find(t => t.localPort === 3001);

// Test API
await fetch(`${apiTunnel.url}/health`);

// Test Web
await fetch(`${webTunnel.url}/`);
```

## Tips

1. **Always set a timeout** - Use reasonable timeouts to avoid hanging indefinitely
2. **Handle errors gracefully** - Provide helpful error messages for users
3. **Clean up resources** - Always call `agent.disconnect()` in finally blocks
4. **Use environment variables** - Never hardcode bridge keys
5. **Add retry logic** - Network requests can fail, especially in CI/CD

## Environment Variables

All examples support these environment variables:

- `LIVEPORT_KEY` - Your bridge key (required)
- `LIVEPORT_API_URL` - Custom API URL (optional)

## Next Steps

After trying these examples, check out:

- [API Documentation](../README.md)
- [CLI Documentation](../../cli/README.md)
- [Dashboard](https://liveport.dev/dashboard)

## Need Help?

- 📚 [Full Documentation](https://liveport.dev/docs)
- 🐛 [Report Issues](https://github.com/dundas/liveport/issues)
- 💬 [Community Support](https://liveport.dev/support)
