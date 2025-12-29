/**
 * Secret Validation Utilities for Tunnel Server
 *
 * Validates required secrets at startup to fail fast if misconfigured.
 */

/**
 * Validate that INTERNAL_API_SECRET is properly configured
 * Should be called early in server initialization
 */
export function validateInternalApiSecret(): void {
  const secret = process.env.INTERNAL_API_SECRET;

  if (!secret) {
    throw new Error(
      'INTERNAL_API_SECRET must be set in environment variables. ' +
      'Generate with: openssl rand -hex 32'
    );
  }

  if (secret.length < 32) {
    throw new Error(
      `INTERNAL_API_SECRET must be at least 32 characters long. ` +
      `Current length: ${secret.length} characters. ` +
      `Generate with: openssl rand -hex 32`
    );
  }
}

/**
 * Validate that PROXY_TOKEN_SECRET is properly configured
 * Only required when PROXY_GATEWAY_ENABLED=true
 */
export function validateProxyTokenSecret(): void {
  const proxyEnabled = process.env.PROXY_GATEWAY_ENABLED === 'true';

  if (!proxyEnabled) {
    // Proxy disabled, no need to validate token secret
    return;
  }

  const secret = process.env.PROXY_TOKEN_SECRET;

  if (!secret) {
    throw new Error(
      'PROXY_TOKEN_SECRET must be set when PROXY_GATEWAY_ENABLED=true. ' +
      'Generate with: openssl rand -hex 32'
    );
  }

  if (secret.length < 32) {
    throw new Error(
      `PROXY_TOKEN_SECRET must be at least 32 characters long. ` +
      `Current length: ${secret.length} characters. ` +
      `Generate with: openssl rand -hex 32`
    );
  }
}

/**
 * Validate all required tunnel server secrets
 * Call this at server startup to ensure all secrets are properly configured
 */
export function validateTunnelServerSecrets(): void {
  validateInternalApiSecret();
  validateProxyTokenSecret();
}
