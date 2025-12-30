#!/usr/bin/env node
/**
 * WebSocket Integration Test
 *
 * End-to-end integration test for WebSocket raw byte piping functionality.
 *
 * This test validates:
 * 1. Text message echo (basic functionality)
 * 2. Binary data echo (preserves exact bytes)
 * 3. Large message handling (1MB payload)
 * 4. Bidirectional data flow (client→server and server→client)
 * 5. No RSV1 errors (raw byte piping preserves WebSocket frame metadata)
 *
 * Prerequisites:
 * - Local WebSocket server running on port 3000 (use test-ws-server.mjs)
 * - LivePort CLI connected to tunnel server
 * - Tunnel server accessible at TUNNEL_URL
 *
 * Usage:
 *   TUNNEL_URL=wss://your-subdomain.liveport.online node test-websocket-integration.mjs
 */

import WebSocket from 'ws';
import { randomBytes } from 'crypto';

// Configuration
const TUNNEL_URL = process.env.TUNNEL_URL || 'wss://simple-goose-uxu4.liveport.online/';
const TEST_TIMEOUT = 30000; // 30 seconds

// Test results
const results = {
  textEcho: null,
  binaryEcho: null,
  largeMessage: null,
  bidirectional: null,
  noRSV1Errors: null,
};

let testsPassed = 0;
let testsFailed = 0;

// Utility functions
function log(emoji, message) {
  console.log(`${emoji} ${message}`);
}

function pass(testName, message) {
  results[testName] = true;
  testsPassed++;
  log('✅', `PASS: ${message}`);
}

function fail(testName, message) {
  results[testName] = false;
  testsFailed++;
  log('❌', `FAIL: ${message}`);
}

function info(message) {
  log('ℹ️ ', message);
}

function createWebSocket() {
  return new WebSocket(TUNNEL_URL, {
    perMessageDeflate: false  // Disable compression to test raw byte piping
  });
}

// Test 1: Text message echo
async function testTextEcho() {
  return new Promise((resolve, reject) => {
    info('Test 1: Text message echo');

    const ws = createWebSocket();
    const testMessage = 'Hello from integration test!';
    let welcomeReceived = false;

    ws.on('open', () => {
      info(`Connected to ${TUNNEL_URL}`);
      ws.send(testMessage);
    });

    ws.on('message', (data) => {
      const message = data.toString();

      // Skip welcome message
      if (message === 'Welcome to WebSocket server!') {
        welcomeReceived = true;
        return;
      }

      // Verify echo
      if (message === `Echo: ${testMessage}`) {
        pass('textEcho', `Text echo successful: "${testMessage}" → "${message}"`);
        ws.close();
        resolve();
      } else {
        fail('textEcho', `Unexpected message: expected "Echo: ${testMessage}", got "${message}"`);
        ws.close();
        reject(new Error('Text echo failed'));
      }
    });

    ws.on('error', (err) => {
      fail('textEcho', `WebSocket error: ${err.message}`);
      reject(err);
    });

    ws.on('close', () => {
      if (results.textEcho === null) {
        fail('textEcho', 'Connection closed before test completed');
        reject(new Error('Connection closed prematurely'));
      }
    });

    setTimeout(() => {
      if (results.textEcho === null) {
        fail('textEcho', 'Test timeout');
        ws.close();
        reject(new Error('Timeout'));
      }
    }, 10000);
  });
}

// Test 2: Binary data echo
async function testBinaryEcho() {
  return new Promise((resolve, reject) => {
    info('Test 2: Binary data echo');

    const ws = createWebSocket();
    const binaryData = Buffer.from([0x01, 0x02, 0x03, 0x04, 0xff, 0xfe, 0xfd]);
    let welcomeReceived = false;
    let echoReceived = false;

    ws.on('open', () => {
      ws.send(binaryData);
    });

    ws.on('message', (data) => {
      // Skip welcome message
      if (data.toString() === 'Welcome to WebSocket server!') {
        welcomeReceived = true;
        return;
      }

      // Skip if already received echo
      if (echoReceived) return;

      // Verify echo (server prepends "Echo: " to binary data)
      const received = Buffer.from(data);
      const expected = Buffer.concat([Buffer.from('Echo: '), binaryData]);

      if (received.equals(expected)) {
        pass('binaryEcho', `Binary echo successful: [${binaryData.join(', ')}]`);
        echoReceived = true;
        ws.close();
        resolve();
      } else {
        fail('binaryEcho', `Binary mismatch: expected [${expected.join(', ')}], got [${received.join(', ')}]`);
        ws.close();
        reject(new Error('Binary echo failed'));
      }
    });

    ws.on('error', (err) => {
      fail('binaryEcho', `WebSocket error: ${err.message}`);
      reject(err);
    });

    ws.on('close', () => {
      if (results.binaryEcho === null) {
        fail('binaryEcho', 'Connection closed before test completed');
        reject(new Error('Connection closed prematurely'));
      }
    });

    setTimeout(() => {
      if (results.binaryEcho === null) {
        fail('binaryEcho', 'Test timeout');
        ws.close();
        reject(new Error('Timeout'));
      }
    }, 10000);
  });
}

// Test 3: Large message (1MB)
async function testLargeMessage() {
  return new Promise((resolve, reject) => {
    info('Test 3: Large message (1MB)');

    const ws = createWebSocket();
    const largeMessage = randomBytes(1024 * 1024).toString('base64'); // 1MB base64-encoded
    let welcomeReceived = false;
    let echoReceived = false;

    ws.on('open', () => {
      info(`Sending ${(largeMessage.length / 1024 / 1024).toFixed(2)}MB message...`);
      ws.send(largeMessage);
    });

    ws.on('message', (data) => {
      // Skip welcome message
      if (data.toString() === 'Welcome to WebSocket server!') {
        welcomeReceived = true;
        return;
      }

      // Skip if already received echo
      if (echoReceived) return;

      const received = data.toString();
      const expected = `Echo: ${largeMessage}`;

      if (received === expected) {
        pass('largeMessage', `Large message echo successful: ${(received.length / 1024 / 1024).toFixed(2)}MB`);
        echoReceived = true;
        ws.close();
        resolve();
      } else {
        fail('largeMessage', `Large message mismatch: length expected ${expected.length}, got ${received.length}`);
        ws.close();
        reject(new Error('Large message echo failed'));
      }
    });

    ws.on('error', (err) => {
      fail('largeMessage', `WebSocket error: ${err.message}`);
      reject(err);
    });

    ws.on('close', () => {
      if (results.largeMessage === null) {
        fail('largeMessage', 'Connection closed before test completed');
        reject(new Error('Connection closed prematurely'));
      }
    });

    setTimeout(() => {
      if (results.largeMessage === null) {
        fail('largeMessage', 'Test timeout');
        ws.close();
        reject(new Error('Timeout'));
      }
    }, 20000); // Longer timeout for large messages
  });
}

// Test 4: Bidirectional data flow
async function testBidirectional() {
  return new Promise((resolve, reject) => {
    info('Test 4: Bidirectional data flow');

    const ws = createWebSocket();
    let welcomeReceived = false;
    let clientToServerReceived = false;
    let serverToClientReceived = false;

    ws.on('open', () => {
      // Send message from client to server
      ws.send('Client to server message');
    });

    ws.on('message', (data) => {
      const message = data.toString();

      // Message 1: Welcome from server
      if (message === 'Welcome to WebSocket server!') {
        welcomeReceived = true;
        serverToClientReceived = true;
        info('Received welcome message from server (server→client)');
        return;
      }

      // Message 2: Echo from server
      if (message === 'Echo: Client to server message') {
        clientToServerReceived = true;
        info('Received echo from server (client→server→client)');

        // Check if both directions work
        if (serverToClientReceived && clientToServerReceived) {
          pass('bidirectional', 'Bidirectional flow successful');
          ws.close();
          resolve();
        }
      }
    });

    ws.on('error', (err) => {
      fail('bidirectional', `WebSocket error: ${err.message}`);
      reject(err);
    });

    ws.on('close', () => {
      if (results.bidirectional === null) {
        fail('bidirectional', 'Connection closed before test completed');
        reject(new Error('Connection closed prematurely'));
      }
    });

    setTimeout(() => {
      if (results.bidirectional === null) {
        fail('bidirectional', 'Test timeout');
        ws.close();
        reject(new Error('Timeout'));
      }
    }, 10000);
  });
}

// Test 5: No RSV1 errors (verify raw byte piping works)
async function testNoRSV1Errors() {
  return new Promise((resolve, reject) => {
    info('Test 5: Verify no RSV1 errors in logs');

    // This test sends a message and checks for successful echo
    // If raw byte piping is working correctly, there should be no RSV1 errors
    // (RSV1 errors occur when WebSocket frames are parsed incorrectly)

    const ws = createWebSocket();
    const testMessage = 'RSV1 test message';
    let welcomeReceived = false;

    ws.on('open', () => {
      ws.send(testMessage);
    });

    ws.on('message', (data) => {
      const message = data.toString();

      // Skip welcome message
      if (message === 'Welcome to WebSocket server!') {
        welcomeReceived = true;
        return;
      }

      // Verify echo
      if (message === `Echo: ${testMessage}`) {
        pass('noRSV1Errors', 'No RSV1 errors detected (raw byte piping working correctly)');
        ws.close();
        resolve();
      }
    });

    ws.on('error', (err) => {
      // Check if error is related to RSV1
      if (err.message.includes('RSV1') || err.message.includes('RSV')) {
        fail('noRSV1Errors', `RSV1 error detected: ${err.message}`);
        reject(err);
      } else {
        fail('noRSV1Errors', `WebSocket error: ${err.message}`);
        reject(err);
      }
    });

    ws.on('close', () => {
      if (results.noRSV1Errors === null) {
        fail('noRSV1Errors', 'Connection closed before test completed');
        reject(new Error('Connection closed prematurely'));
      }
    });

    setTimeout(() => {
      if (results.noRSV1Errors === null) {
        fail('noRSV1Errors', 'Test timeout');
        ws.close();
        reject(new Error('Timeout'));
      }
    }, 10000);
  });
}

// Main test runner
async function runTests() {
  console.log('========================================');
  console.log('WebSocket Integration Tests');
  console.log('========================================');
  console.log('');
  info(`Tunnel URL: ${TUNNEL_URL}`);
  info(`Test timeout: ${TEST_TIMEOUT}ms`);
  console.log('');

  try {
    // Run tests sequentially
    await testTextEcho();
    console.log('');

    await testBinaryEcho();
    console.log('');

    await testLargeMessage();
    console.log('');

    await testBidirectional();
    console.log('');

    await testNoRSV1Errors();
    console.log('');

    // Print summary
    console.log('========================================');
    console.log('Test Results');
    console.log('========================================');
    console.log('');

    Object.entries(results).forEach(([name, result]) => {
      const status = result === true ? '✅ PASS' : result === false ? '❌ FAIL' : '⏭️  SKIP';
      console.log(`${status} - ${name}`);
    });

    console.log('');
    console.log(`Total: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('');

    if (testsFailed === 0) {
      log('🎉', 'All tests passed!');
      process.exit(0);
    } else {
      log('💥', `${testsFailed} test(s) failed`);
      process.exit(1);
    }

  } catch (err) {
    console.error('');
    console.error('========================================');
    console.error('Test Suite Failed');
    console.error('========================================');
    console.error('');
    console.error(err);
    process.exit(1);
  }
}

// Run tests
runTests();
