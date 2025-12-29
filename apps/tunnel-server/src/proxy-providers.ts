import type { ProxyProviderId, ProxyTokenClaims } from "./proxy-token";

export interface UpstreamProxyConfig {
  host: string;
  port: number;
  authHeader: string;
}

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf-8").toString("base64")}`;
}

function normalizeCity(city: string): string {
  return city.trim().replace(/\s+/g, "_");
}

function buildOxylabsUsername(baseUsername: string, options?: Record<string, unknown>): string {
  const customerPrefix = options?.customerPrefix;
  const customer = typeof customerPrefix === "string" && customerPrefix.trim().length > 0 ? customerPrefix.trim() : "customer";

  const segments: string[] = [`${customer}-${baseUsername}`];

  const country = options?.country;
  if (typeof country === "string" && country.trim().length > 0) {
    segments.push(`cc-${country.trim()}`);
  }

  const state = options?.state;
  if (typeof state === "string" && state.trim().length > 0) {
    segments.push(`st-${state.trim()}`);
  }

  const city = options?.city;
  if (typeof city === "string" && city.trim().length > 0) {
    segments.push(`city-${normalizeCity(city)}`);
  }

  const sessid = options?.sessionId;
  if (typeof sessid === "string" && sessid.trim().length > 0) {
    segments.push(`sessid-${sessid.trim()}`);
  }

  const sesstime = options?.sessionTimeMinutes;
  if (typeof sesstime === "number" && Number.isFinite(sesstime) && sesstime > 0) {
    segments.push(`sesstime-${Math.floor(sesstime)}`);
  }

  const raw = options?.rawSuffix;
  if (typeof raw === "string" && raw.trim().length > 0) {
    const cleaned = raw.trim().replace(/^[-]+/, "");
    if (cleaned.length > 0) {
      segments.push(cleaned);
    }
  }

  return segments.join("-");
}

function getEnvOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`${name} is not configured`);
  }
  return v;
}

export function resolveUpstreamProxyFromClaims(claims: ProxyTokenClaims): UpstreamProxyConfig {
  if (claims.provider === "oxylabs") {
    const proxyHost = process.env.OXYLABS_PROXY_HOST || "pr.oxylabs.io";
    const proxyPort = parseInt(process.env.OXYLABS_PROXY_PORT || "7777", 10);

    const baseUsername = getEnvOrThrow("OXYLABS_USERNAME");
    const password = getEnvOrThrow("OXYLABS_PASSWORD");

    const username = buildOxylabsUsername(baseUsername, claims.providerOptions);

    return {
      host: proxyHost,
      port: proxyPort,
      authHeader: basicAuthHeader(username, password),
    };
  }

  if (claims.provider === "custom") {
    const server = claims.providerOptions?.server;
    if (typeof server !== "string" || server.trim().length === 0) {
      throw new Error("custom provider requires providerOptions.server");
    }

    const url = new URL(server);
    const host = url.hostname;
    const port = url.port ? parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80;

    const username = process.env.CUSTOM_PROXY_USERNAME || "";
    const password = process.env.CUSTOM_PROXY_PASSWORD || "";
    const authHeader = username || password ? basicAuthHeader(username, password) : "";

    return { host, port, authHeader };
  }

  throw new Error(`Unsupported provider: ${String(claims.provider)}`);
}
