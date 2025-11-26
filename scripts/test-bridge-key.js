#!/usr/bin/env node
const http = require('http');
const fs = require('fs');

// Read session cookie from file
const cookieFile = fs.readFileSync('/tmp/cookies.txt', 'utf-8');
const sessionMatch = cookieFile.match(/better-auth\.session_token\s+(\S+)/);
const sessionToken = sessionMatch ? sessionMatch[1] : null;

if (!sessionToken) {
  console.error('No session token found in /tmp/cookies.txt');
  process.exit(1);
}

console.log('Session token prefix:', sessionToken.substring(0, 20) + '...');

// GET request to list keys
const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/keys',
  method: 'GET',
  headers: {
    'Cookie': `better-auth.session_token=${sessionToken}`,
  }
};

console.log('Listing bridge keys...');
console.log('URL:', `http://${options.hostname}:${options.port}${options.path}`);

const req = http.request(options, (res) => {
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
