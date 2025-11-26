#!/usr/bin/env node
/**
 * Find an available port starting from a preferred port.
 * Usage: node find-port.js [preferredPort] [maxAttempts]
 *
 * Outputs the available port to stdout.
 */

const net = require('net');

const preferredPort = parseInt(process.argv[2], 10) || 3000;
const maxAttempts = parseInt(process.argv[3], 10) || 10;

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(startPort, attempts) {
  for (let i = 0; i < attempts; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found in range ${startPort}-${startPort + attempts - 1}`);
}

findAvailablePort(preferredPort, maxAttempts)
  .then((port) => {
    console.log(port);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
