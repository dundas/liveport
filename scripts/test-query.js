#!/usr/bin/env node
const https = require('https');

const APP_ID = 'app_eb320de3-41b0-416c-8427-e61c48429efc';
const API_KEY = 'ak_0d10730c-b15b-4179-aa20-55e5a3448d3a';
const BASE_URL = 'storage.mechdna.net';

// Test GET records from bridge_keys table
const options = {
  hostname: BASE_URL,
  port: 443,
  path: `/api/apps/${APP_ID}/postgresql/tables/bridge_keys?limit=10`,
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
    'X-App-ID': APP_ID,
  }
};

console.log('Testing query endpoint:', options.path);

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', body);
    try {
      console.log('Parsed:', JSON.stringify(JSON.parse(body), null, 2));
    } catch (e) {}
  });
});

req.on('error', (e) => console.error('Error:', e.message));
req.end();
