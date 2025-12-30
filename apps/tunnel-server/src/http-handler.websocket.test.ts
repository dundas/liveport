/**
 * WebSocket Integration Tests
 *
 * End-to-end tests for WebSocket upgrade handling and frame relay.
 * Tests the full flow: HTTP upgrade → WebSocket handshake → frame relay → close
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import http from "http";
import { getConnectionManager } from "./connection-manager";
import { handleWebSocketUpgradeEvent } from "./websocket-proxy";
import type { IncomingMessage } from "http";
import type { Socket } from "net";

// Mock WebSocket class for tunnel connection
class MockTunnelWebSocket {
  readyState = WebSocket.OPEN;
  OPEN = WebSocket.OPEN;
  CLOSING = WebSocket.CLOSING;
  CLOSED = WebSocket.CLOSED;
  CONNECTING = WebSocket.CONNECTING;

  send = vi.fn();
  close = vi.fn();
  on = vi.fn();
  off = vi.fn();
  terminate = vi.fn();
}

describe("WebSocket Integration Tests", () => {
  let httpServer: http.Server;
  let localWsServer: WebSocketServer;
  let serverPort: number;
  let baseDomain: string;

  beforeEach(async () => {
    baseDomain = "liveport.test";

    // Create HTTP server for testing
    httpServer = http.createServer((req, res) => {
      res.writeHead(404);
      res.end("Not Found");
    });

    // Add upgrade event handler (simulating index.ts)
    httpServer.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
      const connectionManager = getConnectionManager();
      handleWebSocketUpgradeEvent(
        req,
        socket,
        head,
        connectionManager,
        baseDomain
      );
    });

    // Start server on random port
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        serverPort = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    // Close all connections
    const connectionManager = getConnectionManager();
    const connections = connectionManager.getAll();
    for (const conn of connections) {
      connectionManager.unregister(conn.subdomain);
    }

    // Close local WebSocket server if created
    if (localWsServer) {
      await new Promise<void>((resolve) => {
        localWsServer.close(() => resolve());
      });
    }

    // Close HTTP server
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  test("should reject upgrade for invalid subdomain", async () => {
    // Create WebSocket client with invalid domain
    const ws = new WebSocket(`ws://localhost:${serverPort}/`, {
      headers: {
        host: `invalid-domain.com`,
      },
    });

    // Wait for connection to close
    await new Promise<void>((resolve, reject) => {
      ws.on("error", () => {
        // Expected - connection should be rejected
        resolve();
      });

      ws.on("close", () => {
        resolve();
      });

      ws.on("open", () => {
        reject(new Error("Connection should not open for invalid subdomain"));
      });

      // Timeout after 1 second
      setTimeout(() => {
        resolve();
      }, 1000);
    });

    expect(ws.readyState).not.toBe(WebSocket.OPEN);
  });

  test("should reject upgrade when tunnel not found", async () => {
    // Try to connect to non-existent tunnel
    const ws = new WebSocket(`ws://localhost:${serverPort}/`, {
      headers: {
        host: `nonexistent.${baseDomain}`,
      },
    });

    // Wait for connection to close
    await new Promise<void>((resolve, reject) => {
      ws.on("error", () => {
        // Expected - no tunnel exists
        resolve();
      });

      ws.on("close", () => {
        resolve();
      });

      ws.on("open", () => {
        reject(new Error("Connection should not open without tunnel"));
      });

      setTimeout(() => {
        resolve();
      }, 1000);
    });

    expect(ws.readyState).not.toBe(WebSocket.OPEN);
  });

  test("should successfully upgrade WebSocket when tunnel is active", async () => {
    const connectionManager = getConnectionManager();

    // Create mock tunnel WebSocket connection
    const mockTunnelWs = new MockTunnelWebSocket();

    // Register mock tunnel
    const subdomain = connectionManager.register(
      mockTunnelWs as any,
      "test-tunnel-1",
      "key-123",
      "user-456",
      3000,
      null
    );

    expect(subdomain).toBeTruthy();

    // Create WebSocket client to tunnel URL
    const ws = new WebSocket(`ws://localhost:${serverPort}/`, {
      headers: {
        host: `${subdomain}.${baseDomain}`,
      },
    });

    // Wait for connection to open
    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => {
        resolve();
      });

      ws.on("error", (err) => {
        reject(err);
      });

      ws.on("close", () => {
        reject(new Error("Connection closed unexpectedly"));
      });

      setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, 2000);
    });

    // Verify connection is open
    expect(ws.readyState).toBe(WebSocket.OPEN);

    // Verify WebSocket was registered
    const wsCount = connectionManager.getWebSocketCount(subdomain!);
    expect(wsCount).toBe(1);

    // Clean up
    ws.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  test("should relay text frames from public client to CLI", async () => {
    const connectionManager = getConnectionManager();

    // Create mock tunnel WebSocket
    const sentMessages: any[] = [];
    const mockTunnelWs = new MockTunnelWebSocket();
    mockTunnelWs.send = vi.fn((data: string) => {
      sentMessages.push(JSON.parse(data));
    });

    // Register tunnel
    const subdomain = connectionManager.register(
      mockTunnelWs as any,
      "test-tunnel-2",
      "key-123",
      "user-456",
      3000,
      null
    );

    // Connect public WebSocket client
    const ws = new WebSocket(`ws://localhost:${serverPort}/`, {
      headers: {
        host: `${subdomain}.${baseDomain}`,
      },
    });

    await new Promise<void>((resolve) => {
      ws.on("open", () => resolve());
    });

    // Send text message
    ws.send("Hello, WebSocket!");

    // Wait for message to be relayed
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify raw bytes were relayed to CLI via websocket_data message
    const dataMessages = sentMessages.filter((msg) => msg.type === "websocket_data");
    expect(dataMessages.length).toBeGreaterThan(0);

    const dataMessage = dataMessages[0];
    expect(dataMessage.type).toBe("websocket_data");
    expect(dataMessage.payload.data).toBeDefined(); // Base64-encoded raw bytes
    expect(dataMessage.id).toContain(subdomain);

    // Clean up
    ws.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  test("should relay binary frames from public client to CLI", async () => {
    const connectionManager = getConnectionManager();

    // Create mock tunnel WebSocket
    const sentMessages: any[] = [];
    const mockTunnelWs = new MockTunnelWebSocket();
    mockTunnelWs.send = vi.fn((data: string) => {
      sentMessages.push(JSON.parse(data));
    });

    // Register tunnel
    const subdomain = connectionManager.register(
      mockTunnelWs as any,
      "test-tunnel-3",
      "key-123",
      "user-456",
      3000,
      null
    );

    // Connect public WebSocket client
    const ws = new WebSocket(`ws://localhost:${serverPort}/`, {
      headers: {
        host: `${subdomain}.${baseDomain}`,
      },
    });

    await new Promise<void>((resolve) => {
      ws.on("open", () => resolve());
    });

    // Send binary message
    const binaryData = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    ws.send(binaryData);

    // Wait for message to be relayed
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify raw bytes were relayed to CLI via websocket_data message
    const dataMessages = sentMessages.filter((msg) => msg.type === "websocket_data");
    expect(dataMessages.length).toBeGreaterThan(0);

    const dataMessage = dataMessages[0];
    expect(dataMessage.type).toBe("websocket_data");
    expect(dataMessage.payload.data).toBeDefined(); // Base64-encoded raw bytes

    // Note: In raw byte piping mode, we relay the entire WebSocket frame
    // including opcode byte, so we don't decode and compare the payload directly

    // Clean up
    ws.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  test("should relay frames from CLI to public client", async () => {
    const connectionManager = getConnectionManager();

    // Create mock tunnel WebSocket
    const mockTunnelWs = new MockTunnelWebSocket();

    // Register tunnel
    const subdomain = connectionManager.register(
      mockTunnelWs as any,
      "test-tunnel-4",
      "key-123",
      "user-456",
      3000,
      null
    );

    // Connect public WebSocket client
    const ws = new WebSocket(`ws://localhost:${serverPort}/`, {
      headers: {
        host: `${subdomain}.${baseDomain}`,
      },
    });

    await new Promise<void>((resolve) => {
      ws.on("open", () => resolve());
    });

    // Get the WebSocket ID that was registered
    const proxiedWsConnections = (connectionManager as any).proxiedWebSockets;
    const wsId = Array.from(proxiedWsConnections.keys())[0];

    // Simulate CLI sending frame to public client
    const receivedMessages: string[] = [];
    ws.on("message", (data) => {
      receivedMessages.push(data.toString());
    });

    // Simulate frame from CLI (server → client)
    const publicWs = proxiedWsConnections.get(wsId)?.publicSocket;
    expect(publicWs).toBeDefined();

    // Send text frame directly to public WebSocket (simulating CLI relay)
    publicWs.send("Response from server");

    // Wait for message to be received
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify message was received by public client
    expect(receivedMessages).toContain("Response from server");

    // Clean up
    ws.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  test("should handle public client close and notify CLI", async () => {
    const connectionManager = getConnectionManager();

    // Create mock tunnel WebSocket
    const sentMessages: any[] = [];
    const mockTunnelWs = new MockTunnelWebSocket();
    mockTunnelWs.send = vi.fn((data: string) => {
      sentMessages.push(JSON.parse(data));
    });

    // Register tunnel
    const subdomain = connectionManager.register(
      mockTunnelWs as any,
      "test-tunnel-5",
      "key-123",
      "user-456",
      3000,
      null
    );

    // Connect public WebSocket client
    const ws = new WebSocket(`ws://localhost:${serverPort}/`, {
      headers: {
        host: `${subdomain}.${baseDomain}`,
      },
    });

    await new Promise<void>((resolve) => {
      ws.on("open", () => resolve());
    });

    // Verify WebSocket is registered
    expect(connectionManager.getWebSocketCount(subdomain!)).toBe(1);

    // Close public WebSocket
    ws.close(1000, "Client closing");

    // Wait for close to be processed
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify close message was sent to CLI
    const closeMessages = sentMessages.filter((msg) => msg.type === "websocket_close");
    expect(closeMessages.length).toBe(1);

    const closeMsg = closeMessages[0];
    expect(closeMsg.type).toBe("websocket_close");
    expect(closeMsg.payload.code).toBe(1000);
    expect(closeMsg.payload.reason).toBe("Client closing");
    expect(closeMsg.payload.initiator).toBe("client");

    // Verify WebSocket was unregistered
    expect(connectionManager.getWebSocketCount(subdomain!)).toBe(0);
  });

  test("should track bytes transferred for frames", async () => {
    const connectionManager = getConnectionManager();

    // Create mock tunnel WebSocket
    const mockTunnelWs = new MockTunnelWebSocket();

    // Register tunnel
    const subdomain = connectionManager.register(
      mockTunnelWs as any,
      "test-tunnel-6",
      "key-123",
      "user-456",
      3000,
      null
    );

    // Get initial bytes transferred
    const connection = connectionManager.findBySubdomain(subdomain!);
    const initialBytes = connection?.bytesTransferred || 0;

    // Connect public WebSocket client
    const ws = new WebSocket(`ws://localhost:${serverPort}/`, {
      headers: {
        host: `${subdomain}.${baseDomain}`,
      },
    });

    await new Promise<void>((resolve) => {
      ws.on("open", () => resolve());
    });

    // Send message
    const testMessage = "Test message for byte tracking";
    ws.send(testMessage);

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify bytes were tracked
    const updatedConnection = connectionManager.findBySubdomain(subdomain!);
    const finalBytes = updatedConnection?.bytesTransferred || 0;

    expect(finalBytes).toBeGreaterThan(initialBytes);
    expect(finalBytes - initialBytes).toBeGreaterThanOrEqual(testMessage.length);

    // Clean up
    ws.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  test("should reject connection when limit exceeded", async () => {
    const connectionManager = getConnectionManager();

    // Create mock tunnel WebSocket
    const mockTunnelWs = new MockTunnelWebSocket();

    // Register tunnel
    const subdomain = connectionManager.register(
      mockTunnelWs as any,
      "test-tunnel-7",
      "key-123",
      "user-456",
      3000,
      null
    );

    // Create 100 WebSocket connections (the limit)
    const connections: WebSocket[] = [];
    for (let i = 0; i < 100; i++) {
      const ws = new WebSocket(`ws://localhost:${serverPort}/`, {
        headers: {
          host: `${subdomain}.${baseDomain}`,
        },
      });
      connections.push(ws);
      await new Promise<void>((resolve) => {
        ws.on("open", () => resolve());
        ws.on("error", () => resolve()); // Ignore errors for limit test
      });
    }

    // Verify count is 100
    expect(connectionManager.getWebSocketCount(subdomain!)).toBe(100);

    // Try to create 101st connection
    const ws101 = new WebSocket(`ws://localhost:${serverPort}/`, {
      headers: {
        host: `${subdomain}.${baseDomain}`,
      },
    });

    // Wait for connection attempt
    await new Promise<void>((resolve, reject) => {
      ws101.on("open", () => {
        reject(new Error("101st connection should not open"));
      });

      ws101.on("error", () => {
        resolve(); // Expected - should be rejected
      });

      ws101.on("close", () => {
        resolve();
      });

      setTimeout(() => {
        resolve();
      }, 1000);
    });

    // Verify 101st connection did not open
    expect(ws101.readyState).not.toBe(WebSocket.OPEN);

    // Verify count is still 100
    expect(connectionManager.getWebSocketCount(subdomain!)).toBe(100);

    // Clean up all connections
    for (const ws of connections) {
      ws.close();
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
});
