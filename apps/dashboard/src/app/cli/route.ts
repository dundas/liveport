/**
 * CLI Install Script Route
 * 
 * Serves the install script at /cli for easy installation:
 *   curl -fsSL https://liveport.dev/cli | sh
 * 
 * Also available at /install.sh (static file)
 */

import { NextResponse } from "next/server";

const INSTALL_SCRIPT = `#!/bin/bash
# LivePort CLI Installer
# Usage: curl -fsSL https://liveport.dev/cli | sh
#
# This script installs the LivePort CLI for creating secure localhost tunnels.

set -e

# Colors for output
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
BLUE='\\033[0;34m'
CYAN='\\033[0;36m'
NC='\\033[0m' # No Color
BOLD='\\033[1m'

# LivePort ASCII art
print_banner() {
    echo ""
    echo -e "\${CYAN}"
    echo "  ╦  ╦╦  ╦╔═╗╔═╗╔═╗╦═╗╔╦╗"
    echo "  ║  ║╚╗╔╝║╣ ╠═╝║ ║╠╦╝ ║ "
    echo "  ╩═╝╩ ╚╝ ╚═╝╩  ╚═╝╩╚═ ╩ "
    echo -e "\${NC}"
    echo -e "  \${BOLD}Secure localhost tunnels for AI agents\${NC}"
    echo ""
}

# Detect OS and architecture
detect_platform() {
    OS="$(uname -s)"
    ARCH="$(uname -m)"

    case "$OS" in
        Linux*)     PLATFORM="linux" ;;
        Darwin*)    PLATFORM="darwin" ;;
        MINGW*|MSYS*|CYGWIN*) PLATFORM="windows" ;;
        *)          
            echo -e "\${RED}Error: Unsupported operating system: $OS\${NC}"
            exit 1
            ;;
    esac

    case "$ARCH" in
        x86_64|amd64)   ARCH="x64" ;;
        arm64|aarch64)  ARCH="arm64" ;;
        *)              
            echo -e "\${RED}Error: Unsupported architecture: $ARCH\${NC}"
            exit 1
            ;;
    esac

    echo -e "\${BLUE}Detected platform:\${NC} $PLATFORM-$ARCH"
}

# Check for required tools
check_requirements() {
    if ! command -v node &> /dev/null; then
        echo -e "\${YELLOW}Node.js not found. Installing via npm requires Node.js.\${NC}"
        echo ""
        echo -e "\${BLUE}Please install Node.js from:\${NC} https://nodejs.org/"
        echo ""
        echo "Or use a version manager like nvm:"
        echo "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
        echo "  nvm install --lts"
        echo ""
        exit 1
    fi

    echo -e "\${GREEN}✓\${NC} Node.js found: $(node --version)"
}

# Install via npm/pnpm
install_cli() {
    echo ""
    echo -e "\${BLUE}Installing LivePort CLI...\${NC}"
    echo ""

    # Check if pnpm is available, prefer it
    if command -v pnpm &> /dev/null; then
        echo -e "\${CYAN}Using pnpm...\${NC}"
        pnpm add -g @liveport/cli
    elif command -v npm &> /dev/null; then
        echo -e "\${CYAN}Using npm...\${NC}"
        npm install -g @liveport/cli
    else
        echo -e "\${RED}Error: Neither npm nor pnpm found\${NC}"
        exit 1
    fi
}

# Verify installation
verify_installation() {
    echo ""
    echo -e "\${BLUE}Verifying installation...\${NC}"

    if command -v liveport &> /dev/null; then
        local version=$(liveport --version 2>/dev/null || echo "installed")
        echo -e "\${GREEN}✓ LivePort CLI installed successfully!\${NC}"
        echo ""
        echo -e "  Version: \${BOLD}$version\${NC}"
        return 0
    else
        # Try to find it in npm global bin
        local npm_bin=$(npm bin -g 2>/dev/null)
        if [ -f "$npm_bin/liveport" ]; then
            echo -e "\${GREEN}✓ LivePort CLI installed!\${NC}"
            echo -e "\${YELLOW}Note: You may need to add npm global bin to your PATH:\${NC}"
            echo "  export PATH=\"\\$PATH:$npm_bin\""
            return 0
        fi
        
        echo -e "\${YELLOW}Installation completed but 'liveport' command not found in PATH.\${NC}"
        echo "  Try restarting your terminal or running: hash -r"
        return 0
    fi
}

# Print next steps
print_next_steps() {
    echo ""
    echo -e "\${BOLD}\${GREEN}Installation complete!\${NC}"
    echo ""
    echo -e "\${BOLD}Quick Start:\${NC}"
    echo ""
    echo "  1. Get a bridge key from https://liveport.dev/keys"
    echo ""
    echo "  2. Connect your local server:"
    echo -e "     \${CYAN}liveport connect 3000 --key YOUR_BRIDGE_KEY\${NC}"
    echo ""
    echo "  3. Your tunnel URL will be displayed"
    echo "     (e.g., https://abc123.liveport.online)"
    echo ""
    echo -e "\${BOLD}Documentation:\${NC} https://liveport.dev/docs"
    echo -e "\${BOLD}Dashboard:\${NC}     https://liveport.dev/dashboard"
    echo ""
}

# Main installation flow
main() {
    print_banner
    detect_platform
    echo ""
    check_requirements
    install_cli
    verify_installation
    print_next_steps
}

# Run main
main
`;

export async function GET() {
  return new NextResponse(INSTALL_SCRIPT, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": "inline; filename=install.sh",
      "Cache-Control": "public, max-age=300", // Cache for 5 minutes
    },
  });
}
