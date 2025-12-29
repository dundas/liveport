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
      const isDevelopment = process.env.NODE_ENV === 'development';

      console.error('❌ Secret validation failed:');
      console.error(error instanceof Error ? error.message : String(error));

      if (isDevelopment) {
        // In development, fail-fast to alert developers immediately
        console.error('\nApplication will not start until secrets are properly configured.');
        process.exit(1);
      } else {
        // In production, log warning but allow app to start to prevent outages
        console.error('\n⚠️  WARNING: Application is running with invalid configuration!');
        console.error('⚠️  This may cause runtime errors. Please fix secrets immediately.');
        console.error('⚠️  In production, misconfigured secrets should be fixed via deployment.');
      }
    }
  }
}
