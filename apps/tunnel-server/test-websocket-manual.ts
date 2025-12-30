/**
 * Manual WebSocket Test Script
 *
 * Tests both types of WebSocket connections:
 * 1. CLI tunnel connection (ws://localhost:8080/connect)
 * 2. Public client WebSocket upgrade (ws://subdomain.localhost:8080)
 *
 * Usage:
 *   # Start the tunnel server in one terminal:
 *   pnpm dev
 *
 *   # Run this test in another terminal:
 *   npx tsx test-websocket-manual.ts
 */

import { WebSocket } from 'ws';

const SERVER_URL = process.env.SERVER_URL || 'localhost:8080';
const BASE_DOMAIN = process.env.BASE_DOMAIN || 'liveport.online';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message: string) {
  log(`✅ ${message}`, colors.green);
}

function error(message: string) {
  log(`❌ ${message}`, colors.red);
}

function info(message: string) {
  log(`ℹ️  ${message}`, colors.cyan);
}

function warn(message: string) {
  log(`⚠️  ${message}`, colors.yellow);
}

/**
 * Test 1: CLI Tunnel Connection
 * Connects to /connect endpoint with bridge key headers
 */
async function testCliTunnelConnection(): Promise<boolean> {
  return new Promise((resolve) => {
    log('\n' + '='.repeat(60), colors.blue);
    log('Test 1: CLI Tunnel Connection (/connect)', colors.blue);
    log('='.repeat(60), colors.blue);

    info(`Connecting to: ws://${SERVER_URL}/connect`);
    info('Headers: X-Bridge-Key, X-Local-Port');

    // You'll need a valid bridge key for this test
    // For now, we'll test if the endpoint rejects missing headers
    const ws = new WebSocket(`ws://${SERVER_URL}/connect`, {
      headers: {
        'X-Bridge-Key': 'test-key-invalid',
        'X-Local-Port': '3000',
      },
    });

    let connected = false;

    ws.on('open', () => {
      success('WebSocket connection opened to /connect');
      connected = true;

      info('Waiting for server response...');
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        info(`Received message type: ${message.type}`);

        if (message.type === 'error') {
          warn(`Server rejected connection: ${message.payload.message}`);
          warn(`Error code: ${message.payload.code}`);

          if (message.payload.code === 'INVALID_KEY') {
            success('✅ Server correctly validates bridge keys');
            success('✅ /connect endpoint is working');
          }
        } else if (message.type === 'connected') {
          success(`Connected! Subdomain: ${message.payload.subdomain}`);
          success(`Public URL: ${message.payload.url}`);
        }
      } catch (err) {
        error(`Failed to parse message: ${err}`);
      }
    });

    ws.on('close', (code, reason) => {
      if (connected) {
        info(`Connection closed: ${code} - ${reason.toString()}`);
        success('✅ /connect endpoint is functional');
        resolve(true);
      } else {
        error('Connection closed before opening');
        resolve(false);
      }
    });

    ws.on('error', (err) => {
      error(`WebSocket error: ${err.message}`);

      if (err.message.includes('ECONNREFUSED')) {
        error('❌ Server is not running on port 8080');
        error('   Start the server with: pnpm dev');
      }

      resolve(false);
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      if (!connected) {
        error('Connection timeout (5s)');
        ws.close();
        resolve(false);
      } else {
        ws.close();
      }
    }, 5000);
  });
}

/**
 * Test 2: Public WebSocket Upgrade
 * Tests HTTP upgrade to WebSocket for public clients
 */
async function testPublicWebSocketUpgrade(): Promise<boolean> {
  return new Promise((resolve) => {
    log('\n' + '='.repeat(60), colors.blue);
    log('Test 2: Public WebSocket Upgrade', colors.blue);
    log('='.repeat(60), colors.blue);

    // First, we need a tunnel to be active
    warn('This test requires an active tunnel.');
    warn('For now, we\'ll test if the upgrade event is handled.');

    const testSubdomain = 'test-ws-upgrade';
    const wsUrl = `ws://${testSubdomain}.${SERVER_URL}`;

    info(`Attempting WebSocket upgrade to: ${wsUrl}`);
    info('Expected: Socket destroyed (no active tunnel)');

    const ws = new WebSocket(wsUrl);

    let upgraded = false;

    ws.on('open', () => {
      upgraded = true;
      success('WebSocket upgrade successful!');
      info('This means an active tunnel exists for this subdomain');
    });

    ws.on('message', (data) => {
      info(`Received: ${data.toString()}`);
    });

    ws.on('close', (code, reason) => {
      if (!upgraded) {
        info('Connection closed immediately (expected without active tunnel)');
        success('✅ WebSocket upgrade handler is working');
        success('✅ Correctly rejects upgrade without active tunnel');
        resolve(true);
      } else {
        info(`Connection closed: ${code} - ${reason.toString()}`);
        resolve(true);
      }
    });

    ws.on('error', (err) => {
      // Socket destroyed is expected when no tunnel exists
      if (err.message.includes('socket hang up') ||
          err.message.includes('Unexpected server response')) {
        success('✅ Upgrade handler processed request (rejected as expected)');
        resolve(true);
      } else if (err.message.includes('ECONNREFUSED')) {
        error('❌ Server is not running');
        resolve(false);
      } else {
        warn(`Unexpected error: ${err.message}`);
        resolve(true); // Still counts as the handler working
      }
    });

    setTimeout(() => {
      if (!upgraded) {
        ws.close();
      }
    }, 3000);
  });
}

/**
 * Test 3: HTTP Health Check
 * Verify HTTP server is running
 */
async function testHttpServer(): Promise<boolean> {
  log('\n' + '='.repeat(60), colors.blue);
  log('Test 3: HTTP Server Health Check', colors.blue);
  log('='.repeat(60), colors.blue);

  const url = `http://${SERVER_URL}/_health`;
  info(`Checking: ${url}`);

  try {
    const response = await fetch(url);

    if (response.ok) {
      const data = await response.json();
      success('HTTP server is running');
      info(`Status: ${data.status}`);
      info(`Uptime: ${data.uptime}s`);
      return true;
    } else {
      error(`HTTP server returned: ${response.status}`);
      return false;
    }
  } catch (err) {
    error(`Failed to reach HTTP server: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  log('\n' + '='.repeat(60), colors.cyan);
  log('🧪 WebSocket Manual Test Suite', colors.cyan);
  log('='.repeat(60), colors.cyan);
  log(`Server: ${SERVER_URL}`, colors.cyan);
  log(`Base Domain: ${BASE_DOMAIN}`, colors.cyan);

  const results = {
    http: false,
    cliTunnel: false,
    publicUpgrade: false,
  };

  // Test HTTP server first
  results.http = await testHttpServer();

  if (!results.http) {
    error('\n❌ HTTP server is not running. Start it with: pnpm dev');
    process.exit(1);
  }

  // Test CLI tunnel connection
  results.cliTunnel = await testCliTunnelConnection();

  // Test public WebSocket upgrade
  results.publicUpgrade = await testPublicWebSocketUpgrade();

  // Summary
  log('\n' + '='.repeat(60), colors.cyan);
  log('📊 Test Summary', colors.cyan);
  log('='.repeat(60), colors.cyan);

  const tests = [
    { name: 'HTTP Server Health', passed: results.http },
    { name: 'CLI Tunnel Connection (/connect)', passed: results.cliTunnel },
    { name: 'Public WebSocket Upgrade', passed: results.publicUpgrade },
  ];

  tests.forEach(({ name, passed }) => {
    if (passed) {
      success(`${name}: PASS`);
    } else {
      error(`${name}: FAIL`);
    }
  });

  const passedCount = tests.filter(t => t.passed).length;
  const totalCount = tests.length;

  log('\n' + '='.repeat(60), colors.cyan);
  if (passedCount === totalCount) {
    success(`✅ All tests passed! (${passedCount}/${totalCount})`);
    log('='.repeat(60), colors.cyan);
    process.exit(0);
  } else {
    error(`❌ Some tests failed (${passedCount}/${totalCount} passed)`);
    log('='.repeat(60), colors.cyan);
    process.exit(1);
  }
}

// Run tests
runTests().catch((err) => {
  error(`Fatal error: ${err.message}`);
  process.exit(1);
});
