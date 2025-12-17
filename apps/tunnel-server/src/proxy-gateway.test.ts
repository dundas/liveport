import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "node:http";
import net from "node:net";

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const keyValidator = {
  validate: vi.fn(),
};

const verifyProxyToken = vi.fn();
const resolveUpstreamProxyFromClaims = vi.fn();

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf-8").toString("base64")}`;
}

async function listenServer(server: http.Server | net.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind test server");
  }
  return address.port;
}

async function loadProxyGatewayModule(env?: {
  PROXY_ALLOWED_HOSTS?: string;
  PROXY_ALLOWED_DOMAINS?: string;
}) {
  vi.resetModules();

  if (env?.PROXY_ALLOWED_HOSTS !== undefined) {
    process.env.PROXY_ALLOWED_HOSTS = env.PROXY_ALLOWED_HOSTS;
  } else {
    delete process.env.PROXY_ALLOWED_HOSTS;
  }

  if (env?.PROXY_ALLOWED_DOMAINS !== undefined) {
    process.env.PROXY_ALLOWED_DOMAINS = env.PROXY_ALLOWED_DOMAINS;
  } else {
    delete process.env.PROXY_ALLOWED_DOMAINS;
  }

  vi.doMock("@liveport/shared/logging", () => ({
    createLogger: vi.fn(() => logger),
  }));

  vi.doMock("./key-validator", () => ({
    getKeyValidator: vi.fn(() => keyValidator),
  }));

  vi.doMock("./proxy-token", () => ({
    verifyProxyToken,
  }));

  vi.doMock("./proxy-providers", () => ({
    resolveUpstreamProxyFromClaims,
  }));

  return await import("./proxy-gateway");
}

async function startGatewayServer(params: {
  cfg: { enabled: boolean; tokenSecret: string; requestTimeoutMs: number };
  delegateStatusCode?: number;
}) {
  const { createProxyRequestInterceptor, createProxyConnectHandler } = await loadProxyGatewayModule();

  const interceptor = createProxyRequestInterceptor(params.cfg);
  const connectHandler = createProxyConnectHandler(params.cfg);

  const delegateStatus = params.delegateStatusCode ?? 404;

  const server = http.createServer(async (req, res) => {
    await interceptor(req, res, async (_req, _res) => {
      _res.writeHead(delegateStatus, { "Content-Type": "text/plain" });
      _res.end("delegate");
    });
  });

  server.on("connect", (req, clientSocket, head) => {
    void connectHandler(req, clientSocket, head);
  });

  const port = await listenServer(server);
  return { server, port };
}

describe("Proxy Gateway", () => {
  const cfg = {
    enabled: true,
    tokenSecret: "test-secret",
    requestTimeoutMs: 5000,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    keyValidator.validate.mockResolvedValue({
      valid: true,
      keyId: "key-1",
      userId: "user-1",
    });

    verifyProxyToken.mockResolvedValue({
      valid: true,
      claims: {
        keyId: "key-1",
        userId: "user-1",
        iat: Date.now(),
        exp: Date.now() + 60_000,
        provider: "custom",
        providerOptions: {},
      },
    });
  });

  afterEach(() => {
    delete process.env.PROXY_ALLOWED_HOSTS;
    delete process.env.PROXY_ALLOWED_DOMAINS;
  });

  it("should require Proxy-Authorization for HTTP proxy requests", async () => {
    const upstream = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    });
    const upstreamPort = await listenServer(upstream);

    resolveUpstreamProxyFromClaims.mockReturnValue({
      host: "127.0.0.1",
      port: upstreamPort,
    });

    const { server, port } = await startGatewayServer({ cfg });

    const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          method: "GET",
          path: "http://example.com/",
        },
        (res) => {
          let data = "";
          res.setEncoding("utf-8");
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => resolve({ statusCode: res.statusCode || 0, body: data }));
        }
      );
      req.on("error", reject);
      req.end();
    });

    expect(response.statusCode).toBe(407);

    server.close();
    upstream.close();
  });

  it("should proxy HTTP requests and emit proxy_usage log", async () => {
    const upstream = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    });
    const upstreamPort = await listenServer(upstream);

    resolveUpstreamProxyFromClaims.mockReturnValue({
      host: "127.0.0.1",
      port: upstreamPort,
    });

    const { server, port } = await startGatewayServer({ cfg });

    const bridgeKey = "lpk_test123";
    const token = "tok_test";

    const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          method: "GET",
          path: "http://example.com/test",
          headers: {
            "Proxy-Authorization": basicAuthHeader(bridgeKey, token),
          },
        },
        (res) => {
          let data = "";
          res.setEncoding("utf-8");
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => resolve({ statusCode: res.statusCode || 0, body: data }));
        }
      );
      req.on("error", reject);
      req.end();
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("ok");

    const usageCalls = logger.info.mock.calls.filter((c) => c[1] === "proxy_usage");
    expect(usageCalls.length).toBeGreaterThan(0);
    expect(usageCalls[0][0]).toMatchObject({
      kind: "http",
      keyId: "key-1",
      userId: "user-1",
      provider: "custom",
      targetHost: "example.com",
    });

    server.close();
    upstream.close();
  });

  it("should enforce allowlist for HTTP proxy requests", async () => {
    const upstream = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    });
    const upstreamPort = await listenServer(upstream);

    resolveUpstreamProxyFromClaims.mockReturnValue({
      host: "127.0.0.1",
      port: upstreamPort,
    });

    const { createProxyRequestInterceptor } = await loadProxyGatewayModule({
      PROXY_ALLOWED_HOSTS: "allowed.com",
    });

    const interceptor = createProxyRequestInterceptor(cfg);

    const server = http.createServer(async (req, res) => {
      await interceptor(req, res, async (_req, _res) => {
        _res.writeHead(404);
        _res.end();
      });
    });

    const port = await listenServer(server);

    const bridgeKey = "lpk_test123";
    const token = "tok_test";

    const response = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          method: "GET",
          path: "http://blocked.com/",
          headers: {
            "Proxy-Authorization": basicAuthHeader(bridgeKey, token),
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode || 0));
        }
      );
      req.on("error", reject);
      req.end();
    });

    expect(response).toBe(403);

    const usageCalls = logger.info.mock.calls.filter((c) => c[1] === "proxy_usage");
    expect(usageCalls.length).toBe(0);

    server.close();
    upstream.close();
  });

  it("should enforce allowlist for CONNECT", async () => {
    const upstreamProxy = net.createServer((socket) => {
      socket.on("data", () => {
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      });
    });
    const upstreamPort = await listenServer(upstreamProxy);

    resolveUpstreamProxyFromClaims.mockReturnValue({
      host: "127.0.0.1",
      port: upstreamPort,
    });

    const { createProxyConnectHandler } = await loadProxyGatewayModule({
      PROXY_ALLOWED_HOSTS: "allowed.com:443",
    });

    const connectHandler = createProxyConnectHandler(cfg);

    const server = http.createServer();
    server.on("connect", (req, clientSocket, head) => {
      void connectHandler(req, clientSocket, head);
    });

    const port = await listenServer(server);

    const bridgeKey = "lpk_test123";
    const token = "tok_test";

    const statusLine = await new Promise<string>((resolve, reject) => {
      const socket = net.connect({ host: "127.0.0.1", port }, () => {
        socket.write(
          `CONNECT blocked.com:443 HTTP/1.1\r\nHost: blocked.com:443\r\nProxy-Authorization: ${basicAuthHeader(
            bridgeKey,
            token
          )}\r\n\r\n`
        );
      });

      socket.on("data", (chunk) => {
        const firstLine = chunk.toString("utf-8").split("\r\n")[0] || "";
        socket.destroy();
        resolve(firstLine);
      });
      socket.on("error", reject);
    });

    expect(statusLine).toContain("403");

    server.close();
    upstreamProxy.close();
  });

  it("should establish CONNECT tunnel and emit proxy_usage log", async () => {
    const upstreamProxy = net.createServer((socket) => {
      let didHandshake = false;
      socket.on("data", (chunk) => {
        if (!didHandshake) {
          didHandshake = true;
          socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          return;
        }
        // Echo payload
        socket.write(chunk);
      });
    });
    const upstreamPort = await listenServer(upstreamProxy);

    resolveUpstreamProxyFromClaims.mockReturnValue({
      host: "127.0.0.1",
      port: upstreamPort,
    });

    const { server, port } = await startGatewayServer({ cfg });

    const bridgeKey = "lpk_test123";
    const token = "tok_test";

    const echoed = await new Promise<string>((resolve, reject) => {
      const socket = net.connect({ host: "127.0.0.1", port }, () => {
        socket.write(
          `CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\nProxy-Authorization: ${basicAuthHeader(
            bridgeKey,
            token
          )}\r\n\r\n`
        );
      });

      let buffer = Buffer.alloc(0);
      let established = false;

      socket.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);

        if (!established) {
          const idx = buffer.indexOf("\r\n\r\n");
          if (idx === -1) return;
          established = true;
          buffer = buffer.slice(idx + 4);

          socket.write("ping");
          return;
        }

        const text = buffer.toString("utf-8");
        if (text.includes("ping")) {
          socket.end();
          resolve("ping");
        }
      });

      socket.on("error", reject);
    });

    expect(echoed).toBe("ping");

    // allow close handlers to run
    await new Promise((r) => setTimeout(r, 0));

    const usageCalls = logger.info.mock.calls.filter((c) => c[1] === "proxy_usage");
    expect(usageCalls.length).toBeGreaterThan(0);
    expect(usageCalls.some((c) => c[0]?.kind === "connect" && c[0]?.targetHost === "example.com")).toBe(true);

    server.close();
    upstreamProxy.close();
  });
});
