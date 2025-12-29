/**
 * Next.js Instrumentation
 *
 * This file runs once at server startup (before any requests are handled)
 * Perfect for validating environment variables and secrets
 */

export async function register() {
  // Only run on server (not in build or edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateAllSecrets } = await import('./src/lib/validate-secrets');

    try {
      console.log('🔐 Validating secrets...');
      validateAllSecrets();
      console.log('✅ All secrets validated successfully');
    } catch (error) {
      console.error('❌ Secret validation failed:');
      console.error(error instanceof Error ? error.message : String(error));
      console.error('\nApplication will not start until secrets are properly configured.');
      process.exit(1);
    }
  }
}
