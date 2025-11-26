#!/usr/bin/env node
/**
 * Test script for tunnel server WebSocket connection
 */
import WebSocket from 'ws';

const TUNNEL_SERVER = 'ws://localhost:8080/connect';
const BRIDGE_KEY = 'lpk_l_Ah57qFPpiT6_ehQm0KuSRD11lYfxHx'; // Test key we created
const LOCAL_PORT = 3000;

console.log('Testing tunnel server connection...');
console.log('Server:', TUNNEL_SERVER);
console.log('Bridge Key:', BRIDGE_KEY.substring(0, 20) + '...');
console.log('Local Port:', LOCAL_PORT);

const ws = new WebSocket(TUNNEL_SERVER, {
  headers: {
    'X-Bridge-Key': BRIDGE_KEY,
    'X-Local-Port': String(LOCAL_PORT),
  },
});

ws.on('open', () => {
  console.log('\n[CONNECTED] WebSocket connection established!');
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    console.log('\n[MESSAGE] Received:', JSON.stringify(msg, null, 2));

    if (msg.type === 'connected') {
      console.log('\n=== TUNNEL ESTABLISHED ===');
      console.log('Subdomain:', msg.subdomain);
      console.log('Public URL:', msg.url);
      console.log('===========================');

      // Close after success
      setTimeout(() => {
        console.log('\nTest successful! Closing connection...');
        ws.close();
        process.exit(0);
      }, 2000);
    }
  } catch (e) {
    console.log('[MESSAGE] Raw:', data.toString());
  }
});

ws.on('error', (err) => {
  console.error('\n[ERROR]', err.message);
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log('\n[CLOSED] Code:', code, 'Reason:', reason.toString());
});

// Timeout after 10 seconds
setTimeout(() => {
  console.error('\n[TIMEOUT] Test timed out');
  ws.close();
  process.exit(1);
}, 10000);
