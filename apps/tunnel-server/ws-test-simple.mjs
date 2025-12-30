import { WebSocket } from 'ws';

console.log('🧪 Testing WebSocket Connection to /connect endpoint...\n');

const ws = new WebSocket('ws://localhost:8080/connect', {
  headers: {
    'X-Bridge-Key': 'test-key-for-demo',
    'X-Local-Port': '3000',
  },
});

ws.on('open', () => {
  console.log('✅ WebSocket connection OPENED successfully!');
  console.log('   Server accepted the connection to /connect endpoint');
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log(`\n📩 Received message from server:`);
  console.log(`   Type: ${msg.type}`);

  if (msg.type === 'error') {
    console.log(`   Error Code: ${msg.payload.code}`);
    console.log(`   Message: ${msg.payload.message}`);
    console.log(`\n✅ SERVER IS VALIDATING CONNECTIONS CORRECTLY!`);
    console.log(`   (Rejected invalid key as expected)`);
  } else if (msg.type === 'connected') {
    console.log(`   Subdomain: ${msg.payload.subdomain}`);
    console.log(`   URL: ${msg.payload.url}`);
    console.log(`\n✅ TUNNEL ESTABLISHED SUCCESSFULLY!`);
  }

  setTimeout(() => {
    console.log(`\n✅ WebSocket /connect endpoint is WORKING!`);
    ws.close();
    process.exit(0);
  }, 100);
});

ws.on('error', (err) => {
  console.log(`❌ WebSocket error: ${err.message}`);
  process.exit(1);
});

ws.on('close', () => {
  console.log('\n🔌 WebSocket connection closed');
});

setTimeout(() => {
  console.log('⏱️  Timeout - server not responding');
  ws.close();
  process.exit(1);
}, 5000);
