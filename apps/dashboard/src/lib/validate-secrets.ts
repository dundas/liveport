/**
 * Secret Validation Utilities
 *
 * Validates required secrets at startup to fail fast if misconfigured.
 */

/**
 * Validate that INTERNAL_API_SECRET is properly configured
 * Should be called early in app initialization
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
 * Validate all required secrets
 * Call this at app startup to ensure all secrets are properly configured
 */
export function validateAllSecrets(): void {
  validateInternalApiSecret();

  // Add more secret validations here as needed
  // Example:
  // validateBetterAuthSecret();
  // validateStripeSecret();
}
