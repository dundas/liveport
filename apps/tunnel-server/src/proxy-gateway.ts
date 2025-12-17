import type { IncomingMessage, ServerResponse } from "node:http";
import http from "node:http";
import type { Socket } from "node:net";
import net from "node:net";
import { getKeyValidator } from "./key-validator";
import { verifyProxyToken, type ProxyTokenClaims } from "./proxy-token";
import { resolveUpstreamProxyFromClaims } from "./proxy-providers";

export interface ProxyGatewayConfig {
  enabled: boolean;
  tokenSecret: string;
  requestTimeoutMs: number;
}

function isAbsoluteUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://");
}

function send407(res: ServerResponse): void {
  res.writeHead(407, {
    "Proxy-Authenticate": 'Basic realm="LivePort"',
    "Content-Type": "text/plain",
  });
  res.end("Proxy Authentication Required");
}

function send502(res: ServerResponse, message: string): void {
  res.writeHead(502, { "Content-Type": "text/plain" });
  res.end(message);
}

function sendConnectResponse(socket: Socket, statusLine: string, extraHeaders?: Record<string, string>): void {
  const headers: string[] = [];
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      headers.push(`${k}: ${v}`);
    }
  }
  socket.write(`${statusLine}\r\n${headers.join("\r\n")}${headers.length ? "\r\n" : ""}\r\n`);
}

function parseBasicAuth(value: string): { username: string; password: string } | null {
  const match = value.match(/^Basic\s+(.+)$/i);
  if (!match) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf-8");
  } catch {
    return null;
  }
  const idx = decoded.indexOf(":");
  if (idx <= 0) return null;
  return {
    username: decoded.slice(0, idx),
    password: decoded.slice(idx + 1),
  };
}

async function authenticate(
  req: IncomingMessage,
  cfg: ProxyGatewayConfig
): Promise<
  | {
      ok: true;
      bridgeKey: string;
      keyId: string;
      userId: string;
      providerClaims: ProxyTokenClaims;
    }
  | { ok: false; status: 401 | 407; message: string }
> {
  if (!cfg.enabled) {
    return { ok: false, status: 401, message: "Proxy gateway disabled" };
  }

  const authHeader = (req.headers["proxy-authorization"] || req.headers["authorization"]) as
    | string
    | string[]
    | undefined;

  const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!headerValue) {
    return { ok: false, status: 407, message: "Missing Proxy-Authorization" };
  }

  const basic = parseBasicAuth(headerValue);
  if (!basic) {
    return { ok: false, status: 407, message: "Invalid Proxy-Authorization" };
  }

  const bridgeKey = basic.username;
  const token = basic.password;

  const keyValidator = getKeyValidator();
  const validation = await keyValidator.validate(bridgeKey, 0, {
    skipPortCheck: true,
    skipUsageUpdate: true,
  });
  if (!validation.valid || !validation.keyId || !validation.userId) {
    return { ok: false, status: 407, message: validation.error || "Invalid bridge key" };
  }

  const verified = await verifyProxyToken(token, cfg.tokenSecret);
  if (!verified.valid) {
    return { ok: false, status: 407, message: verified.error };
  }

  if (verified.claims.keyId !== validation.keyId || verified.claims.userId !== validation.userId) {
    return { ok: false, status: 407, message: "Token/key mismatch" };
  }

  return {
    ok: true,
    bridgeKey,
    keyId: validation.keyId,
    userId: validation.userId,
    providerClaims: verified.claims,
  };
}

function stripHopByHopHeaders(headers: IncomingMessage["headers"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!v) continue;
    const key = k.toLowerCase();
    if (
      [
        "proxy-authorization",
        "proxy-authenticate",
        "connection",
        "keep-alive",
        "transfer-encoding",
        "upgrade",
        "te",
        "trailer",
      ].includes(key)
    ) {
      continue;
    }
    out[key] = Array.isArray(v) ? v.join(",") : v;
  }
  return out;
}

export function createProxyRequestInterceptor(cfg: ProxyGatewayConfig) {
  return async function proxyRequestInterceptor(
    req: IncomingMessage,
    res: ServerResponse,
    delegate: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  ): Promise<void> {
    if (!isAbsoluteUrl(req.url)) {
      await delegate(req, res);
      return;
    }

    const auth = await authenticate(req, cfg);
    if (!auth.ok) {
      if (auth.status === 407) {
        send407(res);
        return;
      }
      res.writeHead(auth.status, { "Content-Type": "text/plain" });
      res.end(auth.message);
      return;
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(req.url!);
    } catch {
      send502(res, "Invalid target URL");
      return;
    }

    let upstream;
    try {
      upstream = resolveUpstreamProxyFromClaims(auth.providerClaims);
    } catch (e) {
      send502(res, (e as Error).message);
      return;
    }

    const headers = stripHopByHopHeaders(req.headers);
    headers["host"] = targetUrl.host;
    if (upstream.authHeader) {
      headers["proxy-authorization"] = upstream.authHeader;
    }

    const upstreamReq = http.request(
      {
        host: upstream.host,
        port: upstream.port,
        method: req.method,
        path: targetUrl.toString(),
        headers,
        timeout: cfg.requestTimeoutMs,
      },
      (upstreamRes) => {
        const responseHeaders: Record<string, string | string[]> = {};
        for (const [k, v] of Object.entries(upstreamRes.headers)) {
          if (!v) continue;
          const key = k.toLowerCase();
          if (
            [
              "proxy-authenticate",
              "proxy-authorization",
              "connection",
              "keep-alive",
              "transfer-encoding",
              "upgrade",
              "te",
              "trailer",
            ].includes(key)
          ) {
            continue;
          }
          responseHeaders[k] = v;
        }

        res.writeHead(upstreamRes.statusCode || 502, responseHeaders);
        upstreamRes.pipe(res);
      }
    );

    upstreamReq.on("timeout", () => {
      upstreamReq.destroy(new Error("Upstream timeout"));
    });

    upstreamReq.on("error", () => {
      if (!res.headersSent) {
        send502(res, "Upstream request failed");
      }
      res.end();
    });

    req.pipe(upstreamReq);

    res.on("close", () => {
      upstreamReq.destroy();
    });
  };
}

export function createProxyConnectHandler(cfg: ProxyGatewayConfig) {
  return async function proxyConnectHandler(req: IncomingMessage, clientSocket: Socket, head: Buffer): Promise<void> {
    if (!cfg.enabled) {
      sendConnectResponse(clientSocket, "HTTP/1.1 403 Forbidden");
      clientSocket.destroy();
      return;
    }

    const auth = await authenticate(req, cfg);
    if (!auth.ok) {
      if (auth.status === 407) {
        sendConnectResponse(clientSocket, "HTTP/1.1 407 Proxy Authentication Required", {
          "Proxy-Authenticate": 'Basic realm="LivePort"',
        });
      } else {
        sendConnectResponse(clientSocket, `HTTP/1.1 ${auth.status} Unauthorized`);
      }
      clientSocket.destroy();
      return;
    }

    const target = req.url;
    if (!target) {
      sendConnectResponse(clientSocket, "HTTP/1.1 400 Bad Request");
      clientSocket.destroy();
      return;
    }

    const [host, portStr] = target.split(":");
    const port = parseInt(portStr || "443", 10);
    if (!host || !port || Number.isNaN(port)) {
      sendConnectResponse(clientSocket, "HTTP/1.1 400 Bad Request");
      clientSocket.destroy();
      return;
    }

    let upstream;
    try {
      upstream = resolveUpstreamProxyFromClaims(auth.providerClaims);
    } catch (e) {
      sendConnectResponse(clientSocket, "HTTP/1.1 502 Bad Gateway");
      clientSocket.destroy();
      return;
    }

    const upstreamSocket = net.connect({ host: upstream.host, port: upstream.port });

    const timeout = setTimeout(() => {
      upstreamSocket.destroy(new Error("Upstream timeout"));
    }, cfg.requestTimeoutMs);

    upstreamSocket.on("error", () => {
      clearTimeout(timeout);
      sendConnectResponse(clientSocket, "HTTP/1.1 502 Bad Gateway");
      clientSocket.destroy();
    });

    upstreamSocket.on("connect", () => {
      const authLine = upstream.authHeader ? `Proxy-Authorization: ${upstream.authHeader}\r\n` : "";
      upstreamSocket.write(
        `CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${authLine}Connection: keep-alive\r\n\r\n`
      );

      let buffer = Buffer.alloc(0);

      const onData = (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        const idx = buffer.indexOf("\r\n\r\n");
        if (idx === -1) return;

        upstreamSocket.off("data", onData);
        const headerPart = buffer.slice(0, idx + 4);
        const rest = buffer.slice(idx + 4);

        const statusLine = headerPart.toString("utf-8").split("\r\n")[0] || "";
        const statusMatch = statusLine.match(/HTTP\/\d\.\d\s+(\d+)/i);
        const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 0;

        if (statusCode !== 200) {
          clientSocket.write(headerPart);
          if (rest.length) clientSocket.write(rest);
          clientSocket.destroy();
          upstreamSocket.destroy();
          clearTimeout(timeout);
          return;
        }

        sendConnectResponse(clientSocket, "HTTP/1.1 200 Connection Established");

        if (head && head.length) {
          upstreamSocket.write(head);
        }
        if (rest.length) {
          clientSocket.write(rest);
        }

        clientSocket.pipe(upstreamSocket);
        upstreamSocket.pipe(clientSocket);
        clearTimeout(timeout);
      };

      upstreamSocket.on("data", onData);
    });

    clientSocket.on("error", () => {
      clearTimeout(timeout);
      upstreamSocket.destroy();
    });

    clientSocket.on("close", () => {
      clearTimeout(timeout);
      upstreamSocket.destroy();
    });
  };
}
