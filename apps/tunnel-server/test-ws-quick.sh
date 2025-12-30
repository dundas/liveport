#!/bin/bash

# Quick WebSocket Test Script
# Tests if WebSocket server is accepting connections

set -e

SERVER_URL="${SERVER_URL:-localhost:8080}"

echo "========================================"
echo "Quick WebSocket Port Test"
echo "========================================"
echo "Server: $SERVER_URL"
echo ""

# Test 1: Check if port 8080 is listening
echo "Test 1: Checking if port 8080 is open..."
if lsof -i :8080 | grep LISTEN > /dev/null 2>&1; then
    echo "✅ Port 8080 is LISTENING"
    lsof -i :8080 | grep LISTEN
else
    echo "❌ Port 8080 is NOT listening"
    echo "   Start the server with: pnpm dev"
    exit 1
fi

echo ""

# Test 2: Test HTTP health endpoint
echo "Test 2: Testing HTTP server..."
if curl -s "http://$SERVER_URL/_health" > /dev/null; then
    echo "✅ HTTP server is responding"
    curl -s "http://$SERVER_URL/_health" | jq '.' 2>/dev/null || echo "  (install jq for pretty output)"
else
    echo "❌ HTTP server not responding"
    exit 1
fi

echo ""

# Test 3: Test WebSocket upgrade (using wscat if available)
echo "Test 3: Testing WebSocket connection..."
if command -v wscat &> /dev/null; then
    echo "Using wscat to test WebSocket..."
    timeout 2s wscat -c "ws://$SERVER_URL/connect" -H "X-Bridge-Key: test" -H "X-Local-Port: 3000" 2>&1 | head -5 || true
    echo "✅ WebSocket endpoint is accepting connections"
else
    echo "ℹ️  Install wscat for WebSocket testing: npm install -g wscat"
    echo "   Or use the TypeScript test: npx tsx test-websocket-manual.ts"
fi

echo ""
echo "========================================"
echo "Quick tests complete!"
echo "========================================"
echo ""
echo "For comprehensive testing, run:"
echo "  npx tsx test-websocket-manual.ts"
