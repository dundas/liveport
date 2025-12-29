import { webcrypto } from "node:crypto";

export type ProxyProviderId = "oxylabs" | "custom";

export interface ProxyTokenClaims {
  keyId: string;
  userId: string;
  exp: number;
  iat: number;
  provider: ProxyProviderId;
  providerOptions?: Record<string, unknown>;
}

function base64UrlEncode(buf: Uint8Array): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (b64.length % 4)) % 4;
  const padded = b64 + "=".repeat(padLength);
  return new Uint8Array(Buffer.from(padded, "base64"));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

const hmacKeyCache = new Map<string, Promise<CryptoKey>>();

async function getHmacKey(secret: string): Promise<CryptoKey> {
  if (!hmacKeyCache.has(secret)) {
    const encoder = new TextEncoder();
    const keyPromise = webcrypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    hmacKeyCache.set(secret, keyPromise);
  }
  return hmacKeyCache.get(secret)!;
}

export async function signProxyToken(claims: ProxyTokenClaims, secret: string): Promise<string> {
  const payload = JSON.stringify(claims);
  const payloadB64 = base64UrlEncode(Buffer.from(payload, "utf-8"));
  const key = await getHmacKey(secret);
  const sig = await webcrypto.subtle.sign("HMAC", key, Buffer.from(payloadB64, "utf-8"));
  const sigB64 = base64UrlEncode(new Uint8Array(sig));
  return `${payloadB64}.${sigB64}`;
}

export async function verifyProxyToken(
  token: string,
  secret: string
): Promise<{ valid: true; claims: ProxyTokenClaims } | { valid: false; error: string }> {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, error: "Invalid token format" };
  }

  const [payloadB64, sigB64] = parts;

  let claims: ProxyTokenClaims;
  try {
    const decoded = Buffer.from(base64UrlDecode(payloadB64)).toString("utf-8");
    claims = JSON.parse(decoded) as ProxyTokenClaims;
  } catch {
    return { valid: false, error: "Invalid token payload" };
  }

  const key = await getHmacKey(secret);
  const expectedSig = await webcrypto.subtle.sign("HMAC", key, Buffer.from(payloadB64, "utf-8"));
  const providedSig = base64UrlDecode(sigB64);

  if (!constantTimeEqual(new Uint8Array(expectedSig), providedSig)) {
    return { valid: false, error: "Invalid token signature" };
  }

  if (!claims.exp || typeof claims.exp !== "number") {
    return { valid: false, error: "Token missing exp" };
  }

  if (claims.exp <= Date.now()) {
    return { valid: false, error: "Token expired" };
  }

  if (!claims.keyId || !claims.userId) {
    return { valid: false, error: "Token missing required claims" };
  }

  return { valid: true, claims };
}
