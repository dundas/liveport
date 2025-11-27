#!/usr/bin/env node
/**
 * Test script for mech-storage query endpoint
 *
 * Usage: Set environment variables and run:
 *   MECH_APPS_APP_ID=xxx MECH_APPS_API_KEY=xxx node scripts/test-query.js
 */
const https = require('https');

const APP_ID = process.env.MECH_APPS_APP_ID;
const API_KEY = process.env.MECH_APPS_API_KEY;
const BASE_URL = process.env.MECH_APPS_BASE_URL || 'storage.mechdna.net';

if (!APP_ID || !API_KEY) {
  console.error('Error: MECH_APPS_APP_ID and MECH_APPS_API_KEY environment variables required');
  console.error('Usage: MECH_APPS_APP_ID=xxx MECH_APPS_API_KEY=xxx node scripts/test-query.js');
  process.exit(1);
}

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
