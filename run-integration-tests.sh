#!/bin/bash
# WebSocket Integration Test Runner
#
# This script runs the full end-to-end integration test suite for WebSocket raw byte piping.
#
# It performs the following steps:
# 1. Starts local WebSocket echo server on port 3000
# 2. Verifies tunnel connection is active
# 3. Runs integration test suite
# 4. Cleans up processes
#
# Usage:
#   TUNNEL_URL=wss://your-subdomain.liveport.online ./run-integration-tests.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TUNNEL_URL="${TUNNEL_URL:-wss://simple-goose-uxu4.liveport.online/}"
WS_SERVER_PORT="${WS_SERVER_PORT:-3000}"

# Cleanup function
cleanup() {
  echo ""
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}Cleaning up processes...${NC}"
  echo -e "${BLUE}========================================${NC}"

  # Kill WebSocket server if we started it
  if [ ! -z "$WS_SERVER_PID" ]; then
    echo -e "${YELLOW}Stopping WebSocket server (PID: $WS_SERVER_PID)${NC}"
    kill $WS_SERVER_PID 2>/dev/null || true
  fi

  echo -e "${GREEN}Cleanup complete${NC}"
}

# Set up trap to cleanup on exit
trap cleanup EXIT

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}WebSocket Integration Test Runner${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${BLUE}Configuration:${NC}"
echo -e "  Tunnel URL: ${TUNNEL_URL}"
echo -e "  Local server port: ${WS_SERVER_PORT}"
echo ""

# Step 1: Check if local WebSocket server is already running
echo -e "${BLUE}Step 1: Checking local WebSocket server...${NC}"
if lsof -i :${WS_SERVER_PORT} | grep LISTEN > /dev/null 2>&1; then
  echo -e "${GREEN}✅ WebSocket server already running on port ${WS_SERVER_PORT}${NC}"
  WS_SERVER_ALREADY_RUNNING=true
else
  echo -e "${YELLOW}Starting local WebSocket server on port ${WS_SERVER_PORT}${NC}"
  node test-ws-server.mjs &
  WS_SERVER_PID=$!
  WS_SERVER_ALREADY_RUNNING=false

  # Wait for server to start
  sleep 2

  if lsof -i :${WS_SERVER_PORT} | grep LISTEN > /dev/null 2>&1; then
    echo -e "${GREEN}✅ WebSocket server started successfully (PID: $WS_SERVER_PID)${NC}"
  else
    echo -e "${RED}❌ Failed to start WebSocket server${NC}"
    exit 1
  fi
fi
echo ""

# Step 2: Verify tunnel connection
echo -e "${BLUE}Step 2: Verifying tunnel connection...${NC}"
echo -e "${YELLOW}Testing connection to ${TUNNEL_URL}${NC}"

# Simple connection test using curl to check if URL is reachable
if curl -s --head "${TUNNEL_URL/wss:/https:}" | grep "HTTP" > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Tunnel URL is reachable${NC}"
else
  echo -e "${YELLOW}⚠️  Warning: Could not verify tunnel URL (this is normal for WebSocket-only endpoints)${NC}"
fi
echo ""

# Step 3: Run integration tests
echo -e "${BLUE}Step 3: Running integration tests...${NC}"
echo ""

TUNNEL_URL=$TUNNEL_URL node test-websocket-integration.mjs
TEST_EXIT_CODE=$?

echo ""

# Step 4: Report results
if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}✅ All integration tests passed!${NC}"
  echo -e "${GREEN}========================================${NC}"
  exit 0
else
  echo -e "${RED}========================================${NC}"
  echo -e "${RED}❌ Integration tests failed${NC}"
  echo -e "${RED}========================================${NC}"
  exit 1
fi
